import { jsPDF } from 'jspdf'
import { useEffect, useState } from 'react'
import {
    apiBaseUrl,
    currencyFormatter,
    formatDateOnly,
    formatDateTime,
    getDateInputBoundary,
    getDateInputValue,
    getPaymentMethodLabel,
    getRefundTypeLabel,
    isBalanceSheet,
    isExpenses,
    isPaidOrders,
    type BalanceSheet,
    type BillRefund,
    type Expense,
    type PaidOrder,
} from './financial'
import { useRestaurantConfiguration } from './RestaurantConfiguration'

type ExportMessage = {
    text: string
    tone: 'error' | 'success'
}

type ExportDateRange = {
    end: Date | null
    filenameSuffix: string
    label: string
    start: Date | null
}

type RefundEntry = {
    billNumber: string
    refund: BillRefund
    tableName: string
}

function dateInputToDate(value: string, endOfDay = false) {
    return getDateInputBoundary(value, endOfDay) ?? new Date(Number.NaN)
}

function getCurrentDateEnd() {
    const currentDate = getDateInputValue(new Date())
    return currentDate === null ? new Date(Number.NaN) : dateInputToDate(currentDate, true)
}

function getRestaurantFileName(restaurantName: string) {
    return restaurantName
        .toLocaleLowerCase('en-IN')
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'restaurant'
}

function formatDateInput(value: string) {
    return formatDateOnly(value)
}

function getExportDateRange(fromDate: string, toDate: string): ExportDateRange {
    if (fromDate && toDate) {
        return {
            end: dateInputToDate(toDate, true),
            filenameSuffix: `${fromDate}-to-${toDate}`,
            label: `Period: ${formatDateInput(fromDate)} to ${formatDateInput(toDate)}`,
            start: dateInputToDate(fromDate),
        }
    }

    if (fromDate) {
        return {
            end: getCurrentDateEnd(),
            filenameSuffix: `from-${fromDate}-to-current-date`,
            label: `Period: ${formatDateInput(fromDate)} to current date`,
            start: dateInputToDate(fromDate),
        }
    }

    if (toDate) {
        return {
            end: dateInputToDate(toDate, true),
            filenameSuffix: `start-to-${toDate}`,
            label: `Period: Start to ${formatDateInput(toDate)}`,
            start: null,
        }
    }

    return {
        end: null,
        filenameSuffix: 'all-records',
        label: 'Period: Start to end',
        start: null,
    }
}

function isWithinDateRange(value: string, dateRange: ExportDateRange) {
    const timestamp = new Date(value).getTime()
    return !Number.isNaN(timestamp)
        && (dateRange.start === null || timestamp >= dateRange.start.getTime())
        && (dateRange.end === null || timestamp <= dateRange.end.getTime())
}

function getRefundEntries(paidOrders: PaidOrder[]): RefundEntry[] {
    return paidOrders.flatMap((paidOrder) => paidOrder.refund === null
        ? []
        : [{ billNumber: paidOrder.billNumber, refund: paidOrder.refund, tableName: paidOrder.tableName }])
}

