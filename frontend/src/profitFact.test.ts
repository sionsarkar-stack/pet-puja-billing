import { describe, expect, it } from 'vitest'
import { getFoodRevenue, getIndividualSavedTotals, getPaymentMethodRevenue, getProfitDateRange, getSectionRevenue } from './profitFact'
import { getBusinessDateInputValue } from './businessDay'
import type { IndividualSavedTotal, PaidOrder } from './financial'

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

describe('Revenue-by-payment-method aggregation', () => {
    it('groups cash and QR receipts, including split payments, refunds, and legacy online bills', () => {
        const paidAt = new Date('2026-06-15T08:00:00Z')
        const orders = [
            makePaidOrder(paidAt, { total: 100, cashAmount: 100 }),
            makePaidOrder(paidAt, { id: 2, total: 200, paymentMethod: 'ONLINE', cashAmount: 0, onlineAmount: 200, upiQrProvider: 'PRIMARY' }),
            makePaidOrder(paidAt, {
                id: 3,
                total: 100,
                paymentMethod: 'SPLIT',
                cashAmount: 40,
                onlineAmount: 60,
                upiQrProvider: 'SECONDARY',
                refund: {
                    amount: 20,
                    billId: 3,
                    id: 4,
                    reason: 'Partial refund',
                    refundedAt: paidAt.toISOString(),
                    refundType: 'REFUND',
                },
            }),
            makePaidOrder(paidAt, { id: 5, total: 50, paymentMethod: 'ONLINE', cashAmount: 0, onlineAmount: 50 }),
        ]

        expect(getPaymentMethodRevenue(orders, 'all', '2026-06-15', new Date('2026-06-15T09:00:00Z'))).toEqual([
            { amount: 200, label: 'Primary QR' },
            { amount: 132, label: 'Cash' },
            { amount: 50, label: 'QR not recorded' },
            { amount: 48, label: 'Secondary QR' },
        ])
    })
})

describe('Individual saved totals period aggregation', () => {
    it('filters day, month, quarter, and till-now totals using business-day dates', () => {
        const closedDay = (id: number, closingDate: string, individualTotals?: IndividualSavedTotal[]) => ({
            id,
            closingDate,
            startedAt: `${closingDate}T04:00:00+05:30`,
            closedAt: `${closingDate}T20:00:00+05:30`,
            cashSales: 0,
            onlineSales: 0,
            profits: 0,
            refunds: 0,
            expenses: 0,
            revenue: 0,
            paidOrderCount: 0,
            expenseCount: 0,
            individualTotals,
        })
        const oldQuarterDay = closedDay(1, '2026-03-31', [
            { source: 'Cash', income: 25, refunds: 0, expenses: 0, difference: 25 },
        ])
        const aprilDay = closedDay(2, '2026-04-02', [
            { source: 'Rimo (Secondary QR)', income: 100, refunds: 10, expenses: 20, difference: 70 },
        ])
        const mayDay = closedDay(3, '2026-05-15', [
            { source: 'Rishi (Primary QR)', income: 200, refunds: 0, expenses: 50, difference: 150 },
        ])
        const unrecordedDay = closedDay(4, '2026-06-14')
        const olderYear = closedDay(5, '2025-12-31', [
            { source: 'Rjoe', income: 5, refunds: 0, expenses: 0, difference: 5 },
        ])
        const activePreview = {
            closingDate: '2026-06-15',
            startedAt: '2026-06-15T04:00:00+05:30',
            endedAt: '2026-06-15T17:30:00+05:30',
            cashSales: 0,
            onlineSales: 0,
            profits: 0,
            refunds: 0,
            expenses: 0,
            revenue: 0,
            paidOrderCount: 0,
            expenseCount: 0,
            individualTotals: [
                { source: 'Rimo (Secondary QR)', income: 40, refunds: 0, expenses: 10, difference: 30 },
                { source: 'Rjoe', income: 0, refunds: 0, expenses: 0, difference: 0 },
                { source: 'Rishi (Primary QR)', income: 0, refunds: 0, expenses: 0, difference: 0 },
                { source: 'Dinda', income: 0, refunds: 0, expenses: 0, difference: 0 },
                { source: 'Cash', income: 0, refunds: 0, expenses: 0, difference: 0 },
            ],
        }
        const now = new Date('2026-06-15T12:00:00Z')
        const closings = [unrecordedDay, mayDay, aprilDay, oldQuarterDay, olderYear]

        expect(getIndividualSavedTotals(closings, activePreview, 'day', '2026-06-15', now)).toEqual({
            totals: activePreview.individualTotals,
            unrecordedDays: 0,
        })
        expect(getIndividualSavedTotals(closings, activePreview, 'month', '2026-06-15', now)).toEqual({
            totals: activePreview.individualTotals,
            unrecordedDays: 1,
        })
        expect(getIndividualSavedTotals(closings, activePreview, 'quarter', '2026-06-15', now)).toEqual({
            totals: [
                { source: 'Rimo (Secondary QR)', income: 140, refunds: 10, expenses: 30, difference: 100 },
                { source: 'Rjoe', income: 0, refunds: 0, expenses: 0, difference: 0 },
                { source: 'Rishi (Primary QR)', income: 200, refunds: 0, expenses: 50, difference: 150 },
                { source: 'Dinda', income: 0, refunds: 0, expenses: 0, difference: 0 },
                { source: 'Cash', income: 0, refunds: 0, expenses: 0, difference: 0 },
            ],
            unrecordedDays: 1,
        })
        expect(getIndividualSavedTotals(closings, activePreview, 'all', '2026-06-15', now)).toEqual({
            totals: [
                { source: 'Rimo (Secondary QR)', income: 140, refunds: 10, expenses: 30, difference: 100 },
                { source: 'Rjoe', income: 5, refunds: 0, expenses: 0, difference: 5 },
                { source: 'Rishi (Primary QR)', income: 200, refunds: 0, expenses: 50, difference: 150 },
                { source: 'Dinda', income: 0, refunds: 0, expenses: 0, difference: 0 },
                { source: 'Cash', income: 25, refunds: 0, expenses: 0, difference: 25 },
            ],
            unrecordedDays: 1,
        })
    })
})