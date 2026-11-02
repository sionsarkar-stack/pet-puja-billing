import { strFromU8, unzipSync } from 'fflate'
import writeExcelFile from 'write-excel-file/node'
import { describe, expect, it } from 'vitest'
import { getExpenseExportEntries, getExpenseExportRange, getExpenseWorkbookData, type ExpenseExportPeriod } from './expenseExport'
import type { Expense } from './financial'

const now = new Date('2026-10-22T12:00:00Z')
const expense: Expense = {
    id: 1, title: 'Vegetables', addedBy: 'Others: Arun', description: 'Market', amount: 75.25,
    createdAt: '2026-09-15T12:30:00Z',
}

describe('expense Excel export', () => {
    it.each<[ExpenseExportPeriod, string, string | null, string]>([
        ['day', '2026-09-15', '2026-09-14T18:30:00.000Z', '2026-09-15T18:29:59.999Z'],
        ['month', '2026-09-15', '2026-08-31T18:30:00.000Z', '2026-09-30T18:29:59.999Z'],
        ['quarter', '2026-09-15', '2026-06-30T18:30:00.000Z', '2026-09-30T18:29:59.999Z'],
        ['year', '2025-09-15', '2024-12-31T18:30:00.000Z', '2025-12-31T18:29:59.999Z'],
        ['all', '', null, now.toISOString()],
        ['quarter', '2025-12-15', '2025-09-30T18:30:00.000Z', '2025-12-31T18:29:59.999Z'],
        ['month', '2024-02-15', '2024-01-31T18:30:00.000Z', '2024-02-29T18:29:59.999Z'],
    ])('uses the correct IST boundaries for %s at %s', (period, selectedDate, start, end) => {
        const range = getExpenseExportRange(period, selectedDate, now)
        expect(range.start?.toISOString() ?? null).toBe(start)
        expect(range.end.toISOString()).toBe(end)
    })

    it('includes both day boundaries, excludes adjacent days, and sorts chronologically', () => {
        const expenses = [
            { ...expense, id: 1, createdAt: '2026-09-15T18:30:00Z' },
            { ...expense, id: 2, createdAt: '2026-09-15T18:29:59.999Z' },
            { ...expense, id: 3, createdAt: '2026-09-14T18:30:00Z' },
            { ...expense, id: 4, createdAt: '2026-09-14T18:29:59.999Z' },
            { ...expense, id: 5, createdAt: 'invalid' },
        ]
        expect(getExpenseExportEntries(expenses, 'day', '2026-09-15', now).map((entry) => entry.id)).toEqual([3, 2])
    })

    it('caps the current year and till-now exports at download time', () => {
        expect(getExpenseExportRange('year', '2026-09-15', now).end).toEqual(now)
        expect(getExpenseExportEntries([expense, { ...expense, id: 2, createdAt: '2026-10-23T12:00:00Z' }], 'all', '', now)).toEqual([expense])
    })

    it('rejects an invalid selected date rather than exporting all history', () => {
        expect(() => getExpenseExportRange('day', '2026-02-30', now)).toThrow('valid export date')
    })

    it('writes a real workbook with text-safe fields, numeric amounts, and an exact total', async () => {
        const data = getExpenseWorkbookData([
            { ...expense, title: '=1+1', amount: 0.1 },
            { ...expense, id: 2, amount: 0.2, description: null },
        ])
        const buffer = await writeExcelFile(data, { sheet: 'Expenses' }).toBuffer()
        const files = unzipSync(buffer)
        const xml = new DOMParser().parseFromString(strFromU8(files['xl/worksheets/sheet1.xml']!), 'application/xml')
        expect(xml.querySelector('parsererror')).toBeNull()
        expect(xml.querySelector('c[r="E2"] v')?.textContent).toBe('0.1')
        expect(xml.querySelector('c[r="E4"] v')?.textContent).toBe('0.3')
        expect(xml.querySelector('f')).toBeNull()
        const text = Object.values(files).map((file) => strFromU8(file)).join('\n')
        expect(text).toContain('=1+1')
        expect(text).toContain('Others: Arun')
        expect(text).toContain('Date (IST)')
        expect(text).toContain('Amount (INR)')
        expect(text).toContain('6:00 pm')
    })
})