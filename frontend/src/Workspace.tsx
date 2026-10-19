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

type WorkspaceProps = {
    isLoggingOut: boolean
    mode: UserMode
    onLogout: () => Promise<void>
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
    { src: '/players/rooney.webp', position: 'center 18%' },
    { src: '/players/manchester-united.jpg', position: 'center' },
    { src: '/players/Lion_quote_2.webp', position: 'center' },
    { src: '/players/lion_quote.webp', position: 'center' },
    { src: '/players/Sachin.jpg', position: 'center' },
    { src: '/players/netaji.jpeg', position: 'center' },
    { src: '/players/Introdcution_statement.png', position: 'center' },
]

function Workspace({ isLoggingOut, mode, onLogout, username }: WorkspaceProps) {
    const { restaurantName } = useRestaurantConfiguration()
    const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => mode === 'ADMIN' ? 'daily-close' : 'menu')
    const [businessDayStatus, setBusinessDayStatus] = useState<BusinessDayStatus>({
        active: false,
        startedAt: null,
        businessDate: null,
    })
    const [businessDayStatusLoaded, setBusinessDayStatusLoaded] = useState(false)
    const [hasOpenedTable, setHasOpenedTable] = useState(true)
    const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
    const shellRef = useRef<HTMLDivElement>(null)
    useStackedTables(shellRef)

    useEffect(() => {
        document.getElementById(`tab-${activeTab}`)?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
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

    function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

        event.preventDefault()
        const enabledTabs = visibleTabs
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
        tabButtonRefs.current[nextTab.index]?.focus()
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
                    <span className="brand-mark"><img alt="" src="/crest.png" /></span>
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
                <nav aria-label="Restaurant management" className="workspace-tabs" role="tablist">
                    {visibleTabs.map((tab, index) => (
                        <button
                            aria-controls={`panel-${tab.id}`}
                            aria-selected={activeTab === tab.id}
                            disabled={isTabDisabled(tab.id)}
                            id={`tab-${tab.id}`}
                            key={tab.id}
                            onClick={() => selectTab(tab.id)}
                            onKeyDown={(event) => handleTabKeyDown(event, index)}
                            ref={(element) => {
                                tabButtonRefs.current[index] = element
                            }}
                            role="tab"
                            tabIndex={activeTab === tab.id ? 0 : -1}
                            title={isTabDisabled(tab.id) ? 'Start a business day before opening tables' : undefined}
                            type="button"
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>

                {activeTab === 'menu' && (
                    <section
                        aria-labelledby="tab-menu"
                        className="workspace-content"
                        id="panel-menu"
                        role="tabpanel"
                    >
                        <DetailsManager mode={mode} />
                    </section>
                )}

                {hasOpenedTable && (
                    <section
                        aria-labelledby="tab-table"
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
                        aria-labelledby="tab-history"
                        className="workspace-content"
                        id="panel-history"
                        role="tabpanel"
                    >
                        <HistoryManager mode={mode} />
                    </section>
                )}

                {activeTab === 'customers' && mode === 'ADMIN' && (
                    <section
                        aria-labelledby="tab-customers"
                        className="workspace-content"
                        id="panel-customers"
                        role="tabpanel"
                    >
                        <CustomerDetailsManager />
                    </section>
                )}

                {activeTab === 'expenses' && (
                    <section
                        aria-labelledby="tab-expenses"
                        className="workspace-content"
                        id="panel-expenses"
                        role="tabpanel"
                    >
                        <ExpensesManager />
                    </section>
                )}

                {activeTab === 'balance-sheet' && (
                    <section
                        aria-labelledby="tab-balance-sheet"
                        className="workspace-content"
                        id="panel-balance-sheet"
                        role="tabpanel"
                    >
                        <BalanceSheetManager />
                    </section>
                )}

                {activeTab === 'profit-fact' && (
                    <section
                        aria-labelledby="tab-profit-fact"
                        className="workspace-content"
                        id="panel-profit-fact"
                        role="tabpanel"
                    >
                        <ProfitFactManager />
                    </section>
                )}

                {activeTab === 'daily-close' && (
                    <section
                        aria-labelledby="tab-daily-close"
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
                        aria-labelledby="tab-backup"
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