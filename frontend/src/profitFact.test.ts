import { describe, expect, it } from 'vitest'
import { getFoodRevenue, getProfitDateRange, getSectionRevenue } from './profitFact'
import { getBusinessDateInputValue } from './businessDay'
import type { PaidOrder } from './financial'

function makePaidOrder(paidAt: Date, changes: Partial<PaidOrder> = {}): PaidOrder {
    return {
        billNumber: 'PP-TEST',
        id: 1,
        lines: [
            { itemName: 'Dish A', lineTotal: 200, quantity: 1, section: 'Mains', unitPrice: 200 },
            { itemName: 'Drink', lineTotal: 100, quantity: 1, section: 'Beverages', unitPrice: 100 },
        ],
        paidAt: paidAt.toISOString(),
        paymentMethod: 'CASH',
        refund: null,
        tableName: 'Table 1',
        total: 270,
        ...changes,
    }
}

describe('Revenue-by-section aggregation', () => {
    it('allocates bill discounts and refunds proportionally across sections', () => {
        const paidAt = new Date('2026-06-15T08:00:00Z')
        const order = makePaidOrder(paidAt, {
            refund: {
                amount: 30,
                billId: 1,
                id: 2,
                reason: 'Test refund',
                refundedAt: paidAt.toISOString(),
                refundType: 'REFUND',
            },
        })

        expect(getSectionRevenue([order], 'day', '2026-06-15', new Date('2026-06-15T09:00:00Z'))).toEqual([
            { amount: 160, section: 'Mains' },
            { amount: 80, section: 'Beverages' },
        ])
    })

    it('uses 04:00 IST boundaries and clips the current business day at now', () => {
        const now = new Date('2026-06-15T06:30:00Z')
        const range = getProfitDateRange('day', '2026-06-15', now)

        expect(range.start).toEqual(new Date('2026-06-14T22:30:00Z'))
        expect(range.end).toEqual(now)
    })

    it('changes the current business date exactly at 04:00 IST', () => {
        expect(getBusinessDateInputValue(new Date('2026-06-15T22:29:59.999Z'))).toBe('2026-06-15')
        expect(getBusinessDateInputValue(new Date('2026-06-15T22:30:00Z'))).toBe('2026-06-16')
    })

    it('calculates month, quarter, and all-history ranges', () => {
        const now = new Date('2026-06-15T06:30:00Z')

        expect(getProfitDateRange('month', '2026-06-15', now)).toEqual({
            end: now,
            start: new Date('2026-05-31T22:30:00Z'),
        })
        expect(getProfitDateRange('quarter', '2026-06-15', now)).toEqual({
            end: now,
            start: new Date('2026-03-31T22:30:00Z'),
        })
        expect(getProfitDateRange('all', '2026-06-15', now)).toEqual({ end: now, start: null })
    })

    it('groups older history and falls back to Other when section is missing', () => {
        const now = new Date('2026-06-15T06:30:00Z')
        const order = makePaidOrder(new Date('2024-01-02T06:00:00Z'), {
            lines: [{ itemName: 'Legacy dish', lineTotal: 100, quantity: 1, unitPrice: 100 }],
            total: 100,
        })

        expect(getSectionRevenue([order], 'all', '2026-06-15', now)).toEqual([
            { amount: 100, section: 'Other' },
        ])
        expect(getSectionRevenue([order], 'day', '2026-06-15', now)).toEqual([])
    })
})

describe('Revenue-by-food aggregation', () => {
    it('combines repeated items, allocates discounts and refunds, and sorts by revenue descending', () => {
        const now = new Date('2026-06-15T09:00:00Z')
        const firstOrder = makePaidOrder(new Date('2026-06-15T08:00:00Z'), {
            lines: [
                { itemName: 'Tea', lineTotal: 50, quantity: 1, section: 'Beverages', unitPrice: 50 },
                { itemName: 'Dosa', lineTotal: 100, quantity: 1, section: 'Mains', unitPrice: 100 },
            ],
            total: 135,
            refund: {
                amount: 15,
                billId: 1,
                id: 2,
                reason: 'Test refund',
                refundedAt: '2026-06-15T08:30:00Z',
                refundType: 'REFUND',
            },
        })
        const secondOrder = makePaidOrder(new Date('2026-06-15T08:45:00Z'), {
            id: 2,
            lines: [
                { itemName: 'Dosa', lineTotal: 100, quantity: 1, section: 'Mains', unitPrice: 100 },
                { itemName: 'Tea', lineTotal: 20, quantity: 1, section: 'Beverages', unitPrice: 20 },
            ],
            total: 120,
        })

        expect(getFoodRevenue([firstOrder, secondOrder], 'day', '2026-06-15', now)).toEqual([
            { amount: 180, itemName: 'Dosa', quantity: 2 },
            { amount: 60, itemName: 'Tea', quantity: 2 },
        ])
    })
})