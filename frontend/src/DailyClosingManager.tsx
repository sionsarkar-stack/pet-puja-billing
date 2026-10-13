import { useEffect, useState } from 'react'
import ConfirmationDialog from './ConfirmationDialog'
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

type DailyClosingMessage = {
    text: string
    tone: 'error' | 'success'
}

type DailyClosingManagerProps = {
    businessDayStatus: BusinessDayStatus
    onBusinessDayStatusChange: (status: BusinessDayStatus) => void
}

function DailyClosingManager({ businessDayStatus, onBusinessDayStatusChange }: DailyClosingManagerProps) {
    const [dailyClosings, setDailyClosings] = useState<DailyClosing[]>([])
    const [message, setMessage] = useState<DailyClosingMessage | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isPreviewing, setIsPreviewing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [closingPreview, setClosingPreview] = useState<DailyClosingPreview | null>(null)

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
    }, [])

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
                    <p className="eyebrow">Daily close</p>
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
                            {businessDayStatus.active && businessDayStatus.startedAt && (
                                <p>Started {formatDateTime(businessDayStatus.startedAt)}</p>
                            )}
                        </div>
                        {businessDayStatus.active ? (
                            <button disabled={isPreviewing || isSaving} onClick={() => void previewEndBusinessDay()} type="button">
                                {isPreviewing ? 'Preparing review...' : 'End day'}
                            </button>
                        ) : (
                            <button disabled={isSaving} onClick={() => void startBusinessDay()} type="button">
                                {isSaving ? 'Starting...' : 'Start day'}
                            </button>
                        )}
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
                                <div><dt>Refunds</dt><dd>-{currencyFormatter.format(closingPreview.refunds)}</dd></div>
                                <div><dt>Expenses</dt><dd>-{currencyFormatter.format(closingPreview.expenses)}</dd></div>
                                <div className="daily-close-preview-revenue"><dt>Revenue</dt><dd>{currencyFormatter.format(closingPreview.revenue)}</dd></div>
                                <div><dt>Records</dt><dd>{closingPreview.paidOrderCount} orders, {closingPreview.expenseCount} expenses</dd></div>
                            </dl>
                        </ConfirmationDialog>
                    )}

                    <section aria-labelledby="daily-closing-history-heading" className="financial-list daily-closing-list">
                        <header className="financial-list-heading">
                            <div>
                                <p className="eyebrow">Closing history</p>
                                <h2 id="daily-closing-history-heading">Saved daily totals</h2>
                            </div>
                            <span>{dailyClosings.length} {dailyClosings.length === 1 ? 'day' : 'days'}</span>
                        </header>

                        {dailyClosings.length === 0 ? (
                            <p className="financial-empty">No business days have been closed yet.</p>
                        ) : (
                            <div className="financial-table-wrap daily-closing-table-wrap">
                                <table aria-label="Daily closing history" className="financial-table daily-closing-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Started</th>
                                            <th scope="col">Cash</th>
                                            <th scope="col">Online</th>
                                            <th scope="col">Profits</th>
                                            <th scope="col">Refunds</th>
                                            <th scope="col">Expenses</th>
                                            <th scope="col">Revenue</th>
                                            <th scope="col">Ended</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dailyClosings.map((dailyClosing) => (
                                            <tr key={dailyClosing.id}>
                                                <td className="daily-closing-started">
                                                    <strong>{dailyClosing.startedAt ? formatDateTime(dailyClosing.startedAt) : dailyClosing.closingDate}</strong>
                                                </td>
                                                <td>{currencyFormatter.format(dailyClosing.cashSales)}</td>
                                                <td>{currencyFormatter.format(dailyClosing.onlineSales)}</td>
                                                <td>{currencyFormatter.format(dailyClosing.profits)}</td>
                                                <td>{currencyFormatter.format(-dailyClosing.refunds)}</td>
                                                <td>{currencyFormatter.format(dailyClosing.expenses)}</td>
                                                <td>{currencyFormatter.format(dailyClosing.revenue)}</td>
                                                <td>{formatDateTime(dailyClosing.closedAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    )
}

export default DailyClosingManager