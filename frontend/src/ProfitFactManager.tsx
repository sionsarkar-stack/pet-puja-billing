import { useEffect, useState } from 'react'
import { apiBaseUrl, currencyFormatter, formatDateTime, isPaidOrders, type PaidOrder } from './financial'
import { getBusinessDateInputValue } from './businessDay'
import { getPeriodLabel, getSectionProfits, type ProfitPeriod } from './profitFact'

const periods: Array<{ id: ProfitPeriod; label: string }> = [
    { id: 'day', label: 'Date' },
    { id: 'month', label: 'Month' },
    { id: 'quarter', label: 'Quarter' },
    { id: 'all', label: 'Till now' },
]

const sectionColors = ['#c9342c', '#e3a91c', '#397b5a', '#32718b', '#b76532', '#687a9b', '#83962f', '#8a5d48']

function getPieBackground(amounts: Array<{ amount: number }>) {
    const positiveAmounts = amounts.filter(({ amount }) => amount > 0)
    const total = positiveAmounts.reduce((sum, entry) => sum + entry.amount, 0)
    if (total <= 0) return ''

    let previousPercent = 0
    const segments = positiveAmounts.map((entry, index) => {
        const nextPercent = previousPercent + entry.amount / total * 100
        const segment = `${sectionColors[index % sectionColors.length]} ${previousPercent}% ${nextPercent}%`
        previousPercent = nextPercent
        return segment
    })
    return `conic-gradient(${segments.join(', ')})`
}

function ProfitFactManager() {
    const [paidOrders, setPaidOrders] = useState<PaidOrder[]>([])
    const [period, setPeriod] = useState<ProfitPeriod>('day')
    const [selectedDate, setSelectedDate] = useState('')
    const [asOf, setAsOf] = useState<Date | null>(null)
    const [refreshKey, setRefreshKey] = useState(0)
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    useEffect(() => {
        const controller = new AbortController()

        async function loadPaidOrders() {
            setIsLoading(true)
            setErrorMessage(null)
            try {
                const response = await fetch(`${apiBaseUrl}/api/history`, {
                    credentials: 'include',
                    signal: controller.signal,
                })
                if (!response.ok) throw new Error(`Paid history load failed: ${response.status}`)
                const orders: unknown = await response.json()
                if (!isPaidOrders(orders)) throw new Error('Paid history response has an unexpected shape')

                const refreshedAt = new Date()
                setPaidOrders(orders)
                setAsOf(refreshedAt)
                setSelectedDate((currentDate) => currentDate || getBusinessDateInputValue(refreshedAt))
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setErrorMessage('We could not load section-wise paid sales. Please refresh and try again.')
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }

        void loadPaidOrders()
        return () => controller.abort()
    }, [refreshKey])

    const sectionProfits = asOf === null
        ? []
        : getSectionProfits(paidOrders, period, selectedDate, asOf)
    const totalProfit = sectionProfits.reduce((total, entry) => total + entry.amount, 0)
    const periodLabel = getPeriodLabel(period, selectedDate)
    const pieBackground = getPieBackground(sectionProfits)

    return (
        <div className="profit-fact-workspace">
            <header className="profit-fact-heading">
                <div>
                    <p className="eyebrow">Financial reporting</p>
                    <h1>Profit Fact</h1>
                </div>
                <p>Paid sales after bill discounts and refunds, grouped by menu section.</p>
            </header>

            <div className="profit-fact-controls">
                <fieldset className="profit-fact-periods">
                    <legend>Period</legend>
                    <div role="group" aria-label="Profit Fact period">
                        {periods.map((option) => (
                            <button
                                aria-pressed={period === option.id}
                                key={option.id}
                                onClick={() => setPeriod(option.id)}
                                type="button"
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </fieldset>
                {period !== 'all' && (
                    <label className="profit-fact-date" htmlFor="profit-fact-date">
                        <span>Anchor date</span>
                        <input
                            id="profit-fact-date"
                            max={asOf === null ? undefined : getBusinessDateInputValue(asOf)}
                            onChange={(event) => setSelectedDate(event.target.value)}
                            type="date"
                            value={selectedDate}
                        />
                    </label>
                )}
                <button
                    className="profit-fact-refresh"
                    disabled={isLoading}
                    onClick={() => setRefreshKey((currentKey) => currentKey + 1)}
                    type="button"
                >
                    {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
            </div>

            {isLoading && <p className="financial-empty" role="status">Loading section-wise paid sales...</p>}
            {!isLoading && errorMessage && (
                <p className="financial-message financial-message-error" role="alert">{errorMessage}</p>
            )}
            {!isLoading && !errorMessage && asOf !== null && (
                <section aria-labelledby="profit-fact-report-heading" className="profit-fact-report">
                    <header className="profit-fact-report-heading">
                        <div>
                            <p className="eyebrow">{periodLabel}</p>
                            <h2 id="profit-fact-report-heading">Section-wise profit</h2>
                        </div>
                        <p>Data refreshed {formatDateTime(asOf.toISOString())}</p>
                    </header>
                    <p className="profit-fact-note">
                        Bill discounts and refunds are allocated proportionally by line value. Operating expenses are not allocated to sections.
                    </p>

                    {sectionProfits.some(({ amount }) => amount > 0) ? (
                        <div className="profit-fact-chart-layout">
                            <div
                                aria-label={`Section-wise paid sales pie chart for ${periodLabel}`}
                                className="profit-fact-pie"
                                role="img"
                                style={{ background: pieBackground }}
                            />
                            <div className="profit-fact-breakdown">
                                <p className="profit-fact-total">{currencyFormatter.format(totalProfit)}</p>
                                <span>Total paid sales</span>
                                <ul aria-label="Section-wise paid sales">
                                    {sectionProfits.map((entry, index) => (
                                        <li key={entry.section}>
                                            <span
                                                aria-hidden="true"
                                                className="profit-fact-swatch"
                                                style={{ backgroundColor: sectionColors[index % sectionColors.length] }}
                                            />
                                            <span>{entry.section}</span>
                                            <strong>{currencyFormatter.format(entry.amount)}</strong>
                                            <small>{totalProfit > 0 ? `${(entry.amount / totalProfit * 100).toFixed(1)}%` : '0.0%'}</small>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ) : (
                        <p className="financial-empty">No paid section sales in this period.</p>
                    )}
                </section>
            )}
        </div>
    )
}

export default ProfitFactManager