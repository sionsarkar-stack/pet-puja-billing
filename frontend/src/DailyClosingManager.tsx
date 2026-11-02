import { useEffect, useState } from 'react'
import ConfirmationDialog from './ConfirmationDialog'
import { getBusinessDateInputValue } from './businessDay'
import {
    apiBaseUrl,
    currencyFormatter,
    formatDateTime,
    isBusinessDayStatus,
    isDailyClosing,
    isDailyClosingPreview,
    isDailyClosings,
    type BusinessDayStatus,
    type DailyClosing,
    type DailyClosingPreview,
} from './financial'
import { getIndividualSavedTotals, getPeriodLabel, type ProfitPeriod } from './profitFact'

type DailyClosingMessage = {
    text: string
    tone: 'error' | 'success'
}

type DailyClosingManagerProps = {
    businessDayStatus: BusinessDayStatus
    onBusinessDayStatusChange: (status: BusinessDayStatus) => void
}

type SavedTotalsView = 'daily' | 'individual'

const individualPeriods: Array<{ id: ProfitPeriod; label: string }> = [
    { id: 'day', label: 'Day' },
    { id: 'month', label: 'Month' },
    { id: 'quarter', label: 'Quarter' },
    { id: 'all', label: 'Till now' },
]

function DailyClosingManager({ businessDayStatus, onBusinessDayStatusChange }: DailyClosingManagerProps) {
    const [dailyClosings, setDailyClosings] = useState<DailyClosing[]>([])
    const [message, setMessage] = useState<DailyClosingMessage | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isPreviewing, setIsPreviewing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [closingPreview, setClosingPreview] = useState<DailyClosingPreview | null>(null)
    const [activeDayPreview, setActiveDayPreview] = useState<DailyClosingPreview | null>(null)
    const [savedTotalsView, setSavedTotalsView] = useState<SavedTotalsView>('daily')
    const [individualPeriod, setIndividualPeriod] = useState<ProfitPeriod>('day')
    const [individualSelectedDate, setIndividualSelectedDate] = useState(() => getBusinessDateInputValue(new Date()))
    const [savedTotalsRefreshKey, setSavedTotalsRefreshKey] = useState(0)
    const currentActiveDayPreview = businessDayStatus.active
        && activeDayPreview?.startedAt === businessDayStatus.startedAt
        ? activeDayPreview
        : null
    const individualTotalsResult = getIndividualSavedTotals(
        dailyClosings,
        currentActiveDayPreview,
        individualPeriod,
        individualSelectedDate,
        new Date(),
    )

    useEffect(() => {
        const controller = new AbortController()

        async function loadDailyClosings() {
            try {
                const response = await fetch(`${apiBaseUrl}/api/daily-closings`, {
                    credentials: 'include',
                    signal: controller.signal,
                })
                if (!response.ok) throw new Error('Daily closings load failed')

                const data: unknown = await response.json()
                if (!isDailyClosings(data)) throw new Error('Daily closings response has an unexpected shape')
                setDailyClosings(data)
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setErrorMessage('We could not load daily closings. Please try again.')
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }

        void loadDailyClosings()
        return () => controller.abort()
    }, [savedTotalsRefreshKey])

    useEffect(() => {
        if (!businessDayStatus.active) return

        const controller = new AbortController()
        let isRefreshing = false

        async function refreshActiveDay() {
            if (isRefreshing) return
            isRefreshing = true
            try {
                const response = await fetch(`${apiBaseUrl}/api/daily-closings/preview`, {
                    credentials: 'include',
                    signal: controller.signal,
                })
                if (!response.ok) return

                const data: unknown = await response.json()
                if (isDailyClosingPreview(data) && !controller.signal.aborted) setActiveDayPreview(data)
            } catch {
                // Keep the last successful live totals visible during a transient network failure.
            } finally {
                isRefreshing = false
            }
        }

        void refreshActiveDay()
        const intervalId = window.setInterval(() => void refreshActiveDay(), 5_000)
        return () => {
            window.clearInterval(intervalId)
            controller.abort()
        }
    }, [businessDayStatus.active, businessDayStatus.startedAt, savedTotalsRefreshKey])

    async function startBusinessDay() {
        if (isSaving || businessDayStatus.active) return

        setIsSaving(true)
        setMessage(null)
        try {
            const response = await fetch(`${apiBaseUrl}/api/daily-closings/start`, {
                credentials: 'include',
                method: 'POST',
            })
            if (response.status === 409) {
                setMessage({ text: 'A business day is already active or this date has already been closed.', tone: 'error' })
                return
            }
            if (!response.ok) throw new Error('Business day start failed')

            const status: unknown = await response.json()
            if (!isBusinessDayStatus(status)) throw new Error('Business day status has an unexpected shape')
            setActiveDayPreview(null)
            onBusinessDayStatusChange(status)
            setMessage({ text: `Business day started for ${status.businessDate}.`, tone: 'success' })
        } catch {
            setMessage({ text: 'We could not start the business day. Please try again.', tone: 'error' })
        } finally {
            setIsSaving(false)
        }
    }

    async function previewEndBusinessDay() {
        if (isPreviewing || isSaving || !businessDayStatus.active) return

        setIsPreviewing(true)
        setMessage(null)
        try {
            const response = await fetch(`${apiBaseUrl}/api/daily-closings/preview`, {
                credentials: 'include',
            })
            if (!response.ok) throw new Error('Daily closing preview failed')

            const data: unknown = await response.json()
            if (!isDailyClosingPreview(data)) throw new Error('Daily closing preview has an unexpected shape')
            setClosingPreview(data)
        } catch {
            setMessage({ text: 'We could not prepare the closing summary. Please try again.', tone: 'error' })
        } finally {
            setIsPreviewing(false)
        }
    }

    async function endBusinessDay() {
        if (isSaving || closingPreview === null) return

        setIsSaving(true)
        setMessage(null)
        try {
            const response = await fetch(`${apiBaseUrl}/api/daily-closings/end`, {
                credentials: 'include',
                method: 'POST',
            })
            if (response.status === 409) {
                setClosingPreview(null)
                setMessage({ text: 'There is no active business day to end.', tone: 'error' })
                return
            }
            if (!response.ok) throw new Error('Daily closing save failed')

            const data: unknown = await response.json()
            if (!isDailyClosing(data)) throw new Error('Daily closing response has an unexpected shape')

            setDailyClosings((currentDailyClosings) => [data, ...currentDailyClosings]
                .sort((firstClosing, secondClosing) => secondClosing.closingDate.localeCompare(firstClosing.closingDate)))
            setActiveDayPreview(null)
            onBusinessDayStatusChange({ active: false, startedAt: null, businessDate: null })
            setClosingPreview(null)
            setMessage({ text: 'Business day ended and totals saved.', tone: 'success' })
        } catch {
            setClosingPreview(null)
            setMessage({ text: 'We could not end the business day. Please try again.', tone: 'error' })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="daily-close-workspace">
            <header className="daily-close-page-heading">
                <div>
                    <p className="eyebrow">Daily start/close</p>
                    <h1>Start or end a business day</h1>
                </div>
                <p>Start a day before opening tables. End it at any time; the start date labels its totals.</p>
            </header>

            {isLoading && <p className="financial-empty">Loading daily closings...</p>}
            {!isLoading && errorMessage && <p className="financial-message financial-message-error" role="alert">{errorMessage}</p>}

            {!isLoading && !errorMessage && (
                <>
                    <section aria-labelledby="daily-close-action-heading" className="daily-close-action">
                        <div>
                            <p className="eyebrow">Business day</p>
                            <h2 id="daily-close-action-heading">
                                {businessDayStatus.active ? businessDayStatus.businessDate : 'No day in progress'}
                            </h2>
                            {businessDayStatus.active ? (
                                <button disabled={isPreviewing || isSaving} onClick={() => void previewEndBusinessDay()} type="button">
                                    {isPreviewing ? 'Preparing review...' : 'End day'}
                                </button>
                            ) : (
                                <button disabled={isSaving} onClick={() => void startBusinessDay()} type="button">
                                    {isSaving ? 'Starting...' : 'Start day'}
                                </button>
                            )}
                            {businessDayStatus.active && businessDayStatus.startedAt && (
                                <p>Started {formatDateTime(businessDayStatus.startedAt)}</p>
                            )}
                        </div>
                    </section>

                    {message && (
                        <p className={`financial-message financial-message-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
                            {message.text}
                        </p>
                    )}

                    {closingPreview && (
                        <ConfirmationDialog
                            confirmLabel="End day"
                            isConfirming={isSaving}
                            message={`End the business day for ${closingPreview.closingDate}? Totals are recalculated at confirmation time and then saved as an immutable snapshot.`}
                            onCancel={() => setClosingPreview(null)}
                            onConfirm={() => void endBusinessDay()}
                            title={`End ${closingPreview.closingDate}`}
                        >
                            <dl className="daily-close-preview">
                                <div><dt>Started</dt><dd>{formatDateTime(closingPreview.startedAt)}</dd></div>
                                <div><dt>Ending</dt><dd>{formatDateTime(closingPreview.endedAt)}</dd></div>
                                <div><dt>Cash sales</dt><dd>{currencyFormatter.format(closingPreview.cashSales)}</dd></div>
                                <div><dt>Online sales</dt><dd>{currencyFormatter.format(closingPreview.onlineSales)}</dd></div>
                                <div><dt>Revenue</dt><dd>{currencyFormatter.format(closingPreview.revenue)}</dd></div>
                                <div><dt>Refunds</dt><dd>-{currencyFormatter.format(closingPreview.refunds)}</dd></div>
                                <div><dt>Expenses</dt><dd>-{currencyFormatter.format(closingPreview.expenses)}</dd></div>
                                <div className="daily-close-preview-profit"><dt>Profits</dt><dd>{currencyFormatter.format(closingPreview.profits)}</dd></div>
                                <div><dt>Records</dt><dd>{closingPreview.paidOrderCount} orders, {closingPreview.expenseCount} expenses</dd></div>
                            </dl>
                        </ConfirmationDialog>
                    )}

                    <nav aria-label="Saved totals views" className="daily-saved-total-tabs" role="tablist">
                        <button
                            aria-controls="daily-saved-totals-panel"
                            aria-selected={savedTotalsView === 'daily'}
                            id="daily-saved-totals-tab"
                            onClick={() => setSavedTotalsView('daily')}
                            role="tab"
                            type="button"
                        >Daily Saved Totals</button>
                        <button
                            aria-controls="individual-saved-totals-panel"
                            aria-selected={savedTotalsView === 'individual'}
                            id="individual-saved-totals-tab"
                            onClick={() => setSavedTotalsView('individual')}
                            role="tab"
                            type="button"
                        >Individual Saved Totals</button>
                    </nav>

                    {savedTotalsView === 'daily' && <section aria-labelledby="daily-closing-history-heading" className="financial-list daily-closing-list" id="daily-saved-totals-panel" role="tabpanel">
                        <header className="financial-list-heading">
                            <div>
                                <p className="eyebrow">Closing history</p>
                                <h2 id="daily-closing-history-heading">Daily Saved Totals</h2>
                            </div>
                            <span>{dailyClosings.length} {dailyClosings.length === 1 ? 'day' : 'days'}</span>
                        </header>

                        {dailyClosings.length === 0 && !businessDayStatus.active ? (
                            <p className="financial-empty">No business days have been closed yet.</p>
                        ) : (
                            <div className="financial-table-wrap daily-closing-table-wrap">
                                <table aria-label="Daily closing history" className="financial-table daily-closing-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Started</th>
                                            <th scope="col">Cash</th>
                                            <th scope="col">Online</th>
                                            <th scope="col">Revenue</th>
                                            <th scope="col">Refunds</th>
                                            <th scope="col">Expenses</th>
                                            <th scope="col">Profits</th>
                                            <th scope="col">Ended</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {businessDayStatus.active
                                            && businessDayStatus.startedAt
                                            && !dailyClosings.some((dailyClosing) => dailyClosing.closingDate === businessDayStatus.businessDate) && (
                                                <tr className="daily-closing-live-row">
                                                    <td><strong>{formatDateTime(businessDayStatus.startedAt)}</strong></td>
                                                    <td>{currencyFormatter.format(currentActiveDayPreview?.cashSales ?? 0)}</td>
                                                    <td>{currencyFormatter.format(currentActiveDayPreview?.onlineSales ?? 0)}</td>
                                                    <td>{currencyFormatter.format(currentActiveDayPreview?.revenue ?? 0)}</td>
                                                    <td>{currencyFormatter.format(-(currentActiveDayPreview?.refunds ?? 0))}</td>
                                                    <td>{currencyFormatter.format(currentActiveDayPreview?.expenses ?? 0)}</td>
                                                    <td>{currencyFormatter.format(currentActiveDayPreview?.profits ?? 0)}</td>
                                                    <td>Yet to close</td>
                                                </tr>
                                            )}
                                        {dailyClosings.map((dailyClosing) => (
                                            <tr key={dailyClosing.id}>
                                                <td className="daily-closing-started">
                                                    <strong>{dailyClosing.startedAt ? formatDateTime(dailyClosing.startedAt) : dailyClosing.closingDate}</strong>
                                                </td>
                                                <td>{currencyFormatter.format(dailyClosing.cashSales)}</td>
                                                <td>{currencyFormatter.format(dailyClosing.onlineSales)}</td>
                                                <td>{currencyFormatter.format(dailyClosing.revenue)}</td>
                                                <td>{currencyFormatter.format(-dailyClosing.refunds)}</td>
                                                <td>{currencyFormatter.format(dailyClosing.expenses)}</td>
                                                <td>{currencyFormatter.format(dailyClosing.profits)}</td>
                                                <td>{formatDateTime(dailyClosing.closedAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>}

                    {savedTotalsView === 'individual' && <section aria-labelledby="individual-saved-totals-heading" className="financial-list individual-saved-totals-list" id="individual-saved-totals-panel" role="tabpanel">
                        <header className="financial-list-heading">
                            <div>
                                <p className="eyebrow">Income less refunds and expenses</p>
                                <h2 id="individual-saved-totals-heading">Individual Saved Totals</h2>
                            </div>
                        </header>

                        <div className="individual-saved-totals-controls">
                            <fieldset className="profit-fact-periods">
                                <legend>Period</legend>
                                <div role="group" aria-label="Individual totals period">
                                    {individualPeriods.map((period) => (
                                        <button
                                            aria-pressed={individualPeriod === period.id}
                                            key={period.id}
                                            onClick={() => setIndividualPeriod(period.id)}
                                            type="button"
                                        >
                                            {period.label}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                            {individualPeriod !== 'all' && (
                                <label className="profit-fact-date" htmlFor="individual-saved-totals-date">
                                    <span>Anchor date</span>
                                    <input
                                        id="individual-saved-totals-date"
                                        max={getBusinessDateInputValue(new Date())}
                                        onChange={(event) => setIndividualSelectedDate(event.target.value)}
                                        type="date"
                                        value={individualSelectedDate}
                                    />
                                </label>
                            )}
                            <p className="individual-saved-totals-period">{getPeriodLabel(individualPeriod, individualSelectedDate)}</p>
                            <button
                                aria-label="Refresh individual totals"
                                className="profit-fact-refresh"
                                onClick={() => setSavedTotalsRefreshKey((currentKey) => currentKey + 1)}
                                type="button"
                            >Refresh</button>
                        </div>

                        {individualTotalsResult.unrecordedDays > 0 && (
                            <p className="individual-saved-totals-note" role="note">
                                {individualTotalsResult.unrecordedDays} {individualTotalsResult.unrecordedDays === 1 ? 'closed day has' : 'closed days have'} no individual snapshot and {individualTotalsResult.unrecordedDays === 1 ? 'is' : 'are'} excluded from these totals.
                            </p>
                        )}

                        {individualTotalsResult.totals.length === 0 ? (
                            <p className="financial-empty">
                                {individualTotalsResult.unrecordedDays > 0
                                    ? 'No individual totals were recorded for this period.'
                                    : dailyClosings.length === 0 && !businessDayStatus.active
                                        ? 'No business days have been closed yet.'
                                        : 'No individual totals in this period.'}
                            </p>
                        ) : (
                            <div className="financial-table-wrap individual-saved-totals-table-wrap">
                                <table aria-label="Individual saved totals" className="financial-table individual-saved-totals-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Member / source</th>
                                            <th scope="col">Income</th>
                                            <th scope="col">Refunds</th>
                                            <th scope="col">Expenses</th>
                                            <th scope="col">Difference</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {individualTotalsResult.totals.map((total) => (
                                            <tr key={total.source}>
                                                <th scope="row">{total.source}</th>
                                                <td>{currencyFormatter.format(total.income)}</td>
                                                <td>{currencyFormatter.format(-total.refunds)}</td>
                                                <td>{currencyFormatter.format(total.expenses)}</td>
                                                <td>{currencyFormatter.format(total.difference)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>}
                </>
            )}
        </div>
    )
}

export default DailyClosingManager