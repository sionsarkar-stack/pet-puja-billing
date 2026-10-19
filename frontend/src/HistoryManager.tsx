import type { UserMode } from './userMode'
import { Fragment, useEffect, useState } from 'react'
import ConfirmationDialog from './ConfirmationDialog'
import { createOrderDocument } from './orderDocument'
import { useRestaurantConfiguration } from './RestaurantConfiguration'
import {
    apiBaseUrl,
    currencyFormatter,
    formatCustomerName,
    formatDateTime,
    getDateInputValue,
    getPaymentMethodLabel,
    getTableDisplayName,
    getRefundTypeLabel,
    isBillRefund,
    isPaidOrders,
    type PaymentMethod,
    type RefundType,
    type PaidOrder,
} from './financial'

type RefundMessage = {
    text: string
    tone: 'error' | 'success'
}

type HistoryStatusFilter = 'ALL' | 'PAID' | RefundType

type HistoryInvoicePreview = {
    billNumber: string
    url: string
}

function getInvoiceFileName(billNumber: string) {
    return `${billNumber.toLowerCase().replaceAll(/[^a-z0-9-]/g, '-')}-invoice.pdf`
}

function HistoryManager({ mode }: { mode: UserMode }) {
    const { restaurantName } = useRestaurantConfiguration()
    const [paidOrders, setPaidOrders] = useState<PaidOrder[]>([])
    const [selectedPaidOrder, setSelectedPaidOrder] = useState<PaidOrder | null>(null)
    const [refundType, setRefundType] = useState<RefundType>('REFUND')
    const [refundReason, setRefundReason] = useState('')
    const [refundMessage, setRefundMessage] = useState<RefundMessage | null>(null)
    const [isRefundConfirmationOpen, setIsRefundConfirmationOpen] = useState(false)
    const [isRefunding, setIsRefunding] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [fromDate, setFromDate] = useState('')
    const [toDate, setToDate] = useState('')
    const [seatingFilter, setSeatingFilter] = useState('ALL')
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethod | 'ALL'>('ALL')
    const [statusFilter, setStatusFilter] = useState<HistoryStatusFilter>('ALL')
    const [invoicePreview, setInvoicePreview] = useState<HistoryInvoicePreview | null>(null)

    useEffect(() => {
        if (invoicePreview === null) return
        const { url } = invoicePreview
        return () => URL.revokeObjectURL(url)
    }, [invoicePreview])

    const seatingOptions = [...new Set(paidOrders.map(getTableDisplayName))]
        .sort((firstSeating, secondSeating) => firstSeating.localeCompare(secondSeating))
    const filteredPaidOrders = paidOrders.filter((paidOrder) => {
        const paidDate = getDateInputValue(paidOrder.paidAt)
        if (fromDate && (paidDate === null || paidDate < fromDate)) return false
        if (toDate && (paidDate === null || paidDate > toDate)) return false
        if (seatingFilter !== 'ALL' && getTableDisplayName(paidOrder) !== seatingFilter) return false
        if (paymentMethodFilter !== 'ALL' && paidOrder.paymentMethod !== paymentMethodFilter) return false
        if (statusFilter === 'PAID' && paidOrder.refund !== null) return false
        if ((statusFilter === 'REFUND' || statusFilter === 'VOID') && paidOrder.refund?.refundType !== statusFilter) return false

        return true
    })
    const hasActiveFilters = fromDate !== ''
        || toDate !== ''
        || seatingFilter !== 'ALL'
        || paymentMethodFilter !== 'ALL'
        || statusFilter !== 'ALL'

    function clearFilters() {
        setFromDate('')
        setToDate('')
        setSeatingFilter('ALL')
        setPaymentMethodFilter('ALL')
        setStatusFilter('ALL')
    }

    function seeInvoice(paidOrder: PaidOrder) {
        const discountAmount = paidOrder.discountAmount ?? 0
        const url = URL.createObjectURL(createOrderDocument({
            documentTitle: 'INVOICE',
            issuedAt: new Date(paidOrder.paidAt),
            lines: paidOrder.lines.map((line) => ({
                itemName: line.itemName,
                lineTotal: line.lineTotal,
                quantity: line.quantity,
                section: line.section ?? 'Other',
                unitPrice: line.unitPrice,
            })),
            paymentMethod: paidOrder.paymentMethod,
            cashAmount: paidOrder.cashAmount,
            onlineAmount: paidOrder.onlineAmount,
            paymentStatus: 'PAID',
            reference: paidOrder.billNumber,
            restaurantName,
            seatingName: getTableDisplayName(paidOrder),
            isCommitteeOrder: paidOrder.tableName.startsWith('Committee '),
            tableLabel: paidOrder.tableLabel,
            orderDescription: paidOrder.orderDescription,
            customerName: paidOrder.customerName,
            subtotal: paidOrder.subtotal ?? paidOrder.total + discountAmount,
            discountPercent: paidOrder.discountPercent ?? 0,
            discountAmount,
            total: paidOrder.total,
        }))
        setInvoicePreview({ billNumber: paidOrder.billNumber, url })
    }

    useEffect(() => {
        const controller = new AbortController()

        async function loadPaidOrders() {
            try {
                const response = await fetch(`${apiBaseUrl}/api/history`, {
                    credentials: 'include',
                    signal: controller.signal,
                })

                if (!response.ok) {
                    throw new Error(`History load failed: ${response.status}`)
                }

                const orders = await response.json() as unknown
                if (!isPaidOrders(orders)) {
                    throw new Error('History response has an unexpected shape')
                }

                setPaidOrders(orders)
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setErrorMessage('We could not load payment history. Please try again.')
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false)
                }
            }
        }

        void loadPaidOrders()

        return () => controller.abort()
    }, [])

    function startRefund(paidOrder: PaidOrder) {
        setSelectedPaidOrder(paidOrder)
        setRefundType('REFUND')
        setRefundReason('')
        setIsRefundConfirmationOpen(false)
        setRefundMessage(null)
    }

    function requestRefundConfirmation() {
        if (!refundReason.trim()) {
            setRefundMessage({ text: 'Enter a reason before recording this correction.', tone: 'error' })
            return
        }

        setIsRefundConfirmationOpen(true)
        setRefundMessage(null)
    }

    async function recordRefund() {
        if (selectedPaidOrder === null || selectedPaidOrder.refund !== null || isRefunding) return

        setIsRefunding(true)
        setRefundMessage(null)

        try {
            const response = await fetch(`${apiBaseUrl}/api/refunds`, {
                body: JSON.stringify({
                    billId: selectedPaidOrder.id,
                    reason: refundReason.trim(),
                    refundType,
                }),
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
            })
            if (response.status === 409) {
                setRefundMessage({ text: 'This order has already been corrected.', tone: 'error' })
                return
            }
            if (!response.ok) {
                throw new Error(`Refund save failed: ${response.status}`)
            }

            const refund = await response.json() as unknown
            if (!isBillRefund(refund)) {
                throw new Error('Refund response has an unexpected shape')
            }

            setPaidOrders((currentPaidOrders) => currentPaidOrders.map((paidOrder) => (
                paidOrder.id === selectedPaidOrder.id ? { ...paidOrder, refund } : paidOrder
            )))
            setIsRefundConfirmationOpen(false)
            setSelectedPaidOrder(null)
            setRefundMessage({ text: `${getRefundTypeLabel(refund.refundType)} adjustment recorded.`, tone: 'success' })
        } catch {
            setIsRefundConfirmationOpen(false)
            setRefundMessage({ text: 'We could not record this correction. Please try again.', tone: 'error' })
        } finally {
            setIsRefunding(false)
        }
    }

    return (
        <div className="history-workspace">
            <header className="history-page-heading">
                <div>
                    <p className="eyebrow">History</p>
                    <h1>Paid orders</h1>
                </div>
                <p>Every settled order is recorded here with its payment method and date.</p>
            </header>

            <section aria-labelledby="paid-order-history-heading" className="financial-list">
                <header className="financial-list-heading">
                    <div>
                        <p className="eyebrow">Settled orders</p>
                        <h2 id="paid-order-history-heading">Order history</h2>
                    </div>
                    <span>
                        {filteredPaidOrders.length === paidOrders.length
                            ? `${paidOrders.length} ${paidOrders.length === 1 ? 'payment' : 'payments'}`
                            : `${filteredPaidOrders.length} of ${paidOrders.length} payments`}
                    </span>
                </header>

                {isLoading && <p className="financial-empty">Loading payment history...</p>}
                {!isLoading && errorMessage && <p className="financial-message financial-message-error" role="alert">{errorMessage}</p>}
                {!isLoading && !errorMessage && paidOrders.length === 0 && (
                    <p className="financial-empty">No paid orders yet.</p>
                )}

                {!isLoading && !errorMessage && paidOrders.length > 0 && (
                    <section aria-label="Filter paid orders" className="history-filters">
                        <label htmlFor="history-from-date">
                            <span>From date</span>
                            <input
                                id="history-from-date"
                                max={toDate || undefined}
                                onChange={(event) => setFromDate(event.target.value)}
                                type="date"
                                value={fromDate}
                            />
                        </label>
                        <label htmlFor="history-to-date">
                            <span>To date</span>
                            <input
                                id="history-to-date"
                                min={fromDate || undefined}
                                onChange={(event) => setToDate(event.target.value)}
                                type="date"
                                value={toDate}
                            />
                        </label>
                        <label htmlFor="history-seating-filter">
                            <span>Seating</span>
                            <select id="history-seating-filter" onChange={(event) => setSeatingFilter(event.target.value)} value={seatingFilter}>
                                <option value="ALL">All seating</option>
                                {seatingOptions.map((seatingName) => <option key={seatingName} value={seatingName}>{seatingName}</option>)}
                            </select>
                        </label>
                        <label htmlFor="history-payment-filter">
                            <span>Paid by</span>
                            <select
                                id="history-payment-filter"
                                onChange={(event) => setPaymentMethodFilter(event.target.value as PaymentMethod | 'ALL')}
                                value={paymentMethodFilter}
                            >
                                <option value="ALL">All payments</option>
                                <option value="CASH">Cash</option>
                                <option value="ONLINE">Online</option>
                                <option value="SPLIT">Split</option>
                            </select>
                        </label>
                        <label htmlFor="history-status-filter">
                            <span>Status</span>
                            <select
                                id="history-status-filter"
                                onChange={(event) => setStatusFilter(event.target.value as HistoryStatusFilter)}
                                value={statusFilter}
                            >
                                <option value="ALL">All statuses</option>
                                <option value="PAID">Paid</option>
                                <option value="REFUND">Refunded</option>
                                <option value="VOID">Voided</option>
                            </select>
                        </label>
                        <button disabled={!hasActiveFilters} onClick={clearFilters} type="button">Clear filters</button>
                    </section>
                )}

                {!isLoading && !errorMessage && paidOrders.length > 0 && filteredPaidOrders.length === 0 && (
                    <p className="financial-empty">No paid orders match these filters.</p>
                )}

                {!isLoading && !errorMessage && filteredPaidOrders.length > 0 && (
                    <div className="financial-table-wrap history-table-wrap">
                        <table aria-label="Paid order history" className="financial-table history-table">
                            <thead>
                                <tr>
                                    <th scope="col">Date</th>
                                    <th scope="col">Seating</th>
                                    <th scope="col">Customer</th>
                                    <th scope="col">Paid by</th>
                                    <th scope="col">Paid price</th>
                                    <th scope="col">Status</th>
                                    <th scope="col">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPaidOrders.map((paidOrder) => (
                                    <Fragment key={paidOrder.id}>
                                        <tr>
                                            <td>{formatDateTime(paidOrder.paidAt)}</td>
                                            <td>{getTableDisplayName(paidOrder)}</td>
                                            <td>{formatCustomerName(paidOrder.customerName)}</td>
                                            <td>{getPaymentMethodLabel(paidOrder.paymentMethod)}
                                                {paidOrder.paymentMethod === 'SPLIT' && <small className="payment-breakdown">Cash: {currencyFormatter.format(paidOrder.cashAmount ?? 0)}<br />Online: {currencyFormatter.format(paidOrder.onlineAmount ?? 0)}</small>}
                                            </td>
                                            <td>{currencyFormatter.format(paidOrder.total)}</td>
                                            <td>
                                                <span className={paidOrder.refund ? 'history-status history-status-corrected' : 'history-status'}>
                                                    {paidOrder.refund ? getRefundTypeLabel(paidOrder.refund.refundType) : 'Paid'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="history-row-actions">
                                                    <button
                                                        aria-label={`See invoice for ${paidOrder.billNumber}`}
                                                        className="history-refund-action"
                                                        onClick={() => seeInvoice(paidOrder)}
                                                        type="button"
                                                    >
                                                        See invoice
                                                    </button>
                                                    {paidOrder.refund ? (
                                                        <span className="history-correction-details">
                                                            <strong>-{currencyFormatter.format(paidOrder.refund.amount)}</strong>
                                                            <span>{paidOrder.refund.reason}</span>
                                                            {paidOrder.refund.refundedBy && <small>by {paidOrder.refund.refundedBy}</small>}
                                                        </span>
                                                    ) : mode === 'ADMIN' ? (
                                                        <button className="history-refund-action" onClick={() => startRefund(paidOrder)} type="button">
                                                            Void / refund
                                                        </button>
                                                    ) : null}
                                                </div>
                                            </td>
                                        </tr>
                                        {invoicePreview?.billNumber === paidOrder.billNumber && (
                                            <tr className="history-invoice-row">
                                                <td className="history-invoice-cell" colSpan={7}>
                                                    <section aria-labelledby="history-invoice-heading" className="invoice-preview history-inline-invoice">
                                                        <header className="invoice-preview-heading">
                                                            <h3 id="history-invoice-heading">Invoice {invoicePreview.billNumber}</h3>
                                                            <div className="history-invoice-actions">
                                                                <a
                                                                    className="invoice-download"
                                                                    download={getInvoiceFileName(invoicePreview.billNumber)}
                                                                    href={invoicePreview.url}
                                                                >
                                                                    Download invoice
                                                                </a>
                                                                <button
                                                                    aria-label="Close invoice preview"
                                                                    className="refund-cancel"
                                                                    onClick={() => setInvoicePreview(null)}
                                                                    type="button"
                                                                >
                                                                    Close
                                                                </button>
                                                            </div>
                                                        </header>
                                                        <iframe
                                                            src={invoicePreview.url}
                                                            title={`Invoice preview for ${invoicePreview.billNumber}`}
                                                        />
                                                    </section>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {!isLoading && !errorMessage && selectedPaidOrder && selectedPaidOrder.refund === null && (
                <section aria-labelledby="refund-editor-heading" className="refund-editor">
                    <header className="refund-editor-heading">
                        <div>
                            <p className="eyebrow">Correction</p>
                            <h2 id="refund-editor-heading">Correct {selectedPaidOrder.billNumber}</h2>
                        </div>
                        <span>{currencyFormatter.format(selectedPaidOrder.total)}</span>
                    </header>
                    <form
                        className="refund-form"
                        onSubmit={(event) => {
                            event.preventDefault()
                            requestRefundConfirmation()
                        }}
                    >
                        <label className="refund-field" htmlFor="refund-type">
                            <span>Adjustment type</span>
                            <select
                                id="refund-type"
                                onChange={(event) => setRefundType(event.target.value as RefundType)}
                                value={refundType}
                            >
                                <option value="REFUND">Refund</option>
                                <option value="VOID">Void</option>
                            </select>
                        </label>
                        <label className="refund-field refund-reason-field" htmlFor="refund-reason">
                            <span>Reason</span>
                            <textarea
                                id="refund-reason"
                                maxLength={500}
                                onChange={(event) => setRefundReason(event.target.value)}
                                placeholder="Reason for this correction"
                                required
                                value={refundReason}
                            />
                        </label>
                        <div className="refund-form-actions">
                            <button className="refund-confirm" disabled={isRefunding} type="submit">
                                Review {refundType.toLowerCase()}
                            </button>
                            <button
                                className="refund-cancel"
                                disabled={isRefunding}
                                onClick={() => {
                                    setIsRefundConfirmationOpen(false)
                                    setSelectedPaidOrder(null)
                                }}
                                type="button"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </section>
            )}
            {!isLoading && !errorMessage && refundMessage && (
                <p className={`financial-message financial-message-${refundMessage.tone}`} role={refundMessage.tone === 'error' ? 'alert' : 'status'}>
                    {refundMessage.text}
                </p>
            )}
            {isRefundConfirmationOpen && selectedPaidOrder && (
                <ConfirmationDialog
                    confirmLabel={`Record ${refundType.toLowerCase()}`}
                    isConfirming={isRefunding}
                    message={`Record a full ${refundType.toLowerCase()} adjustment for ${selectedPaidOrder.billNumber}? The original paid order will remain in the audit history.`}
                    onCancel={() => setIsRefundConfirmationOpen(false)}
                    onConfirm={() => void recordRefund()}
                    title={`Confirm ${refundType.toLowerCase()}`}
                    tone="danger"
                >
                    <strong>-{currencyFormatter.format(selectedPaidOrder.total)}</strong> for: {refundReason.trim()}
                </ConfirmationDialog>
            )}
        </div>
    )
}

export default HistoryManager