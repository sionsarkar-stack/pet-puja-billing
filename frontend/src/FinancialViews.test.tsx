import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BalanceSheetManager from './BalanceSheetManager'
import ExpensesManager from './ExpensesManager'
import HistoryManager from './HistoryManager'

const pdf = vi.hoisted(() => {
    const document = {
        addPage: vi.fn(),
        save: vi.fn(),
        setFontSize: vi.fn(),
        splitTextToSize: vi.fn((value: string) => [value]),
        text: vi.fn(),
    }

    return {
        document,
        jsPDF: vi.fn(function MockJsPDF() {
            return document
        }),
    }
})

vi.mock('jspdf', () => ({ jsPDF: pdf.jsPDF }))

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status,
    })
}

const paidOrder = {
    billNumber: 'PP-123',
    id: 1,
    lines: [{ itemName: 'Paneer Tikka', lineTotal: 400, quantity: 2, unitPrice: 200 }],
    paidAt: '2026-09-15T12:00:00Z',
    paymentMethod: 'ONLINE',
    refund: null,
    tableName: 'Table 3',
    total: 400,
}

const expense = {
    addedBy: 'Cashier',
    amount: 75,
    createdAt: '2026-09-15T12:30:00Z',
    description: 'Morning market',
    id: 2,
    title: 'Vegetables',
}

const refund = {
    amount: 400,
    billId: 1,
    id: 3,
    reason: 'Duplicate payment',
    refundedAt: '2026-09-15T13:00:00Z',
    refundType: 'REFUND',
}

