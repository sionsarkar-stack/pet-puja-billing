import { useEffect, useState } from 'react'
import { apiBaseUrl, currencyFormatter, formatDateTime, isPaidOrders, type PaidOrder } from './financial'
import { getBusinessDateInputValue } from './businessDay'
import { getFoodRevenue, getPeriodLabel, getSectionRevenue, type ProfitPeriod } from './profitFact'

type RevenueView = 'food' | 'section'
type FoodSortField = 'itemName' | 'quantity' | 'amount'
type SortDirection = 'asc' | 'desc'

const periods: Array<{ id: ProfitPeriod; label: string }> = [
    { id: 'day', label: 'Day' },
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
    const [view, setView] = useState<RevenueView>('section')
    const [selectedDate, setSelectedDate] = useState('')
    const [foodSearch, setFoodSearch] = useState('')
    const [foodSort, setFoodSort] = useState<{ field: FoodSortField; direction: SortDirection }>({ field: 'amount', direction: 'desc' })
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
                setErrorMessage('We could not load revenue. Please refresh and try again.')
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }

        void loadPaidOrders()
        return () => controller.abort()
    }, [refreshKey])

    const sectionRevenue = asOf === null
        ? []
        : getSectionRevenue(paidOrders, period, selectedDate, asOf)
    const foodRevenue = asOf === null
        ? []
        : getFoodRevenue(paidOrders, period, selectedDate, asOf)
    const filteredFoodRevenue = foodRevenue
        .filter(({ itemName }) => itemName.toLocaleLowerCase().includes(foodSearch.trim().toLocaleLowerCase()))
        .sort((left, right) => {
            const direction = foodSort.direction === 'asc' ? 1 : -1
            if (foodSort.field === 'itemName') return direction * left.itemName.localeCompare(right.itemName)
            const difference = left[foodSort.field] - right[foodSort.field]
            return difference === 0 ? left.itemName.localeCompare(right.itemName) : direction * difference
        })
    const totalRevenue = foodRevenue.reduce((total, entry) => total + entry.amount, 0)
    const totalFoodQuantity = foodRevenue.reduce((total, entry) => total + entry.quantity, 0)
    const maxFoodRevenue = foodRevenue.reduce((maximum, entry) => Math.max(maximum, entry.amount), 0)
    const periodLabel = getPeriodLabel(period, selectedDate)
    const pieBackground = getPieBackground(sectionRevenue)

    function toggleFoodSort(field: FoodSortField) {
        setFoodSort((currentSort) => ({
            direction: currentSort.field === field && currentSort.direction === 'desc' ? 'asc' : 'desc',
            field,
        }))
    }

    return (
        <div className="profit-fact-workspace">
            <header className="profit-fact-heading">
                <div>
                    <p className="eyebrow">Financial reporting</p>
                    <h1>Revenue</h1>
                </div>
                <p>Explore paid sales by food item or menu section.</p>
            </header>

            <div aria-label="Revenue view" className="profit-fact-tabs" role="tablist">
                <button
                    aria-controls="profit-fact-food-panel"
                    aria-selected={view === 'food'}
                    id="profit-fact-food-tab"
                    onClick={() => setView('food')}
                    role="tab"
                    type="button"
                >By food</button>
                <button
                    aria-controls="profit-fact-section-panel"
                    aria-selected={view === 'section'}
                    id="profit-fact-section-tab"
                    onClick={() => setView('section')}
                    role="tab"
                    type="button"
                >By section</button>
            </div>

            <div className="profit-fact-controls">
                <fieldset className="profit-fact-periods">
                    <legend>Period</legend>
                    <div role="group" aria-label="Revenue period">
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

            {isLoading && <p className="financial-empty" role="status">Loading revenue...</p>}
            {!isLoading && errorMessage && (
                <p className="financial-message financial-message-error" role="alert">{errorMessage}</p>
            )}
            {!isLoading && !errorMessage && asOf !== null && (
                <section aria-labelledby="profit-fact-report-heading" className="profit-fact-report">
                    <header className="profit-fact-report-heading">
                        <div>
                            <p className="eyebrow">{periodLabel}</p>
                            <h2 id="profit-fact-report-heading">{view === 'food' ? 'By food' : 'By section'}</h2>
                        </div>
                        <p>Data refreshed {formatDateTime(asOf.toISOString())}</p>
                    </header>
                    <p className="profit-fact-note">
                        {view === 'food'
                            ? 'Bill discounts and refunds are allocated proportionally by line value. Food add-ons are included with their parent item.'
                            : 'Bill discounts and refunds are allocated proportionally by line value. Operating expenses are not allocated to sections.'}
                    </p>

                    {view === 'section' && sectionRevenue.some(({ amount }) => amount > 0) ? (
                        <div className="profit-fact-chart-layout">
                            <div
                                aria-label={`Section-wise revenue pie chart for ${periodLabel}`}
                                className="profit-fact-pie"
                                role="img"
                                style={{ background: pieBackground }}
                            />
                            <div className="profit-fact-breakdown">
                                <p className="profit-fact-total">{currencyFormatter.format(totalRevenue)}</p>
                                <span>Total paid sales</span>
                                <ul aria-label="Section-wise revenue">
                                    {sectionRevenue.map((entry, index) => (
                                        <li key={entry.section}>
                                            <span
                                                aria-hidden="true"
                                                className="profit-fact-swatch"
                                                style={{ backgroundColor: sectionColors[index % sectionColors.length] }}
                                            />
                                            <span>{entry.section}</span>
                                            <strong>{currencyFormatter.format(entry.amount)}</strong>
                                            <small>{totalRevenue > 0 ? `${(entry.amount / totalRevenue * 100).toFixed(1)}%` : '0.0%'}</small>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ) : view === 'section' ? (
                        <p className="financial-empty">No section revenue in this period.</p>
                    ) : (
                        <>
                            <div className="profit-fact-food-summary">
                                <div>
                                    <p className="profit-fact-total">{currencyFormatter.format(totalRevenue)}</p>
                                    <span>Total paid sales</span>
                                </div>
                                <div className="profit-fact-quantity-total">
                                    <strong>{totalFoodQuantity.toLocaleString()}</strong>
                                    <span>Items sold</span>
                                </div>
                                <label className="profit-fact-search" htmlFor="profit-fact-food-search">
                                    <span>Search food items</span>
                                    <input
                                        id="profit-fact-food-search"
                                        onChange={(event) => setFoodSearch(event.target.value)}
                                        placeholder="Search by item name"
                                        type="search"
                                        value={foodSearch}
                                    />
                                </label>
                            </div>
                            {foodRevenue.length === 0 ? (
                                <p className="financial-empty">No food revenue in this period.</p>
                            ) : filteredFoodRevenue.length === 0 ? (
                                <p className="financial-empty">No food items match your search.</p>
                            ) : (
                                <div className="financial-table-wrap">
                                    <table aria-label={`Food item revenue for ${periodLabel}`} className="financial-table profit-fact-food-table">
                                        <thead>
                                            <tr>
                                                <th aria-sort={foodSort.field === 'itemName' ? `${foodSort.direction}ending` : 'none'} scope="col">
                                                    <button aria-label="Sort by food item" onClick={() => toggleFoodSort('itemName')} type="button">
                                                        Food item{foodSort.field === 'itemName' ? foodSort.direction === 'asc' ? ' ↑' : ' ↓' : ''}
                                                    </button>
                                                </th>
                                                <th aria-sort={foodSort.field === 'quantity' ? `${foodSort.direction}ending` : 'none'} scope="col">
                                                    <button aria-label="Sort by quantity sold" onClick={() => toggleFoodSort('quantity')} type="button">
                                                        Quantity sold{foodSort.field === 'quantity' ? foodSort.direction === 'asc' ? ' ↑' : ' ↓' : ''}
                                                    </button>
                                                </th>
                                                <th aria-sort={foodSort.field === 'amount' ? `${foodSort.direction}ending` : 'none'} scope="col">
                                                    <button aria-label="Sort by revenue" onClick={() => toggleFoodSort('amount')} type="button">
                                                        Revenue{foodSort.field === 'amount' ? foodSort.direction === 'asc' ? ' ↑' : ' ↓' : ''}
                                                    </button>
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredFoodRevenue.map(({ amount, itemName, quantity }, index) => (
                                                <tr key={itemName}>
                                                    <th scope="row"><span className="profit-fact-food-rank">{index + 1}</span>{itemName}</th>
                                                    <td>{quantity.toLocaleString()}</td>
                                                    <td>
                                                        <div className="profit-fact-food-revenue">
                                                            <span>{currencyFormatter.format(amount)}</span>
                                                            <span aria-hidden="true" className="profit-fact-food-bar-track">
                                                                <span className="profit-fact-food-bar" style={{ width: `${maxFoodRevenue > 0 ? amount / maxFoodRevenue * 100 : 0}%` }} />
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </section>
            )}
        </div>
    )
}

export default ProfitFactManager