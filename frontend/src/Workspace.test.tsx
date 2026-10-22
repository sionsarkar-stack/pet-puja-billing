import { cleanup, render, screen, within } from '@testing-library/react'
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

        render(<Workspace isLoggingOut={false} mode="ADMIN" onLogout={async () => { }} onThemeChange={() => undefined} theme="light" username="owner" />)
        const desktopTabs = within(screen.getByRole('tablist', { name: 'Restaurant management' }))

        const tableTab = await desktopTabs.findByRole('tab', { name: 'Table' })
        expect(tableTab).toHaveAttribute('aria-selected', 'true')
        expect(tableTab).toHaveAttribute('tabindex', '0')
        expect(screen.getByText('Table content')).toBeInTheDocument()

        tableTab.focus()
        await user.keyboard('{ArrowRight}')

        const detailsTab = desktopTabs.getByRole('tab', { name: 'Details' })
        expect(detailsTab).toHaveFocus()
        expect(detailsTab).toHaveAttribute('aria-selected', 'true')
        expect(detailsTab).toHaveAttribute('tabindex', '0')
        expect(tableTab).toHaveAttribute('tabindex', '-1')
        expect(screen.getByText('Details content')).toBeInTheDocument()

        await user.click(desktopTabs.getByRole('tab', { name: 'Revenue' }))
        expect(screen.getByText('Revenue content')).toBeInTheDocument()

        await user.click(desktopTabs.getByRole('tab', { name: 'Customer details' }))
        expect(screen.getByText('Customer directory content')).toBeInTheDocument()

        await user.keyboard('{End}')

        const customerDetailsTab = desktopTabs.getByRole('tab', { name: 'Customer details' })
        expect(customerDetailsTab).toHaveFocus()
        expect(customerDetailsTab).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Customer directory content')).toBeInTheDocument()
    })

    it('rotates through the Messi and Manchester United workspace images', () => {
        mockBusinessDayStatus(true)

        render(<Workspace isLoggingOut={false} mode="ADMIN" onLogout={async () => { }} onThemeChange={() => undefined} theme="light" username="owner" />)

        const imageSources = Array.from(document.querySelectorAll<HTMLImageElement>('.workspace-banner .banner-slide'))
            .map((image) => image.getAttribute('src'))
        const bannerImages = Array.from(document.querySelectorAll<HTMLImageElement>('.workspace-banner .banner-slide'))
        expect(imageSources).toHaveLength(2)
        expect(document.querySelectorAll('.workspace-banner .banner-slide-backdrop')).toHaveLength(2)
        expect(bannerImages.every((image) => image.style.objectFit === 'contain')).toBe(true)
        expect(imageSources).toContain('/players/manchester-united.png')
        expect(imageSources).toContain('/players/messi.jpg')
    })

    it('keeps primary sections visible and opens secondary Admin sections from More', async () => {
        mockBusinessDayStatus(true)
        const user = userEvent.setup()

        render(<Workspace isLoggingOut={false} mode="ADMIN" onLogout={async () => { }} onThemeChange={() => undefined} theme="light" username="owner" />)

        const mobileNavigationElement = screen.getByRole('navigation', { name: 'Restaurant management on mobile' })
        const mobileNavigation = within(mobileNavigationElement)
        const primaryTabs = within(mobileNavigation.getByRole('tablist', { name: 'Primary sections' }))
        const moreTabs = within(mobileNavigation.getByRole('tablist', { name: 'More sections' }))
        expect(primaryTabs.getByRole('tab', { name: 'Table' })).toBeInTheDocument()
        expect(primaryTabs.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
        expect(primaryTabs.getByRole('tab', { name: 'History' })).toBeInTheDocument()
        expect(primaryTabs.queryByRole('tab', { name: 'Expenses' })).not.toBeInTheDocument()

        const moreButton = mobileNavigation.getByText('More', { selector: 'summary' })
        await user.click(moreButton)
        await user.click(moreTabs.getByRole('tab', { name: 'Revenue' }))

        expect(screen.getByText('Revenue content')).toBeInTheDocument()
        expect(moreButton).toHaveFocus()
        expect(mobileNavigationElement.querySelector('details')).not.toHaveAttribute('open')
    })

    it('limits Captain navigation to table, menu, and history', () => {
        mockBusinessDayStatus(false)
        render(<Workspace isLoggingOut={false} mode="CAPTAIN" onLogout={async () => { }} onThemeChange={() => undefined} theme="light" username="captain" />)
        const captainTabs = within(screen.getByRole('tablist', { name: 'Restaurant management' }))

        expect(captainTabs.getByRole('tab', { name: 'Table' })).toBeDisabled()
        expect(captainTabs.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
        expect(captainTabs.getByRole('tab', { name: 'History' })).toBeInTheDocument()
        expect(captainTabs.queryByRole('tab', { name: 'Customer details' })).not.toBeInTheDocument()
        expect(captainTabs.queryByRole('tab', { name: 'Expenses' })).not.toBeInTheDocument()
        expect(captainTabs.queryByRole('tab', { name: 'Daily start/close' })).not.toBeInTheDocument()
        expect(captainTabs.queryByRole('tab', { name: 'Balance sheet' })).not.toBeInTheDocument()
        expect(captainTabs.queryByRole('tab', { name: 'Revenue by section' })).not.toBeInTheDocument()
        expect(captainTabs.queryByRole('tab', { name: 'Backup' })).not.toBeInTheDocument()
    })

    it('keeps Table disabled and opens Daily start/close until the Admin starts a day', async () => {
        const user = userEvent.setup()
        mockBusinessDayStatus(false)

        render(<Workspace isLoggingOut={false} mode="ADMIN" onLogout={async () => { }} onThemeChange={() => undefined} theme="light" username="owner" />)
        const desktopTabs = within(screen.getByRole('tablist', { name: 'Restaurant management' }))

        const tableTab = await desktopTabs.findByRole('tab', { name: 'Table' })
        expect(tableTab).toBeDisabled()
        expect(desktopTabs.getByRole('tab', { name: 'Daily start/close' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Daily start/close content')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Start day' }))
        expect(tableTab).toBeEnabled()
        expect(tableTab).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Table content')).toBeInTheDocument()
    })
})