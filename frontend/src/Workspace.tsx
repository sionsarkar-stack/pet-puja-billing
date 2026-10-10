import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { getRestaurantMark, useRestaurantConfiguration } from './RestaurantConfiguration'
import type { UserMode } from './userMode'
import BalanceSheetManager from './BalanceSheetManager'
import BackupManager from './BackupManager'
import DailyClosingManager from './DailyClosingManager'
import ExpensesManager from './ExpensesManager'
import HistoryManager from './HistoryManager'
import MenuManager from './MenuManager'
import TableManager from './TableManager'
import { useStackedTables } from './stackedTables'
import { Watermark } from './Watermark'
import { apiBaseUrl } from './financial'

type WorkspaceProps = {
    isLoggingOut: boolean
    mode: UserMode
    onLogout: () => Promise<void>
    username: string
}

type WorkspaceTab = 'table' | 'menu' | 'history' | 'expenses' | 'daily-close' | 'balance-sheet' | 'backup'

const tabs: Array<{ id: WorkspaceTab; label: string }> = [
    { id: 'table', label: 'Table' },
    { id: 'menu', label: 'Menu' },
    { id: 'history', label: 'History' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'daily-close', label: 'Daily close' },
    { id: 'balance-sheet', label: 'Balance sheet' },
    { id: 'backup', label: 'Backup' },
]

function Workspace({ isLoggingOut, mode, onLogout, username }: WorkspaceProps) {
    const { restaurantName } = useRestaurantConfiguration()
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('table')
    const [hasOpenedTable, setHasOpenedTable] = useState(true)
    const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([])
    const shellRef = useRef<HTMLDivElement>(null)
    useStackedTables(shellRef)

    useEffect(() => {
        document.getElementById(`tab-${activeTab}`)?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
    }, [activeTab])
    const [backupAvailable, setBackupAvailable] = useState(true)

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

    function selectTab(tab: WorkspaceTab) {
        setActiveTab(tab)
        if (tab === 'table') {
            setHasOpenedTable(true)
        }
    }

    function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tabIndex: number) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

        event.preventDefault()
        const nextTabIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
                ? visibleTabs.length - 1
                : (tabIndex + (event.key === 'ArrowRight' ? 1 : -1) + visibleTabs.length) % visibleTabs.length
        const nextTab = visibleTabs[nextTabIndex]

        selectTab(nextTab.id)
        tabButtonRefs.current[nextTabIndex]?.focus()
    }

    return (
        <main className="workspace-page">
            <header className="workspace-header">
                <a className="brand" href="/" aria-label={`${restaurantName} home`}>
                    <span className="brand-mark">{getRestaurantMark(restaurantName)}</span>
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
                <nav aria-label="Restaurant management" className="workspace-tabs" role="tablist">
                    {visibleTabs.map((tab, index) => (
                        <button
                            aria-controls={`panel-${tab.id}`}
                            aria-selected={activeTab === tab.id}
                            id={`tab-${tab.id}`}
                            key={tab.id}
                            onClick={() => selectTab(tab.id)}
                            onKeyDown={(event) => handleTabKeyDown(event, index)}
                            ref={(element) => {
                                tabButtonRefs.current[index] = element
                            }}
                            role="tab"
                            tabIndex={activeTab === tab.id ? 0 : -1}
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
                        <MenuManager canManage={mode === 'ADMIN'} />
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
                        <TableManager isActive={activeTab === 'table'} />
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

                {activeTab === 'daily-close' && (
                    <section
                        aria-labelledby="tab-daily-close"
                        className="workspace-content"
                        id="panel-daily-close"
                        role="tabpanel"
                    >
                        <DailyClosingManager />
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