function BalanceSheetManager() {
    const { restaurantName } = useRestaurantConfiguration()
    const [balanceSheet, setBalanceSheet] = useState<BalanceSheet | null>(null)
    const [paidOrders, setPaidOrders] = useState<PaidOrder[]>([])
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [exportMessage, setExportMessage] = useState<ExportMessage | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        const controller = new AbortController()

        async function loadBalanceSheet() {
            try {
                const [balanceResponse, historyResponse, expensesResponse] = await Promise.all([
                    fetch(`${apiBaseUrl}/api/balance-sheet`, { credentials: 'include', signal: controller.signal }),
                    fetch(`${apiBaseUrl}/api/history`, { credentials: 'include', signal: controller.signal }),
                    fetch(`${apiBaseUrl}/api/expenses`, { credentials: 'include', signal: controller.signal }),
                ])

                if (!balanceResponse.ok || !historyResponse.ok || !expensesResponse.ok) {
                    throw new Error('Balance sheet load failed')
                }

                const [balance, orders, savedExpenses] = await Promise.all([
                    balanceResponse.json() as Promise<unknown>,
                    historyResponse.json() as Promise<unknown>,
                    expensesResponse.json() as Promise<unknown>,
                ])

                if (!isBalanceSheet(balance) || !isPaidOrders(orders) || !isExpenses(savedExpenses)) {
                    throw new Error('Balance sheet response has an unexpected shape')
                }

                setBalanceSheet(balance)
                setPaidOrders(orders)
                setExpenses(savedExpenses)
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setErrorMessage('We could not load the balance sheet. Please try again.')
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false)
                }
            }
        }

        void loadBalanceSheet()

        return () => controller.abort()
    }, [])

    function exportBalanceSheet() {
        if (fromDate && toDate && fromDate > toDate) {
            setExportMessage({ text: 'The From date must be before or the same as the To date.', tone: 'error' })
            return
        }

        const dateRange = getExportDateRange(fromDate, toDate)
        const exportedPaidOrders = paidOrders.filter((paidOrder) => isWithinDateRange(paidOrder.paidAt, dateRange))
        const exportedRefunds = getRefundEntries(paidOrders)
            .filter((refundEntry) => isWithinDateRange(refundEntry.refund.refundedAt, dateRange))
        const exportedExpenses = expenses.filter((expense) => isWithinDateRange(expense.createdAt, dateRange))
        const revenue = exportedPaidOrders.reduce((total, paidOrder) => total + paidOrder.total, 0)
        const refundTotal = exportedRefunds.reduce((total, refundEntry) => total + refundEntry.refund.amount, 0)
        const expenseTotal = exportedExpenses.reduce((total, expense) => total + expense.amount, 0)
        const profits = revenue - refundTotal - expenseTotal
        const report = new jsPDF({ format: 'a4', unit: 'pt' })

        report.setFontSize(20)
        report.text(restaurantName, 48, 56)
        report.setFontSize(14)
        report.text('Balance sheet', 48, 82)
        report.setFontSize(10)
        report.text(dateRange.label, 48, 102)

        let cursorY = 136
        const addPageWhenNeeded = (spaceRequired = 24) => {
            if (cursorY + spaceRequired <= 752) return
            report.addPage()
            cursorY = 56
        }
        const addSection = (title: string) => {
            addPageWhenNeeded()
            report.setFontSize(12)
            report.text(title, 48, cursorY)
            cursorY += 22
        }
        const addRow = (description: string, amount: string) => {
            const descriptionLines = report.splitTextToSize(description, 380)
            addPageWhenNeeded(descriptionLines.length * 16 + 8)
            report.setFontSize(10)
            report.text(descriptionLines, 48, cursorY)
            report.text(amount, 548, cursorY, { align: 'right' })
            cursorY += descriptionLines.length * 16 + 8
        }

        addSection('Summary')
        addRow('Revenue', `INR ${revenue.toFixed(2)}`)
        addRow('Refunds', `-INR ${refundTotal.toFixed(2)}`)
        addRow('Expenses', `INR ${expenseTotal.toFixed(2)}`)
        addRow('Profits', `INR ${profits.toFixed(2)}`)

        cursorY += 12
        addSection('Paid orders')
        if (exportedPaidOrders.length === 0) {
            addRow('No paid orders in this period.', '')
        } else {
            for (const paidOrder of exportedPaidOrders) {
                addRow(
                    `${formatDateTime(paidOrder.paidAt)} - ${paidOrder.tableName} - ${getPaymentMethodLabel(paidOrder.paymentMethod)}`,
                    `INR ${paidOrder.total.toFixed(2)}`,
                )
            }
        }

        cursorY += 12
        addSection('Refund adjustments')
        if (exportedRefunds.length === 0) {
            addRow('No refunds in this period.', '')
        } else {
            for (const refundEntry of exportedRefunds) {
                addRow(
                    `${formatDateTime(refundEntry.refund.refundedAt)} - ${refundEntry.billNumber} - ${refundEntry.tableName} - ${getRefundTypeLabel(refundEntry.refund.refundType)} - ${refundEntry.refund.reason}`,
                    `-INR ${refundEntry.refund.amount.toFixed(2)}`,
                )
            }
        }

        cursorY += 12
        addSection('Expenses')
        if (exportedExpenses.length === 0) {
            addRow('No expenses in this period.', '')
        } else {
            for (const expense of exportedExpenses) {
                addRow(
                    `${formatDateTime(expense.createdAt)} - ${expense.title} - ${expense.addedBy}`,
                    `INR ${expense.amount.toFixed(2)}`,
                )
            }
        }

        report.save(`${getRestaurantFileName(restaurantName)}-balance-sheet-${dateRange.filenameSuffix}.pdf`)
        setExportMessage({ text: 'Balance sheet PDF exported.', tone: 'success' })
    }

    const refundEntries = getRefundEntries(paidOrders)

    return (
        <div className="balance-workspace">
            <header className="balance-page-heading">
                <div>
                    <p className="eyebrow">Balance sheet</p>
                    <h1>Financial position</h1>
                </div>
                <p>Revenue is paid sales; profits are revenue less refunds and recorded expenses.</p>
            </header>

            {isLoading && <p className="financial-empty">Loading balance sheet...</p>}
            {!isLoading && errorMessage && <p className="financial-message financial-message-error" role="alert">{errorMessage}</p>}

            {!isLoading && !errorMessage && balanceSheet && (
                <>
                    <section aria-label="Financial totals" className="financial-summary">
                        <section className="financial-metric financial-metric-profit">
                            <p>Profits</p>
                            <strong>{currencyFormatter.format(balanceSheet.profits)}</strong>
                            <span>Revenue less refunds and expenses</span>
                        </section>
                        <section className="financial-metric financial-metric-refund">
                            <p>Refunds</p>
                            <strong>{currencyFormatter.format(-balanceSheet.refunds)}</strong>
                            <span>Voids and refunds</span>
                        </section>
                        <section className="financial-metric financial-metric-expense">
                            <p>Expenses</p>
                            <strong>{currencyFormatter.format(balanceSheet.expenses)}</strong>
                            <span>Recorded operational costs</span>
                        </section>
                        <section className="financial-metric financial-metric-revenue">
                            <p>Revenue</p>
                            <strong>{currencyFormatter.format(balanceSheet.revenue)}</strong>
                            <span>Paid order sales</span>
                        </section>
                    </section>

                    <section aria-labelledby="balance-export-heading" className="balance-export">
                        <div>
                            <p className="eyebrow">Report</p>
                            <h2 id="balance-export-heading">Export balance sheet</h2>
                        </div>
                        <div className="balance-export-form">
                            <label className="balance-date-field" htmlFor="balance-export-from">
                                <span>From date</span>
                                <input
                                    id="balance-export-from"
                                    onChange={(event) => setFromDate(event.target.value)}
                                    type="date"
                                    value={fromDate}
                                />
                            </label>
                            <label className="balance-date-field" htmlFor="balance-export-to">
                                <span>To date</span>
                                <input
                                    id="balance-export-to"
                                    onChange={(event) => setToDate(event.target.value)}
                                    type="date"
                                    value={toDate}
                                />
                            </label>
                            <button className="balance-export-button" onClick={exportBalanceSheet} type="button">Export PDF</button>
                        </div>
                    </section>
                    {exportMessage && (
                        <p className={`financial-message financial-message-${exportMessage.tone}`} role={exportMessage.tone === 'error' ? 'alert' : 'status'}>
                            {exportMessage.text}
                        </p>
                    )}

                    <div className="balance-ledgers">
                        <section aria-labelledby="profit-entries-heading" className="financial-list">
                            <header className="financial-list-heading">
                                <div>
                                    <p className="eyebrow">Revenue</p>
                                    <h2 id="profit-entries-heading">Paid order entries</h2>
                                </div>
                                <span>{paidOrders.length} {paidOrders.length === 1 ? 'order' : 'orders'}</span>
                            </header>

                            {paidOrders.length === 0 ? (
                                <p className="financial-empty">No paid orders yet.</p>
                            ) : (
                                <div className="financial-table-wrap balance-table-wrap">
                                    <table aria-label="Paid revenue entries" className="financial-table balance-table">
                                        <thead>
                                            <tr>
                                                <th scope="col">Date</th>
                                                <th scope="col">Seating</th>
                                                <th scope="col">Paid by</th>
                                                <th scope="col">Revenue</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paidOrders.map((paidOrder) => (
                                                <tr key={paidOrder.id}>
                                                    <td>{formatDateTime(paidOrder.paidAt)}</td>
                                                    <td>{paidOrder.tableName}</td>
                                                    <td>{getPaymentMethodLabel(paidOrder.paymentMethod)}</td>
                                                    <td>{currencyFormatter.format(paidOrder.total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>

                        <section aria-labelledby="refund-entries-heading" className="financial-list">
                            <header className="financial-list-heading">
                                <div>
                                    <p className="eyebrow">Refunds</p>
                                    <h2 id="refund-entries-heading">Refund adjustments</h2>
                                </div>
                                <span>{refundEntries.length} {refundEntries.length === 1 ? 'adjustment' : 'adjustments'}</span>
                            </header>

                            {refundEntries.length === 0 ? (
                                <p className="financial-empty">No refunds recorded yet.</p>
                            ) : (
                                <div className="financial-table-wrap balance-table-wrap">
                                    <table aria-label="Refund adjustments" className="financial-table balance-refund-table">
                                        <thead>
                                            <tr>
                                                <th scope="col">Date</th>
                                                <th scope="col">Bill</th>
                                                <th scope="col">Seating</th>
                                                <th scope="col">Type</th>
                                                <th scope="col">Reason</th>
                                                <th scope="col">Adjustment</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {refundEntries.map((refundEntry) => (
                                                <tr key={refundEntry.refund.id}>
                                                    <td>{formatDateTime(refundEntry.refund.refundedAt)}</td>
                                                    <td>{refundEntry.billNumber}</td>
                                                    <td>{refundEntry.tableName}</td>
                                                    <td>{getRefundTypeLabel(refundEntry.refund.refundType)}</td>
                                                    <td>{refundEntry.refund.reason}</td>
                                                    <td>-{currencyFormatter.format(refundEntry.refund.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>

                        <section aria-labelledby="expense-entries-heading" className="financial-list">
                            <header className="financial-list-heading">
                                <div>
                                    <p className="eyebrow">Expenses</p>
                                    <h2 id="expense-entries-heading">Expense entries</h2>
                                </div>
                                <span>{expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}</span>
                            </header>

                            {expenses.length === 0 ? (
                                <p className="financial-empty">No expenses added yet.</p>
                            ) : (
                                <div className="financial-table-wrap balance-table-wrap">
                                    <table aria-label="Expense entries" className="financial-table balance-table">
                                        <thead>
                                            <tr>
                                                <th scope="col">Date</th>
                                                <th scope="col">Title</th>
                                                <th scope="col">Added by</th>
                                                <th scope="col">Expense</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {expenses.map((expense) => (
                                                <tr key={expense.id}>
                                                    <td>{formatDateTime(expense.createdAt)}</td>
                                                    <td>{expense.title}</td>
                                                    <td>{expense.addedBy}</td>
                                                    <td>{currencyFormatter.format(expense.amount)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </section>
                    </div>
                </>
            )}
        </div>
    )
}

export default BalanceSheetManager