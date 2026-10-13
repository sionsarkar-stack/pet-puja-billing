import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Workspace from './Workspace'

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
    })
}

function mockBusinessDayStatus(active: boolean) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const path = String(input)
        if (path.endsWith('/api/daily-closings/status')) {
            return jsonResponse({
                active,
                businessDate: active ? '2026-09-15' : null,
                startedAt: active ? '2026-09-15T12:00:00Z' : null,
            })
        }
        return jsonResponse({ available: true })
    })
}

vi.mock('./BalanceSheetManager', () => ({ default: () => <p>Balance sheet content</p> }))
vi.mock('./BackupManager', () => ({ default: () => <p>Backup content</p> }))
vi.mock('./DailyClosingManager', () => ({
    default: ({ onBusinessDayStatusChange }: {
        onBusinessDayStatusChange: (status: { active: boolean; startedAt: string | null; businessDate: string | null }) => void
    }) => (
        <div>
            <p>Daily close content</p>
            <button onClick={() => onBusinessDayStatusChange({
                active: true,
                businessDate: '2026-09-15',
                startedAt: '2026-09-15T12:00:00Z',
            })} type="button">
                Start day
            </button>
        </div>
    ),
}))
vi.mock('./ExpensesManager', () => ({ default: () => <p>Expenses content</p> }))
vi.mock('./ProfitFactManager', () => ({ default: () => <p>Profit Fact content</p> }))
vi.mock('./HistoryManager', () => ({ default: () => <p>History content</p> }))
vi.mock('./DetailsManager', () => ({ default: () => <p>Details content</p> }))
vi.mock('./TableManager', () => ({ default: () => <p>Table content</p> }))

describe('Workspace', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('switches management views with keyboard tab navigation', async () => {
        mockBusinessDayStatus(true)
        const user = userEvent.setup()

        render(<Workspace isLoggingOut={false} mode="ADMIN" onLogout={async () => { }} username="owner" />)

        const tableTab = await screen.findByRole('tab', { name: 'Table' })
        expect(tableTab).toHaveAttribute('aria-selected', 'true')
        expect(tableTab).toHaveAttribute('tabindex', '0')
        expect(screen.getByText('Table content')).toBeInTheDocument()

        tableTab.focus()
        await user.keyboard('{ArrowRight}')

        const detailsTab = screen.getByRole('tab', { name: 'Details' })
        expect(detailsTab).toHaveFocus()
        expect(detailsTab).toHaveAttribute('aria-selected', 'true')
        expect(detailsTab).toHaveAttribute('tabindex', '0')
        expect(tableTab).toHaveAttribute('tabindex', '-1')
        expect(screen.getByText('Details content')).toBeInTheDocument()

        await user.click(screen.getByRole('tab', { name: 'Profit Fact' }))
        expect(screen.getByText('Profit Fact content')).toBeInTheDocument()

        await user.keyboard('{End}')

        const backupTab = screen.getByRole('tab', { name: 'Backup' })
        expect(backupTab).toHaveFocus()
        expect(backupTab).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Backup content')).toBeInTheDocument()
    })

    it('limits Captain navigation to table, menu, and history', () => {
        mockBusinessDayStatus(false)
        render(<Workspace isLoggingOut={false} mode="CAPTAIN" onLogout={async () => { }} username="captain" />)

        expect(screen.getByRole('tab', { name: 'Table' })).toBeDisabled()
        expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Expenses' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Daily close' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Balance sheet' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Profit Fact' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Backup' })).not.toBeInTheDocument()
    })

    it('keeps Table disabled and opens Daily close until the Admin starts a day', async () => {
        const user = userEvent.setup()
        mockBusinessDayStatus(false)

        render(<Workspace isLoggingOut={false} mode="ADMIN" onLogout={async () => { }} username="owner" />)

        const tableTab = await screen.findByRole('tab', { name: 'Table' })
        expect(tableTab).toBeDisabled()
        expect(screen.getByRole('tab', { name: 'Daily close' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Daily close content')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Start day' }))
        expect(tableTab).toBeEnabled()
        expect(tableTab).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Table content')).toBeInTheDocument()
    })
})