import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RestaurantConfigurationContext } from './RestaurantConfiguration'
import { formatDateTime, formatTime, getDateInputBoundary, getDateInputValue } from './financial'
import BalanceSheetManager from './BalanceSheetManager'
import ExpensesManager from './ExpensesManager'
import HistoryManager from './HistoryManager'

const pdf = vi.hoisted(() => {
    const document = {
        addPage: vi.fn(),
        line: vi.fn(),
        output: vi.fn(() => new Blob(['invoice'], { type: 'application/pdf' })),
        rect: vi.fn(),
        save: vi.fn(),
        setDrawColor: vi.fn(),
        setFillColor: vi.fn(),
        setFontSize: vi.fn(),
        setTextColor: vi.fn(),
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
    lines: [{ itemName: 'Paneer Tikka', lineTotal: 400, quantity: 2, section: 'Mains', unitPrice: 200 }],
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
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('formats timestamps and date boundaries in IST independent of local timezone', () => {
        const timestamp = '2026-10-12T12:52:00Z'

        expect(formatDateTime(timestamp)).toContain('12 Oct 2026')
        expect(formatDateTime(timestamp)).toContain('6:22 pm')
        expect(formatTime(timestamp)).toBe('6:22 pm')
        expect(getDateInputValue('2026-10-12T20:00:00Z')).toBe('2026-10-13')
        expect(getDateInputBoundary('2026-10-13')?.toISOString()).toBe('2026-10-12T18:30:00.000Z')
        expect(getDateInputBoundary('2026-10-13', true)?.toISOString()).toBe('2026-10-13T18:29:59.999Z')
    })

    it('shows paid history with the table, payment method, and amount', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([paidOrder]))

        render(<HistoryManager mode="ADMIN" />)

        const historyTable = await screen.findByRole('table', { name: 'Paid order history' })
        expect(within(historyTable).getByText('Table 3')).toBeInTheDocument()
        expect(within(historyTable).getByText('NA')).toBeInTheDocument()
        expect(within(historyTable).getByText('Online')).toBeInTheDocument()
        expect(within(historyTable).getByText('₹400.00')).toBeInTheDocument()
    })

    it('shows the saved ordering name in paid history', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([{ ...paidOrder, customerName: 'Aarav Mehta' }]))

        render(<HistoryManager mode="ADMIN" />)

        const historyTable = await screen.findByRole('table', { name: 'Paid order history' })
        expect(within(historyTable).getByText('Aarav Mehta')).toBeInTheDocument()
    })

    it('previews and downloads the original invoice for a refunded historical order', async () => {
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:historical-invoice'),
            revokeObjectURL: vi.fn(),
        })
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([{
            ...paidOrder,
            billNumber: 'PP-REFUNDED',
            discountAmount: 40,
            discountPercent: 10,
            refund,
            subtotal: 400,
            total: 360,
        }]))
        const user = userEvent.setup()

        render(<HistoryManager mode="CAPTAIN" />)

        const historyTable = await screen.findByRole('table', { name: 'Paid order history' })
        await user.click(within(historyTable).getByRole('button', { name: 'See invoice for PP-REFUNDED' }))

        const invoicePreview = screen.getByTitle('Invoice preview for PP-REFUNDED')
        expect(invoicePreview).toHaveAttribute('src', 'blob:historical-invoice')
        const expandedRow = invoicePreview.closest('tr')
        expect(expandedRow).not.toBeNull()
        expect(within(historyTable).getAllByRole('row')[2]).toBe(expandedRow)
        expect(screen.getByRole('link', { name: 'Download invoice' })).toHaveAttribute(
            'download',
            'pp-refunded-invoice.pdf',
        )
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('Bill discount (10.00% of General)')
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('INR 360.00')

        await user.click(within(expandedRow!).getByRole('button', { name: 'Close invoice preview' }))
        expect(screen.queryByTitle('Invoice preview for PP-REFUNDED')).not.toBeInTheDocument()
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

        render(<HistoryManager mode="ADMIN" />)

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

        render(<HistoryManager mode="ADMIN" />)

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

        render(<HistoryManager mode="ADMIN" />)

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
        expect(within(screen.getByRole('radiogroup', { name: 'Added by' }).parentElement!).getAllByRole('radio').map((radio) => radio.getAttribute('value')))
            .toEqual(['Rimo', 'Rjoe', 'Rishi', 'Dinda', 'Others'])
        await user.type(screen.getByLabelText('Title'), 'Vegetables')
        await user.type(screen.getByLabelText('Amount (INR)'), '75')
        await user.type(screen.getByLabelText('Description'), 'Morning market')
        await user.click(screen.getByRole('button', { name: 'Add expense' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Select who added this expense.')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        await user.click(screen.getByRole('radio', { name: 'Rjoe' }))
        await user.click(screen.getByRole('button', { name: 'Add expense' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/api/expenses',
            expect.objectContaining({
                body: JSON.stringify({
                    addedBy: 'Rjoe',
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

    it('requires a name when Others is selected for an expense', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ ...expense, addedBy: 'Others: Arun' }, 201))
        const user = userEvent.setup()

        render(<ExpensesManager />)

        await screen.findByRole('heading', { name: 'Expense entries' })
        expect(screen.queryByLabelText(/ke bhai/)).not.toBeInTheDocument()
        await user.click(screen.getByRole('radio', { name: 'Others' }))

        const otherName = screen.getByLabelText(/ke bhai/)
        expect(otherName).toBeRequired()
        await user.type(screen.getByLabelText('Title'), 'Vegetables')
        await user.type(screen.getByLabelText('Amount (INR)'), '75')
        await user.click(screen.getByRole('button', { name: 'Add expense' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Enter a name for Others.')
        expect(fetchMock).toHaveBeenCalledTimes(1)

        await user.type(otherName, '  Arun  ')
        await user.click(screen.getByRole('button', { name: 'Add expense' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/api/expenses',
            expect.objectContaining({
                body: JSON.stringify({ addedBy: 'Others', amount: 75, description: null, title: 'Vegetables', keBhai: 'Arun' }),
                credentials: 'include',
                method: 'POST',
            }),
        )
    })

    it('shows profits, expenses, and revenue with their saved entries', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ expenses: 75, profits: 325, refunds: 0, revenue: 400 }))
            .mockResolvedValueOnce(jsonResponse([paidOrder]))
            .mockResolvedValueOnce(jsonResponse([expense]))

        render(
            <RestaurantConfigurationContext.Provider value={{ restaurantName: 'The Third Break', upiVpa: '' }}>
                <BalanceSheetManager />
            </RestaurantConfigurationContext.Provider>,
        )

        await screen.findByRole('heading', { name: 'Financial position' })
        const revenueMetric = screen.getByText('Paid order sales').closest('section')
        const profitsMetric = screen.getByText('Revenue less refunds and expenses').closest('section')
        expect(revenueMetric).not.toBeNull()
        expect(profitsMetric).not.toBeNull()
        expect(within(revenueMetric!).getByText('₹400.00')).toBeInTheDocument()
        expect(within(profitsMetric!).getByText('₹325.00')).toBeInTheDocument()

        const profitTable = screen.getByRole('table', { name: 'Paid revenue entries' })
        const expenseTable = screen.getByRole('table', { name: 'Expense entries' })
        expect(within(profitTable).getByText('₹400.00')).toBeInTheDocument()
        expect(within(expenseTable).getByText('Vegetables')).toBeInTheDocument()
        expect(within(expenseTable).getByText('₹75.00')).toBeInTheDocument()
    })

    it('shows refund adjustments separately and includes them in the PDF export', async () => {
        const refundedPaidOrder = { ...paidOrder, refund }
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ expenses: 75, profits: -75, refunds: 400, revenue: 400 }))
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
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('INR 400.00')
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('INR -75.00')
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
            .mockResolvedValueOnce(jsonResponse({ expenses: 125, profits: 475, refunds: 0, revenue: 600 }))
            .mockResolvedValueOnce(jsonResponse([olderPaidOrder, todayPaidOrder]))
            .mockResolvedValueOnce(jsonResponse([olderExpense, todayExpense]))
        const user = userEvent.setup()

        render(
            <RestaurantConfigurationContext.Provider value={{ restaurantName: 'The Third Break', upiVpa: '' }}>
                <BalanceSheetManager />
            </RestaurantConfigurationContext.Provider>,
        )

        await screen.findByRole('heading', { name: 'Financial position' })
        await user.click(screen.getByRole('button', { name: 'Export PDF' }))
        expect(pdf.document.save).toHaveBeenLastCalledWith('the-third-break-balance-sheet-all-records.pdf')
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('The Third Break')

        vi.clearAllMocks()
        await user.type(screen.getByLabelText('To date'), yesterday)
        await user.click(screen.getByRole('button', { name: 'Export PDF' }))
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('INR 200.00')
        expect(pdf.document.save).toHaveBeenLastCalledWith(`the-third-break-balance-sheet-start-to-${yesterday}.pdf`)

        vi.clearAllMocks()
        await user.clear(screen.getByLabelText('To date'))
        await user.type(screen.getByLabelText('From date'), today)
        await user.click(screen.getByRole('button', { name: 'Export PDF' }))
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('INR 400.00')
        expect(pdf.document.save).toHaveBeenLastCalledWith(`the-third-break-balance-sheet-from-${today}-to-current-date.pdf`)

        vi.clearAllMocks()
        await user.type(screen.getByLabelText('To date'), today)
        await user.click(screen.getByRole('button', { name: 'Export PDF' }))
        expect(pdf.document.save).toHaveBeenLastCalledWith(`the-third-break-balance-sheet-${today}-to-${today}.pdf`)
    })
})