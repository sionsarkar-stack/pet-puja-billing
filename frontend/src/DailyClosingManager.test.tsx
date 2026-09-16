import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DailyClosingManager from './DailyClosingManager'

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status,
    })
}

const dailyClosing = {
    cashSales: 120,
    closedAt: '2026-09-15T20:00:00Z',
    closingDate: '2026-09-15',
    expenseCount: 1,
    expenses: 75,
    id: 1,
    onlineSales: 240,
    paidOrderCount: 2,
    profits: 360,
    refunds: 0,
    revenue: 285,
}

const dailyClosingPreview = {
    cashSales: 120,
    closingDate: '2026-09-15',
    expenseCount: 1,
    expenses: 75,
    onlineSales: 240,
    paidOrderCount: 2,
    profits: 360,
    refunds: 0,
    revenue: 285,
}

describe('DailyClosingManager', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('saves the selected date and displays its closing totals', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(dailyClosingPreview))
            .mockResolvedValueOnce(jsonResponse(dailyClosing, 201))
        const user = userEvent.setup()

        render(<DailyClosingManager />)

        await screen.findByRole('heading', { name: 'Close a business day' })
        await user.clear(screen.getByLabelText('Closing date'))
        await user.type(screen.getByLabelText('Closing date'), '2026-09-15')
        await user.click(screen.getByRole('button', { name: 'Review day' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/api/daily-closings/preview?closingDate=2026-09-15',
            expect.objectContaining({ credentials: 'include' }),
        )
        expect(await screen.findByRole('alertdialog', { name: 'Close 2026-09-15' })).toHaveTextContent('₹285.00')
        expect(fetchMock).toHaveBeenCalledTimes(2)
        await user.click(screen.getByRole('button', { name: 'Confirm daily close' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            '/api/daily-closings',
            expect.objectContaining({
                body: JSON.stringify({ closingDate: '2026-09-15' }),
                credentials: 'include',
                method: 'POST',
            }),
        )
        expect(await screen.findByText('Daily closing saved.')).toBeInTheDocument()
        const closingTable = screen.getByRole('table', { name: 'Daily closing history' })
        expect(within(closingTable).getByText('₹120.00')).toBeInTheDocument()
        expect(within(closingTable).getByText('₹240.00')).toBeInTheDocument()
        expect(within(closingTable).getByText('₹285.00')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Day closed' })).toBeDisabled()
    })

    it('dismisses the closing review when the server rejects the save', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(dailyClosingPreview))
            .mockResolvedValueOnce(new Response(null, { status: 500 }))
        const user = userEvent.setup()

        render(<DailyClosingManager />)

        await screen.findByRole('heading', { name: 'Close a business day' })
        await user.clear(screen.getByLabelText('Closing date'))
        await user.type(screen.getByLabelText('Closing date'), '2026-09-15')
        await user.click(screen.getByRole('button', { name: 'Review day' }))
        await screen.findByRole('alertdialog', { name: 'Close 2026-09-15' })
        await user.click(screen.getByRole('button', { name: 'Confirm daily close' }))

        expect(await screen.findByText('We could not close this day. Please try again.')).toBeInTheDocument()
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
})