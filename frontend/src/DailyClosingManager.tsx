import { useEffect, useState } from 'react'
import ConfirmationDialog from './ConfirmationDialog'
import {
    apiBaseUrl,
    currencyFormatter,
    formatDateTime,
    isDailyClosing,
    isDailyClosingPreview,
    isDailyClosings,
    type DailyClosing,
    type DailyClosingPreview,
} from './financial'

type DailyClosingMessage = {
    text: string
    tone: 'error' | 'success'
}

function getCurrentDateInput() {
    const currentDate = new Date()
    return [
        currentDate.getFullYear(),
        String(currentDate.getMonth() + 1).padStart(2, '0'),
        String(currentDate.getDate()).padStart(2, '0'),
    ].join('-')
}

function DailyClosingManager() {
    const [dailyClosings, setDailyClosings] = useState<DailyClosing[]>([])
    const [closingDate, setClosingDate] = useState(getCurrentDateInput)
    const [message, setMessage] = useState<DailyClosingMessage | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isPreviewing, setIsPreviewing] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [closingPreview, setClosingPreview] = useState<DailyClosingPreview | null>(null)
    const selectedDailyClosing = dailyClosings.find((dailyClosing) => dailyClosing.closingDate === closingDate)

    useEffect(() => {
        const controller = new AbortController()

        async function loadDailyClosings() {
            try {
                const response = await fetch(`${apiBaseUrl}/api/daily-closings`, {
                    credentials: 'include',
                    signal: controller.signal,
                })
                if (!response.ok) {
                    throw new Error('Daily closings load failed')
                }

                const data: unknown = await response.json()
                if (!isDailyClosings(data)) {
                    throw new Error('Daily closings response has an unexpected shape')
                }

                setDailyClosings(data)
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setErrorMessage('We could not load daily closings. Please try again.')
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false)
                }
            }
        }

        void loadDailyClosings()

        return () => controller.abort()
    }, [])

    async function previewCloseDay() {
        if (isPreviewing || isSaving || selectedDailyClosing) return

        setIsPreviewing(true)
        setMessage(null)

        try {
            const response = await fetch(`${apiBaseUrl}/api/daily-closings/preview?closingDate=${encodeURIComponent(closingDate)}`, {
                credentials: 'include',
            })
            if (!response.ok) {
                throw new Error('Daily closing preview failed')
            }

            const data: unknown = await response.json()
            if (!isDailyClosingPreview(data)) {
                throw new Error('Daily closing preview has an unexpected shape')
            }

            setClosingPreview(data)
        } catch {
            setMessage({ text: 'We could not prepare the closing summary. Please try again.', tone: 'error' })
        } finally {
            setIsPreviewing(false)
        }
    }

    async function closeDay() {
        if (isSaving || closingPreview === null) return

        setIsSaving(true)
        setMessage(null)

        try {
            const response = await fetch(`${apiBaseUrl}/api/daily-closings`, {
                body: JSON.stringify({ closingDate: closingPreview.closingDate }),
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
            })
            if (response.status === 409) {
                setClosingPreview(null)
                setMessage({ text: 'This date has already been closed.', tone: 'error' })
                return
            }
            if (!response.ok) {
                throw new Error('Daily closing save failed')
            }

            const data: unknown = await response.json()
            if (!isDailyClosing(data)) {
                throw new Error('Daily closing response has an unexpected shape')
            }

            setDailyClosings((currentDailyClosings) => [data, ...currentDailyClosings]
                .sort((firstClosing, secondClosing) => secondClosing.closingDate.localeCompare(firstClosing.closingDate)))
            setClosingPreview(null)
            setMessage({ text: 'Daily closing saved.', tone: 'success' })
        } catch {
            setClosingPreview(null)
            setMessage({ text: 'We could not close this day. Please try again.', tone: 'error' })
        } finally {
            setIsSaving(false)
        }
    }

    const currentDate = getCurrentDateInput()

    return (
        <div className="daily-close-workspace">
            <header className="daily-close-page-heading">
                <div>
                    <p className="eyebrow">Daily close</p>
                    <h1>Close a business day</h1>
                </div>
                <p>Capture final cash, online sales, expenses, and revenue for one calendar date.</p>
            </header>

            {isLoading && <p className="financial-empty">Loading daily closings...</p>}
            {!isLoading && errorMessage && <p className="financial-message financial-message-error" role="alert">{errorMessage}</p>}

            {!isLoading && !errorMessage && (
                <>
                    <section aria-labelledby="daily-close-action-heading" className="daily-close-action">
                        <div>
                            <p className="eyebrow">Closing date</p>
                            <h2 id="daily-close-action-heading">Record daily totals</h2>
                        </div>
                        <form
                            className="daily-close-form"
                            onSubmit={(event) => {
                                event.preventDefault()
                                void previewCloseDay()
                            }}
                        >
                            <label className="daily-close-date-field" htmlFor="daily-close-date">
                                <span>Closing date</span>
                                <input
                                    disabled={isPreviewing || isSaving || closingPreview !== null}
                                    id="daily-close-date"
                                    max={currentDate}
                                    onChange={(event) => {
                                        setClosingDate(event.target.value)
                                        setClosingPreview(null)
                                        setMessage(null)
                                    }}
                                    required
                                    type="date"
                                    value={closingDate}
                                />
                            </label>
                            <button disabled={isPreviewing || isSaving || selectedDailyClosing !== undefined} type="submit">
                                {isPreviewing ? 'Preparing review...' : isSaving ? 'Closing...' : selectedDailyClosing ? 'Day closed' : 'Review day'}
                            </button>
                        </form>
                    </section>
                    {message && (
                        <p className={`financial-message financial-message-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
                            {message.text}
                        </p>
                    )}

                    {closingPreview && (
                        <ConfirmationDialog
                            confirmLabel="Confirm daily close"
                            isConfirming={isSaving}
                            message={`Save the final totals for ${closingPreview.closingDate}? A saved daily close is kept as an immutable snapshot.`}
                            onCancel={() => setClosingPreview(null)}
                            onConfirm={() => void closeDay()}
                            title={`Close ${closingPreview.closingDate}`}
                        >
                            <dl className="daily-close-preview">
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
                                            <th scope="col">Date</th>
                                            <th scope="col">Cash</th>
                                            <th scope="col">Online</th>
                                            <th scope="col">Refunds</th>
                                            <th scope="col">Expenses</th>
                                            <th scope="col">Revenue</th>
                                            <th scope="col">Closed at</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dailyClosings.map((dailyClosing) => (
                                            <tr key={dailyClosing.id}>
                                                <td>{dailyClosing.closingDate}</td>
                                                <td>{currencyFormatter.format(dailyClosing.cashSales)}</td>
                                                <td>{currencyFormatter.format(dailyClosing.onlineSales)}</td>
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