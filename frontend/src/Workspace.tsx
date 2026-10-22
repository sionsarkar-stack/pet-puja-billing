import { Fragment, type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { useRestaurantConfiguration } from './RestaurantConfiguration'
import type { UserMode } from './userMode'
import BalanceSheetManager from './BalanceSheetManager'
import BackupManager from './BackupManager'
import DailyClosingManager from './DailyClosingManager'
import CustomerDetailsManager from './CustomerDetailsManager'
import ExpensesManager from './ExpensesManager'
import HistoryManager from './HistoryManager'
import DetailsManager from './DetailsManager'
import ProfitFactManager from './ProfitFactManager'
import TableManager from './TableManager'
import { useStackedTables } from './stackedTables'
import { Watermark } from './Watermark'
import { apiBaseUrl, isBusinessDayStatus, type BusinessDayStatus } from './financial'
import type { ThemePreference } from './theme'

type WorkspaceProps = {
    isLoggingOut: boolean
    mode: UserMode
    onLogout: () => Promise<void>
    onThemeChange: (theme: ThemePreference) => void
    theme: ThemePreference
    username: string
}

type WorkspaceTab = 'table' | 'menu' | 'history' | 'customers' | 'expenses' | 'daily-close' | 'balance-sheet' | 'profit-fact' | 'backup'

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: 'table', label: 'Table' },
    { id: 'menu', label: 'Details' },
    { id: 'history', label: 'History' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'daily-close', label: 'Daily start/close' },
    { id: 'balance-sheet', label: 'Balance sheet' },
    { id: 'profit-fact', label: 'Revenue' },
    { id: 'backup', label: 'Backup' },
    { id: 'customers', label: 'Customer details' },
]

const bannerImages: Array<{ position: string; src: string }> = [
    { src: '/players/manchester-united.png', position: 'center' },
    { src: '/players/messi.jpg', position: 'center 20%' },
]

