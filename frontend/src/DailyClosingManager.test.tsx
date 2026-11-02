import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    expenseCount: 5,
    expenses: 140,
    id: 1,
    individualTotals: [
        { source: 'Rimo (Secondary QR)', income: 60, refunds: 0, expenses: 40, difference: 20 },
        { source: 'Rjoe', income: 0, refunds: 0, expenses: 5, difference: -5 },
        { source: 'Rishi (Primary QR)', income: 180, refunds: 0, expenses: 20, difference: 160 },
        { source: 'Dinda', income: 0, refunds: 0, expenses: 0, difference: 0 },
        { source: 'Cash', income: 120, refunds: 0, expenses: 75, difference: 45 },
    ],
    onlineSales: 240,
    paidOrderCount: 2,
    profits: 220,
    refunds: 0,
    revenue: 360,
    startedAt: '2026-09-15T12:00:00Z',
}

const dailyClosingPreview = {
    cashSales: 120,
    closingDate: '2026-09-15',
    endedAt: '2026-09-15T20:00:00Z',
    expenseCount: 5,
    expenses: 140,
    individualTotals: dailyClosing.individualTotals,
    onlineSales: 240,
    paidOrderCount: 2,
    profits: 220,
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
            expect(liveCells[6]).toHaveTextContent('₹220.00')
        })
        await user.click(screen.getByRole('tab', { name: 'Individual Saved Totals' }))
        const periodGroup = screen.getByRole('group', { name: 'Individual totals period' })
        expect(within(periodGroup).getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true')
        for (const period of ['Month', 'Quarter', 'Till now']) {
            const button = within(periodGroup).getByRole('button', { name: period })
            await user.click(button)
            expect(button).toHaveAttribute('aria-pressed', 'true')
        }
        expect(screen.queryByLabelText('Anchor date')).not.toBeInTheDocument()
        await user.click(within(periodGroup).getByRole('button', { name: 'Day' }))
        expect(screen.getByLabelText('Anchor date')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Anchor date'), { target: { value: '2026-09-15' } })
        const individualTable = await screen.findByRole('table', { name: 'Individual saved totals' })
        const liveRishiRow = within(individualTable).getByRole('row', { name: /Rishi \(Primary QR\)/ })
        expect(liveRishiRow).toHaveTextContent('₹180.00')
        expect(liveRishiRow).toHaveTextContent('₹160.00')
        await user.click(screen.getByRole('tab', { name: 'Daily Saved Totals' }))
        await user.click(screen.getByRole('button', { name: 'End day' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            '/api/daily-closings/preview',
            expect.objectContaining({ credentials: 'include' }),
        )
        expect(await screen.findByRole('alertdialog', { name: 'End 2026-09-15' })).toHaveTextContent('₹360.00')
        expect(screen.getByRole('alertdialog')).toHaveTextContent('₹220.00')
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
        expect(within(closingTable).getByText('₹220.00')).toBeInTheDocument()
        await user.click(screen.getByRole('tab', { name: 'Individual Saved Totals' }))
        fireEvent.change(screen.getByLabelText('Anchor date'), { target: { value: '2026-09-15' } })
        const savedIndividualTable = screen.getByRole('table', { name: 'Individual saved totals' })
        const savedRishiRow = within(savedIndividualTable).getByRole('row', { name: /Rishi \(Primary QR\)/ })
        expect(savedRishiRow).toHaveTextContent('₹180.00')
        expect(savedRishiRow).toHaveTextContent('₹160.00')
    })

    it('refreshes the active individual totals on demand', async () => {
        let previewCount = 0
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
            if (String(input) === '/api/daily-closings') return jsonResponse([])
            if (String(input) === '/api/daily-closings/preview') {
                previewCount += 1
                return jsonResponse(previewCount === 1
                    ? dailyClosingPreview
                    : {
                        ...dailyClosingPreview,
                        expenseCount: 6,
                        expenses: 150,
                        profits: 210,
                        individualTotals: dailyClosingPreview.individualTotals?.map((total) => total.source === 'Rishi (Primary QR)'
                            ? { ...total, expenses: 30, difference: 150 }
                            : total),
                    })
            }
            throw new Error(`Unexpected request: ${String(input)}`)
        })
        const user = userEvent.setup()

        render(
            <DailyClosingManager
                businessDayStatus={activeBusinessDay}
                onBusinessDayStatusChange={() => undefined}
            />,
        )

        await user.click(await screen.findByRole('tab', { name: 'Individual Saved Totals' }))
        fireEvent.change(screen.getByLabelText('Anchor date'), { target: { value: '2026-09-15' } })
        const table = await screen.findByRole('table', { name: 'Individual saved totals' })
        const rishiRow = within(table).getByRole('row', { name: /Rishi \(Primary QR\)/ })
        expect(rishiRow).toHaveTextContent('₹160.00')

        await user.click(screen.getByRole('button', { name: 'Refresh individual totals' }))

        await waitFor(() => expect(rishiRow).toHaveTextContent('₹150.00'))
        expect(previewCount).toBeGreaterThan(1)
        expect(fetchMock).toHaveBeenCalledWith('/api/daily-closings/preview', expect.objectContaining({ credentials: 'include' }))
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

    it('marks historical closings without individual snapshots as not recorded', async () => {
        const legacyClosing = { ...dailyClosing, individualTotals: undefined }
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse([legacyClosing]))
        const user = userEvent.setup()

        render(
            <DailyClosingManager
                businessDayStatus={inactiveBusinessDay}
                onBusinessDayStatusChange={() => undefined}
            />,
        )

        await user.click(await screen.findByRole('tab', { name: 'Individual Saved Totals' }))
        fireEvent.change(screen.getByLabelText('Anchor date'), { target: { value: '2026-09-15' } })

        expect(await screen.findByText('No individual totals were recorded for this period.')).toBeInTheDocument()
        expect(screen.getByText(/1 closed day has no individual snapshot/)).toBeInTheDocument()
        expect(screen.queryByRole('table', { name: 'Individual saved totals' })).not.toBeInTheDocument()
    })
})