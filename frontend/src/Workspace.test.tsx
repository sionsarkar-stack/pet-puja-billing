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
vi.mock('./CustomerDetailsManager', () => ({ default: () => <p>Customer directory content</p> }))
vi.mock('./DailyClosingManager', () => ({
    default: ({ onBusinessDayStatusChange }: {
        onBusinessDayStatusChange: (status: { active: boolean; startedAt: string | null; businessDate: string | null }) => void
    }) => (
        <div>
            <p>Daily start/close content</p>
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
vi.mock('./ProfitFactManager', () => ({ default: () => <p>Revenue content</p> }))
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

        await user.click(screen.getByRole('tab', { name: 'Revenue' }))
        expect(screen.getByText('Revenue content')).toBeInTheDocument()

        await user.click(screen.getByRole('tab', { name: 'Customer details' }))
        expect(screen.getByText('Customer directory content')).toBeInTheDocument()

        await user.keyboard('{End}')

        const customerDetailsTab = screen.getByRole('tab', { name: 'Customer details' })
        expect(customerDetailsTab).toHaveFocus()
        expect(customerDetailsTab).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Customer directory content')).toBeInTheDocument()
    })

    it('rotates through the existing and newly supplied workspace images', () => {
        mockBusinessDayStatus(true)

        render(<Workspace isLoggingOut={false} mode="ADMIN" onLogout={async () => { }} username="owner" />)

        const imageSources = Array.from(document.querySelectorAll<HTMLImageElement>('.workspace-banner .banner-slide'))
            .map((image) => image.getAttribute('src'))
        const bannerImages = Array.from(document.querySelectorAll<HTMLImageElement>('.workspace-banner .banner-slide'))
        expect(imageSources).toHaveLength(9)
        expect(document.querySelectorAll('.workspace-banner .banner-slide-backdrop')).toHaveLength(9)
        expect(bannerImages.every((image) => image.style.objectFit === 'contain')).toBe(true)
        expect(imageSources).toContain('/players/Lion_quote_2.webp')
        expect(imageSources).toContain('/players/Sachin.jpg')
        expect(imageSources).toContain('/players/netaji.jpeg')
        expect(imageSources).toContain('/players/manchester-united.png')
    })

    it('limits Captain navigation to table, menu, and history', () => {
        mockBusinessDayStatus(false)
        render(<Workspace isLoggingOut={false} mode="CAPTAIN" onLogout={async () => { }} username="captain" />)

        expect(screen.getByRole('tab', { name: 'Table' })).toBeDisabled()
        expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Customer details' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Expenses' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Daily start/close' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Balance sheet' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Revenue by section' })).not.toBeInTheDocument()
        expect(screen.queryByRole('tab', { name: 'Backup' })).not.toBeInTheDocument()
    })

    it('keeps Table disabled and opens Daily start/close until the Admin starts a day', async () => {
        const user = userEvent.setup()
        mockBusinessDayStatus(false)

        render(<Workspace isLoggingOut={false} mode="ADMIN" onLogout={async () => { }} username="owner" />)

        const tableTab = await screen.findByRole('tab', { name: 'Table' })
        expect(tableTab).toBeDisabled()
        expect(screen.getByRole('tab', { name: 'Daily start/close' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Daily start/close content')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Start day' }))
        expect(tableTab).toBeEnabled()
        expect(tableTab).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Table content')).toBeInTheDocument()
    })
})