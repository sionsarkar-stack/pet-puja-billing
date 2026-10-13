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

    it('shows section-wise paid sales and supports date, month, quarter, and all-time views', async () => {
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

        expect(await screen.findByRole('heading', { name: 'Section-wise profit' })).toBeInTheDocument()
        expect(screen.getByRole('img', { name: /section-wise paid sales pie chart/i })).toBeInTheDocument()
        expect(screen.getByText('₹270.00')).toBeInTheDocument()
        expect(screen.getByText('Mains')).toBeInTheDocument()
        expect(screen.getByText('Beverages')).toBeInTheDocument()

        const periodGroup = screen.getByRole('group', { name: 'Profit Fact period' })
        for (const period of ['Month', 'Quarter', 'Till now']) {
            const button = within(periodGroup).getByRole('button', { name: period })
            await user.click(button)
            expect(button).toHaveAttribute('aria-pressed', 'true')
        }
        expect(within(periodGroup).getByRole('button', { name: 'Date' })).toHaveAttribute('aria-pressed', 'false')
    })
})