function Workspace({ isLoggingOut, mode, onLogout, onThemeChange, theme, username }: WorkspaceProps) {
    const { restaurantName } = useRestaurantConfiguration()
    const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => mode === 'ADMIN' ? 'daily-close' : 'menu')
    const [businessDayStatus, setBusinessDayStatus] = useState<BusinessDayStatus>({
        active: false,
        startedAt: null,
        businessDate: null,
    })
    const [businessDayStatusLoaded, setBusinessDayStatusLoaded] = useState(false)
    const [hasOpenedTable, setHasOpenedTable] = useState(true)
    const shellRef = useRef<HTMLDivElement>(null)
    useStackedTables(shellRef)

    useEffect(() => {
        document.querySelectorAll(`#desktop-tab-${activeTab}, #mobile-tab-${activeTab}`).forEach((tab) => {
            tab.scrollIntoView?.({ block: 'nearest', inline: 'center' })
        })
    }, [activeTab])
    const [backupAvailable, setBackupAvailable] = useState(true)

    useEffect(() => {
        let isMounted = true
        let hasLoadedInitialStatus = false
        let activeController: AbortController | null = null
        async function loadBusinessDayStatus() {
            activeController?.abort()
            const controller = new AbortController()
            activeController = controller
            try {
                const response = await fetch(`${apiBaseUrl}/api/daily-closings/status`, {
                    credentials: 'include',
                    signal: controller.signal,
                })
                if (!response.ok) throw new Error('Business day status load failed')
                const status: unknown = await response.json()
                if (!isBusinessDayStatus(status)) throw new Error('Business day status has an unexpected shape')

                if (isMounted) {
                    const isInitialStatus = !hasLoadedInitialStatus
                    hasLoadedInitialStatus = true
                    setBusinessDayStatus(status)
                    setActiveTab((currentTab) => status.active && isInitialStatus
                        ? 'table'
                        : !status.active && currentTab === 'table'
                            ? mode === 'ADMIN' ? 'daily-close' : 'menu'
                            : currentTab)
                }
            } catch {
                if (isMounted && !controller.signal.aborted) {
                    setBusinessDayStatus({ active: false, startedAt: null, businessDate: null })
                    setActiveTab((currentTab) => currentTab === 'table'
                        ? mode === 'ADMIN' ? 'daily-close' : 'menu'
                        : currentTab)
                }
            } finally {
                if (isMounted && !controller.signal.aborted) setBusinessDayStatusLoaded(true)
            }
        }

        void loadBusinessDayStatus()
        const intervalId = window.setInterval(() => void loadBusinessDayStatus(), 15_000)
        return () => {
            isMounted = false
            window.clearInterval(intervalId)
            activeController?.abort()
        }
    }, [mode])

    useEffect(() => {
        if (mode !== 'ADMIN') return
        const controller = new AbortController()
        fetch(`${apiBaseUrl}/api/backups/status`, { credentials: 'include', signal: controller.signal })
            .then((response) => (response.ok ? response.json() : null))
            .then((body) => {
                if (body?.available === false) setBackupAvailable(false)
            })
            .catch(() => undefined)
        return () => controller.abort()
    }, [mode])

    const visibleTabs = mode === 'ADMIN'
        ? tabs.filter((tab) => tab.id !== 'backup' || backupAvailable)
        : tabs.filter((tab) => tab.id === 'table' || tab.id === 'menu' || tab.id === 'history')
    const primaryTabs = visibleTabs.filter((tab) => tab.id === 'table' || tab.id === 'menu' || tab.id === 'history')
    const moreTabs = visibleTabs.filter((tab) => !primaryTabs.includes(tab))
    const activeMoreTab = moreTabs.find((tab) => tab.id === activeTab)

    function isTabDisabled(tab: WorkspaceTab) {
        return tab === 'table' && (!businessDayStatusLoaded || !businessDayStatus.active)
    }

    function selectTab(tab: WorkspaceTab) {
        if (isTabDisabled(tab)) return
        setActiveTab(tab)
        if (tab === 'table') {
            setHasOpenedTable(true)
        }
    }

    function handleTabKeyDown(
        event: KeyboardEvent<HTMLButtonElement>,
        tabList: typeof visibleTabs,
        tabIndex: number,
    ) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

        event.preventDefault()
        const enabledTabs = tabList
            .map((tab, index) => ({ tab, index }))
            .filter(({ tab }) => !isTabDisabled(tab.id))
        const currentEnabledIndex = enabledTabs.findIndex(({ index }) => index === tabIndex)
        if (currentEnabledIndex < 0 || enabledTabs.length === 0) return

        const nextEnabledIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
                ? enabledTabs.length - 1
                : (currentEnabledIndex + (event.key === 'ArrowRight' ? 1 : -1) + enabledTabs.length) % enabledTabs.length
        const nextTab = enabledTabs[nextEnabledIndex]

        selectTab(nextTab.tab.id)
        const tabButtons = event.currentTarget.closest('[role="tablist"]')?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
        tabButtons?.[nextTab.index]?.focus()
    }

    function renderTab(
        tab: typeof visibleTabs[number],
        idPrefix: string,
        tabList: typeof visibleTabs,
        closeMoreMenu = false,
    ) {
        const tabIndex = tabList.indexOf(tab)
        return (
            <button
                aria-controls={`panel-${tab.id}`}
                aria-selected={activeTab === tab.id}
                disabled={isTabDisabled(tab.id)}
                id={`${idPrefix}-tab-${tab.id}`}
                key={tab.id}
                onClick={(event) => {
                    selectTab(tab.id)
                    if (closeMoreMenu) {
                        const moreMenu = event.currentTarget.closest('details')
                        if (moreMenu) {
                            moreMenu.removeAttribute('open')
                            moreMenu.querySelector('summary')?.focus()
                        }
                    }
                }}
                onKeyDown={(event) => handleTabKeyDown(event, tabList, tabIndex)}
                role="tab"
                tabIndex={activeTab === tab.id ? 0 : -1}
                title={isTabDisabled(tab.id) ? 'Start a business day before opening tables' : undefined}
                type="button"
            >
                {tab.label}
            </button>
        )
    }

    function handleBusinessDayStatusChange(status: BusinessDayStatus) {
        setBusinessDayStatus(status)
        setBusinessDayStatusLoaded(true)
        setActiveTab(status.active ? 'table' : mode === 'ADMIN' ? 'daily-close' : 'menu')
    }

    return (
        <main className="workspace-page">
            <header className="workspace-header">
                <a className="brand" href="/" aria-label={`${restaurantName} home`}>
                    <span aria-hidden="true" className="brand-mark">{restaurantName.slice(0, 1).toUpperCase()}</span>
                    <span>{restaurantName}</span>
                </a>

                <div className="workspace-user">
                    <span>{username}</span>
                    <span className="workspace-mode">{mode === 'ADMIN' ? 'Admin mode' : 'Captain mode'}</span>
                    <button disabled={isLoggingOut} onClick={onLogout} type="button">
                        {isLoggingOut ? 'Signing out...' : 'Sign out'}
                    </button>
                </div>
            </header>

            <div className="workspace-shell" ref={shellRef}>
                <div aria-hidden="true" className="workspace-banner">
                    {bannerImages.map((image, index) => (
                        <Fragment key={image.src}>
                            <span
                                aria-hidden="true"
                                className="banner-slide-backdrop"
                                style={{
                                    animationDelay: `${index * 6}s`,
                                    backgroundImage: `url("${image.src}")`,
                                    backgroundPosition: image.position,
                                }}
                            />
                            <img
                                alt=""
                                className="banner-slide"
                                src={image.src}
                                style={{
                                    animationDelay: `${index * 6}s`,
                                    objectFit: 'contain',
                                    objectPosition: image.position,
                                }}
                            />
                        </Fragment>
                    ))}
                    <span className="banner-title">{restaurantName}</span>
                </div>
                <nav aria-label="Restaurant management" className="workspace-tabs workspace-tabs-desktop" role="tablist">
                    {visibleTabs.map((tab) => renderTab(tab, 'desktop', visibleTabs))}
                </nav>
                <nav aria-label="Restaurant management on mobile" className="workspace-tabs workspace-tabs-mobile">
                    <div aria-label="Primary sections" className="workspace-tabs-primary" role="tablist">
                        {primaryTabs.map((tab) => renderTab(tab, 'mobile', primaryTabs))}
                    </div>
                    {moreTabs.length > 0 && (
                        <details className="workspace-more">
                            <summary
                                aria-label={activeMoreTab ? `More sections, ${activeMoreTab.label} selected` : 'More sections'}
                                data-has-active={activeMoreTab ? 'true' : 'false'}
                            >
                                More
                            </summary>
                            <div aria-label="More sections" className="workspace-more-menu" role="tablist">
                                {moreTabs.map((tab) => renderTab(tab, 'mobile', moreTabs, true))}
                            </div>
                        </details>
                    )}
                </nav>

                {activeTab === 'menu' && (
                    <section
                        aria-label="Details"
                        className="workspace-content"
                        id="panel-menu"
                        role="tabpanel"
                    >
                        <DetailsManager mode={mode} onThemeChange={onThemeChange} theme={theme} />
                    </section>
                )}

                {hasOpenedTable && (
                    <section
                        aria-label="Table"
                        className="workspace-content"
                        hidden={activeTab !== 'table'}
                        id="panel-table"
                        role="tabpanel"
                    >
                        <TableManager canManageCommitteeMembers={mode === 'ADMIN'} isActive={activeTab === 'table'} />
                    </section>
                )}

                {activeTab === 'history' && (
                    <section
                        aria-label="History"
                        className="workspace-content"
                        id="panel-history"
                        role="tabpanel"
                    >
                        <HistoryManager mode={mode} />
                    </section>
                )}

                {activeTab === 'customers' && mode === 'ADMIN' && (
                    <section
                        aria-label="Customer details"
                        className="workspace-content"
                        id="panel-customers"
                        role="tabpanel"
                    >
                        <CustomerDetailsManager />
                    </section>
                )}

                {activeTab === 'expenses' && (
                    <section
                        aria-label="Expenses"
                        className="workspace-content"
                        id="panel-expenses"
                        role="tabpanel"
                    >
                        <ExpensesManager />
                    </section>
                )}

                {activeTab === 'balance-sheet' && (
                    <section
                        aria-label="Balance sheet"
                        className="workspace-content"
                        id="panel-balance-sheet"
                        role="tabpanel"
                    >
                        <BalanceSheetManager />
                    </section>
                )}

                {activeTab === 'profit-fact' && (
                    <section
                        aria-label="Revenue"
                        className="workspace-content"
                        id="panel-profit-fact"
                        role="tabpanel"
                    >
                        <ProfitFactManager />
                    </section>
                )}

                {activeTab === 'daily-close' && (
                    <section
                        aria-label="Daily start/close"
                        className="workspace-content"
                        id="panel-daily-close"
                        role="tabpanel"
                    >
                        <DailyClosingManager
                            businessDayStatus={businessDayStatus}
                            onBusinessDayStatusChange={handleBusinessDayStatusChange}
                        />
                    </section>
                )}

                {activeTab === 'backup' && (
                    <section
                        aria-label="Backup"
                        className="workspace-content"
                        id="panel-backup"
                        role="tabpanel"
                    >
                        <BackupManager />
                    </section>
                )}
            </div>
            <Watermark />
        </main>
    )
}

export default Workspace