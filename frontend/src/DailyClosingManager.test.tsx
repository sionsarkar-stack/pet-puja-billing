import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
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
    profits: 285,
    refunds: 0,
    revenue: 360,
    startedAt: '2026-09-15T12:00:00Z',
}

const dailyClosingPreview = {
    cashSales: 120,
    closingDate: '2026-09-15',
    endedAt: '2026-09-15T20:00:00Z',
    expenseCount: 1,
    expenses: 75,
    onlineSales: 240,
    paidOrderCount: 2,
    profits: 285,
    refunds: 0,
    revenue: 360,
    startedAt: '2026-09-15T12:00:00Z',
}

const activeBusinessDay = {
    active: true,
    businessDate: '2026-09-15',
    startedAt: '2026-09-15T12:00:00Z',
}

const inactiveBusinessDay = { active: false, businessDate: null, startedAt: null }

describe('DailyClosingManager', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('starts a business day and notifies the workspace', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(activeBusinessDay, 201))
        const onBusinessDayStatusChange = vi.fn()
        const user = userEvent.setup()

        render(
            <DailyClosingManager
                businessDayStatus={inactiveBusinessDay}
                onBusinessDayStatusChange={onBusinessDayStatusChange}
            />,
        )

        await screen.findByRole('heading', { name: 'Start or end a business day' })
        await user.click(screen.getByRole('button', { name: 'Start day' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/api/daily-closings/start',
            expect.objectContaining({ credentials: 'include', method: 'POST' }),
        )
        expect(onBusinessDayStatusChange).toHaveBeenCalledWith(activeBusinessDay)
        expect(await screen.findByText('Business day started for 2026-09-15.')).toBeInTheDocument()
    })

    it('previews an active day, ends it, and saves the time-bounded totals', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(dailyClosingPreview))
            .mockResolvedValueOnce(jsonResponse(dailyClosingPreview))
            .mockResolvedValueOnce(jsonResponse(dailyClosing, 201))
        const onBusinessDayStatusChange = vi.fn()
        const user = userEvent.setup()

        render(
            <DailyClosingManager
                businessDayStatus={activeBusinessDay}
                onBusinessDayStatusChange={onBusinessDayStatusChange}
            />,
        )

        await screen.findByRole('heading', { name: 'Start or end a business day' })
        expect(await screen.findByText('Yet to close')).toBeInTheDocument()
        const liveRow = screen.getByText('Yet to close').closest('tr')
        expect(liveRow).not.toBeNull()
        const liveCells = within(liveRow!).getAllByRole('cell')
        await waitFor(() => {
            expect(liveCells[3]).toHaveTextContent('₹360.00')
            expect(liveCells[6]).toHaveTextContent('₹285.00')
        })
        await user.click(screen.getByRole('button', { name: 'End day' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            '/api/daily-closings/preview',
            expect.objectContaining({ credentials: 'include' }),
        )
        expect(await screen.findByRole('alertdialog', { name: 'End 2026-09-15' })).toHaveTextContent('₹360.00')
        expect(screen.getByRole('alertdialog')).toHaveTextContent('₹285.00')
        expect(within(screen.getByRole('alertdialog')).getByText('Started')).toBeInTheDocument()
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'End day' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            '/api/daily-closings/end',
            expect.objectContaining({ credentials: 'include', method: 'POST' }),
        )
        expect(onBusinessDayStatusChange).toHaveBeenCalledWith(inactiveBusinessDay)
        expect(await screen.findByText('Business day ended and totals saved.')).toBeInTheDocument()
        const closingTable = screen.getByRole('table', { name: 'Daily closing history' })
        expect(within(closingTable).getAllByRole('columnheader').map((header) => header.textContent)).toEqual([
            'Started', 'Cash', 'Online', 'Revenue', 'Refunds', 'Expenses', 'Profits', 'Ended',
        ])
        const startedTime = within(closingTable).getAllByText('15 Sept 2026, 5:30 pm').at(-1)
        expect(startedTime).toBeDefined()
        expect(startedTime?.tagName).toBe('STRONG')
        expect(within(closingTable).getByText('₹120.00')).toBeInTheDocument()
        expect(within(closingTable).getByText('₹240.00')).toBeInTheDocument()
        expect(within(closingTable).getByRole('columnheader', { name: 'Profits' })).toBeInTheDocument()
        expect(within(closingTable).getByText('₹360.00')).toBeInTheDocument()
        expect(within(closingTable).getByText('₹285.00')).toBeInTheDocument()
    })

    it('keeps the active day when the server rejects the end request', async () => {
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(dailyClosingPreview))
            .mockResolvedValueOnce(jsonResponse(dailyClosingPreview))
            .mockResolvedValueOnce(new Response(null, { status: 500 }))
        const onBusinessDayStatusChange = vi.fn()
        const user = userEvent.setup()

        render(
            <DailyClosingManager
                businessDayStatus={activeBusinessDay}
                onBusinessDayStatusChange={onBusinessDayStatusChange}
            />,
        )

        await screen.findByRole('heading', { name: 'Start or end a business day' })
        await user.click(screen.getByRole('button', { name: 'End day' }))
        await screen.findByRole('alertdialog', { name: 'End 2026-09-15' })
        await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'End day' }))

        expect(await screen.findByText('We could not end the business day. Please try again.')).toBeInTheDocument()
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
        expect(onBusinessDayStatusChange).not.toHaveBeenCalled()
    })
})