describe('financial views', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('shows paid history with the table, payment method, and amount', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([paidOrder]))

        render(<HistoryManager />)

        const historyTable = await screen.findByRole('table', { name: 'Paid order history' })
        expect(within(historyTable).getByText('Table 3')).toBeInTheDocument()
        expect(within(historyTable).getByText('Online')).toBeInTheDocument()
        expect(within(historyTable).getByText('₹400.00')).toBeInTheDocument()
    })

    it('filters paid history by date, seating, payment method, and correction status', async () => {
        const cashPaidOrder = {
            ...paidOrder,
            id: 2,
            paidAt: '2026-09-14T12:00:00Z',
            paymentMethod: 'CASH',
            tableName: 'Table 1',
            total: 200,
        }
        const refundedPaidOrder = {
            ...paidOrder,
            id: 3,
            refund,
            tableName: 'Table 4',
        }
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([cashPaidOrder, paidOrder, refundedPaidOrder]))
        const user = userEvent.setup()

        render(<HistoryManager />)

        const historyTable = await screen.findByRole('table', { name: 'Paid order history' })
        expect(screen.getByText('3 payments')).toBeInTheDocument()
        await user.type(screen.getByLabelText('From date'), '2026-09-15')
        expect(await screen.findByText('2 of 3 payments')).toBeInTheDocument()
        expect(within(historyTable).queryByText('Table 1')).not.toBeInTheDocument()

        await user.selectOptions(screen.getByLabelText('Seating'), 'Table 4')
        await user.selectOptions(screen.getByLabelText('Paid by'), 'ONLINE')
        await user.selectOptions(screen.getByLabelText('Status'), 'REFUND')
        expect(screen.getByText('1 of 3 payments')).toBeInTheDocument()
        expect(within(historyTable).getByText('Table 4')).toBeInTheDocument()
        expect(within(historyTable).getByText('Refunded')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Clear filters' }))
        expect(await screen.findByText('3 payments')).toBeInTheDocument()
        expect(within(historyTable).getByText('Table 1')).toBeInTheDocument()
    })

    it('records a reasoned refund while retaining the original paid order', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([paidOrder]))
            .mockResolvedValueOnce(jsonResponse(refund, 201))
        const user = userEvent.setup()

        render(<HistoryManager />)

        const historyTable = await screen.findByRole('table', { name: 'Paid order history' })
        await user.click(within(historyTable).getByRole('button', { name: 'Void / refund' }))
        await user.type(screen.getByLabelText('Reason'), 'Duplicate payment')
        await user.click(screen.getByRole('button', { name: 'Review refund' }))
        expect(fetchMock).toHaveBeenCalledOnce()
        expect(screen.getByRole('alertdialog', { name: 'Confirm refund' })).toHaveTextContent('-₹400.00')
        await user.click(screen.getByRole('button', { name: 'Record refund' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/api/refunds',
            expect.objectContaining({
                body: JSON.stringify({ billId: 1, reason: 'Duplicate payment', refundType: 'REFUND' }),
                credentials: 'include',
                method: 'POST',
            }),
        )
        expect(await screen.findByText('Refunded adjustment recorded.')).toBeInTheDocument()
        expect(within(historyTable).getByText('Table 3')).toBeInTheDocument()
        expect(within(historyTable).getByText('Refunded')).toBeInTheDocument()
        expect(within(historyTable).getByText('-₹400.00')).toBeInTheDocument()
        expect(within(historyTable).getByText('Duplicate payment')).toBeInTheDocument()
    })

    it('dismisses the refund review when the server rejects the correction', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([paidOrder]))
            .mockResolvedValueOnce(new Response(null, { status: 500 }))
        const user = userEvent.setup()

        render(<HistoryManager />)

        const historyTable = await screen.findByRole('table', { name: 'Paid order history' })
        await user.click(within(historyTable).getByRole('button', { name: 'Void / refund' }))
        await user.type(screen.getByLabelText('Reason'), 'Duplicate payment')
        await user.click(screen.getByRole('button', { name: 'Review refund' }))
        await user.click(screen.getByRole('button', { name: 'Record refund' }))

        expect(await screen.findByText('We could not record this correction. Please try again.')).toBeInTheDocument()
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('submits all expense fields and displays the saved expense', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(expense, 201))
        const user = userEvent.setup()

        render(<ExpensesManager />)

        await screen.findByRole('heading', { name: 'Expense entries' })
        await user.type(screen.getByLabelText('Title'), 'Vegetables')
        await user.type(screen.getByLabelText('Amount (INR)'), '75')
        await user.selectOptions(screen.getByLabelText('Added by'), 'Cashier')
        await user.type(screen.getByLabelText('Description'), 'Morning market')
        await user.click(screen.getByRole('button', { name: 'Add expense' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/api/expenses',
            expect.objectContaining({
                body: JSON.stringify({
                    addedBy: 'Cashier',
                    amount: 75,
                    description: 'Morning market',
                    title: 'Vegetables',
                }),
                credentials: 'include',
                method: 'POST',
            }),
        )
        expect(await screen.findByText('Expense added.')).toBeInTheDocument()
        expect(screen.getByText('₹75.00')).toBeInTheDocument()
    })

    it('shows profits, expenses, and revenue with their saved entries', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ expenses: 75, profits: 400, refunds: 0, revenue: 325 }))
            .mockResolvedValueOnce(jsonResponse([paidOrder]))
            .mockResolvedValueOnce(jsonResponse([expense]))

        render(<BalanceSheetManager />)

        await screen.findByRole('heading', { name: 'Financial position' })
        const revenueMetric = screen.getByText('Revenue').closest('section')
        expect(revenueMetric).not.toBeNull()
        expect(within(revenueMetric!).getByText('₹325.00')).toBeInTheDocument()

        const profitTable = screen.getByRole('table', { name: 'Paid profit entries' })
        const expenseTable = screen.getByRole('table', { name: 'Expense entries' })
        expect(within(profitTable).getByText('₹400.00')).toBeInTheDocument()
        expect(within(expenseTable).getByText('Vegetables')).toBeInTheDocument()
        expect(within(expenseTable).getByText('₹75.00')).toBeInTheDocument()
    })

    it('shows refund adjustments separately and includes them in the PDF export', async () => {
        const refundedPaidOrder = { ...paidOrder, refund }
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ expenses: 75, profits: 400, refunds: 400, revenue: -75 }))
            .mockResolvedValueOnce(jsonResponse([refundedPaidOrder]))
            .mockResolvedValueOnce(jsonResponse([expense]))
        const user = userEvent.setup()

        render(<BalanceSheetManager />)

        await screen.findByRole('heading', { name: 'Financial position' })
        const refundMetric = screen.getByText('Voids and refunds').closest('section')
        expect(refundMetric).not.toBeNull()
        expect(within(refundMetric!).getByText('-₹400.00')).toBeInTheDocument()
        const refundTable = screen.getByRole('table', { name: 'Refund adjustments' })
        expect(within(refundTable).getByText('PP-123')).toBeInTheDocument()
        expect(within(refundTable).getByText('-₹400.00')).toBeInTheDocument()
        expect(within(refundTable).getByText('Duplicate payment')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Export PDF' }))
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('-INR 400.00')
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('Duplicate payment')
    })

    it('exports balance sheets for all supported date ranges', async () => {
        const currentDate = new Date()
        const today = [
            currentDate.getFullYear(),
            String(currentDate.getMonth() + 1).padStart(2, '0'),
            String(currentDate.getDate()).padStart(2, '0'),
        ].join('-')
        const previousDate = new Date(currentDate)
        previousDate.setDate(previousDate.getDate() - 1)
        const yesterday = [
            previousDate.getFullYear(),
            String(previousDate.getMonth() + 1).padStart(2, '0'),
            String(previousDate.getDate()).padStart(2, '0'),
        ].join('-')
        const olderPaidOrder = { ...paidOrder, id: 3, paidAt: `${yesterday}T12:00:00Z`, tableName: 'Table 1', total: 200 }
        const olderExpense = { ...expense, amount: 50, createdAt: `${yesterday}T12:00:00Z`, id: 4, title: 'Gas' }
        const todayPaidOrder = { ...paidOrder, paidAt: `${today}T12:00:00Z` }
        const todayExpense = { ...expense, createdAt: `${today}T12:00:00Z` }
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ expenses: 125, profits: 600, refunds: 0, revenue: 475 }))
            .mockResolvedValueOnce(jsonResponse([olderPaidOrder, todayPaidOrder]))
            .mockResolvedValueOnce(jsonResponse([olderExpense, todayExpense]))
        const user = userEvent.setup()

        render(<BalanceSheetManager />)

        await screen.findByRole('heading', { name: 'Financial position' })
        await user.click(screen.getByRole('button', { name: 'Export PDF' }))
        expect(pdf.document.save).toHaveBeenLastCalledWith('pet-puja-balance-sheet-all-records.pdf')

        vi.clearAllMocks()
        await user.type(screen.getByLabelText('To date'), yesterday)
        await user.click(screen.getByRole('button', { name: 'Export PDF' }))
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('INR 200.00')
        expect(pdf.document.save).toHaveBeenLastCalledWith(`pet-puja-balance-sheet-start-to-${yesterday}.pdf`)

        vi.clearAllMocks()
        await user.clear(screen.getByLabelText('To date'))
        await user.type(screen.getByLabelText('From date'), today)
        await user.click(screen.getByRole('button', { name: 'Export PDF' }))
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('INR 400.00')
        expect(pdf.document.save).toHaveBeenLastCalledWith(`pet-puja-balance-sheet-from-${today}-to-current-date.pdf`)

        vi.clearAllMocks()
        await user.type(screen.getByLabelText('To date'), today)
        await user.click(screen.getByRole('button', { name: 'Export PDF' }))
        expect(pdf.document.save).toHaveBeenLastCalledWith(`pet-puja-balance-sheet-${today}-to-${today}.pdf`)
    })
})