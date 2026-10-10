import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Workspace from './Workspace'

vi.mock('./BalanceSheetManager', () => ({ default: () => <p>Balance sheet content</p> }))
vi.mock('./BackupManager', () => ({ default: () => <p>Backup content</p> }))
vi.mock('./DailyClosingManager', () => ({ default: () => <p>Daily close content</p> }))
vi.mock('./ExpensesManager', () => ({ default: () => <p>Expenses content</p> }))
vi.mock('./HistoryManager', () => ({ default: () => <p>History content</p> }))
vi.mock('./MenuManager', () => ({ default: () => <p>Menu content</p> }))
vi.mock('./TableManager', () => ({ default: () => <p>Table content</p> }))

describe('Workspace', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('switches management views with keyboard tab navigation', async () => {
        const user = userEvent.setup()

        render(<Workspace isLoggingOut={false} mode="ADMIN" onLogout={async () => { }} username="owner" />)

        const tableTab = screen.getByRole('tab', { name: 'Table' })
        expect(tableTab).toHaveAttribute('aria-selected', 'true')
        expect(tableTab).toHaveAttribute('tabindex', '0')
        expect(screen.getByText('Table content')).toBeInTheDocument()

        tableTab.focus()
        await user.keyboard('{ArrowRight}')

        const menuTab = screen.getByRole('tab', { name: 'Menu' })
        expect(menuTab).toHaveFocus()
        expect(menuTab).toHaveAttribute('aria-selected', 'true')
        expect(menuTab).toHaveAttribute('tabindex', '0')
        expect(tableTab).toHaveAttribute('tabindex', '-1')
        expect(screen.getByText('Menu content')).toBeInTheDocument()

        await user.keyboard('{End}')

        const backupTab = screen.getByRole('tab', { name: 'Backup' })
        expect(backupTab).toHaveFocus()
        expect(backupTab).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Backup content')).toBeInTheDocument()
    })

    it('limits Captain navigation to table, menu, and history', () => {
        render(<Workspace isLoggingOut={false} mode="CAPTAIN" onLogout={async () => { }} username="captain" />)

        expect(screen.getByRole('tab', { name: 'Table' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Menu' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Expenses' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Daily close' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Balance sheet' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Backup' })).not.toBeInTheDocument()
    })
})