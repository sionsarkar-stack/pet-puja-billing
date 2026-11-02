import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProfitFactManager from './ProfitFactManager'

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
    })
}

describe('ProfitFactManager', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('shows revenue by section and supports day, month, quarter, and till-now views', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([{
            billNumber: 'PP-TEST',
            id: 1,
            lines: [
                { itemName: 'Dish A', lineTotal: 200, quantity: 1, section: 'Mains', unitPrice: 200 },
                { itemName: 'Drink', lineTotal: 100, quantity: 1, section: 'Beverages', unitPrice: 100 },
            ],
            paidAt: new Date().toISOString(),
            paymentMethod: 'CASH',
            refund: null,
            tableName: 'Table 1',
            total: 270,
        }]))
        const user = userEvent.setup()

        render(<ProfitFactManager />)

        expect(await screen.findByRole('heading', { name: 'Revenue' })).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'By section' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByRole('img', { name: /section-wise revenue pie chart/i })).toBeInTheDocument()
        expect(screen.getByText('₹270.00')).toBeInTheDocument()
        expect(screen.getByText('Mains')).toBeInTheDocument()
        expect(screen.getByText('Beverages')).toBeInTheDocument()

        const periodGroup = screen.getByRole('group', { name: 'Revenue period' })
        for (const period of ['Month', 'Quarter', 'Till now']) {
            const button = within(periodGroup).getByRole('button', { name: period })
            await user.click(button)
            expect(button).toHaveAttribute('aria-pressed', 'true')
        }
        expect(within(periodGroup).getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'false')
    })

    it('shows searchable food revenue in descending order and shares the period filters', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([
            {
                billNumber: 'PP-FOOD-1',
                id: 1,
                lines: [
                    { itemName: 'Tea', lineTotal: 50, quantity: 1, section: 'Beverages', unitPrice: 50 },
                    { itemName: 'Dosa', lineTotal: 100, quantity: 1, section: 'Mains', unitPrice: 100 },
                ],
                paidAt: new Date().toISOString(),
                paymentMethod: 'CASH',
                refund: null,
                tableName: 'Table 1',
                total: 135,
            },
            {
                billNumber: 'PP-FOOD-2',
                id: 2,
                lines: [{ itemName: 'Tea', lineTotal: 30, quantity: 1, section: 'Beverages', unitPrice: 30 }],
                paidAt: new Date().toISOString(),
                paymentMethod: 'ONLINE',
                refund: null,
                tableName: 'Table 2',
                total: 30,
            },
        ]))
        const user = userEvent.setup()
        render(<ProfitFactManager />)

        await user.click(await screen.findByRole('tab', { name: 'By food' }))
        const foodTable = screen.getByRole('table', { name: /Food item revenue for/ })
        const rows = within(foodTable).getAllByRole('row')
        expect(rows[1]).toHaveTextContent('Dosa')
        expect(rows[1]).toHaveTextContent('1')
        expect(rows[1]).toHaveTextContent('₹90.00')
        expect(rows[2]).toHaveTextContent('Tea')
        expect(rows[2]).toHaveTextContent('2')
        expect(rows[2]).toHaveTextContent('₹75.00')
        expect(screen.getByText('3', { selector: '.profit-fact-quantity-total strong' })).toBeInTheDocument()
        expect(screen.getByRole('group', { name: 'Revenue period' })).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Sort by quantity sold' }))
        expect(within(foodTable).getAllByRole('row')[1]).toHaveTextContent('Tea')
        await user.click(screen.getByRole('button', { name: 'Sort by revenue' }))
        expect(within(foodTable).getAllByRole('row')[1]).toHaveTextContent('Dosa')

        await user.type(screen.getByRole('searchbox', { name: 'Search food items' }), 'tea')
        expect(within(foodTable).getAllByRole('row')).toHaveLength(2)
        expect(foodTable).toHaveTextContent('Tea')
        expect(foodTable).not.toHaveTextContent('Dosa')

        await user.clear(screen.getByRole('searchbox', { name: 'Search food items' }))
        const periodGroup = screen.getByRole('group', { name: 'Revenue period' })
        for (const period of ['Month', 'Quarter', 'Till now', 'Day']) {
            const button = within(periodGroup).getByRole('button', { name: period })
            await user.click(button)
            expect(button).toHaveAttribute('aria-pressed', 'true')
        }
    })

    it('shows cash and selected QR totals under By payment method', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([
            {
                billNumber: 'PP-CASH', id: 1, lines: [{ itemName: 'Meal', lineTotal: 25, quantity: 1, section: 'Mains', unitPrice: 25 }],
                paidAt: new Date().toISOString(), paymentMethod: 'CASH', cashAmount: 25, onlineAmount: 0, total: 25, refund: null, tableName: 'Table 1',
            },
            {
                billNumber: 'PP-PRIMARY', id: 2, lines: [{ itemName: 'Meal', lineTotal: 80, quantity: 1, section: 'Mains', unitPrice: 80 }],
                paidAt: new Date().toISOString(), paymentMethod: 'ONLINE', cashAmount: 0, onlineAmount: 80, upiQrProvider: 'PRIMARY', total: 80, refund: null, tableName: 'Table 2',
            },
            {
                billNumber: 'PP-SECONDARY', id: 3, lines: [{ itemName: 'Meal', lineTotal: 30, quantity: 1, section: 'Mains', unitPrice: 30 }],
                paidAt: new Date().toISOString(), paymentMethod: 'SPLIT', cashAmount: 10, onlineAmount: 20, upiQrProvider: 'SECONDARY', total: 30, refund: null, tableName: 'Table 3',
            },
        ]))
        const user = userEvent.setup()
        render(<ProfitFactManager />)

        await user.click(await screen.findByRole('tab', { name: 'By payment method' }))

        expect(screen.getByRole('heading', { name: 'By payment method' })).toBeInTheDocument()
        expect(screen.getByText('₹135.00')).toBeInTheDocument()
        const paymentBreakdown = screen.getByRole('list', { name: 'Payment method revenue' })
        expect(within(paymentBreakdown).getByText('Primary QR')).toBeInTheDocument()
        expect(within(paymentBreakdown).getByText('Secondary QR')).toBeInTheDocument()
        expect(within(paymentBreakdown).getByText('Cash')).toBeInTheDocument()
        expect(paymentBreakdown).toHaveTextContent('₹80.00')
        expect(paymentBreakdown).toHaveTextContent('₹20.00')
        expect(paymentBreakdown).toHaveTextContent('₹35.00')
    })
})