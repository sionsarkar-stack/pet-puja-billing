import type { SheetData } from 'write-excel-file/browser'
import { formatDateTime, getDateInputBoundary, type Expense } from './financial'

export type ExpenseExportPeriod = 'day' | 'month' | 'quarter' | 'year' | 'all'

export function getExpenseExportRange(period: ExpenseExportPeriod, selectedDate: string, now: Date) {
    if (period === 'all') return { start: null, end: now }
    if (getDateInputBoundary(selectedDate) === null) throw new Error('Select a valid export date.')

    const start = new Date(`${selectedDate}T12:00:00Z`)
    if (period !== 'day') start.setUTCDate(1)
    if (period === 'quarter') start.setUTCMonth(Math.floor(start.getUTCMonth() / 3) * 3)
    if (period === 'year') start.setUTCMonth(0)
    const next = new Date(start)
    if (period === 'day') next.setUTCDate(next.getUTCDate() + 1)
    else next.setUTCMonth(next.getUTCMonth() + (period === 'month' ? 1 : period === 'quarter' ? 3 : 12))

    const startBoundary = getDateInputBoundary(start.toISOString().slice(0, 10))!
    const nextBoundary = getDateInputBoundary(next.toISOString().slice(0, 10))!
    return { start: startBoundary, end: new Date(Math.min(nextBoundary.getTime() - 1, now.getTime())) }
}

export function getExpenseExportEntries(
    expenses: Expense[], period: ExpenseExportPeriod, selectedDate: string, now: Date,
) {
    const range = getExpenseExportRange(period, selectedDate, now)
    return expenses.filter((expense) => {
        const createdAt = new Date(expense.createdAt)
        return Number.isFinite(createdAt.getTime())
            && (range.start === null || createdAt >= range.start)
            && createdAt <= range.end
    }).sort((first, second) => Date.parse(first.createdAt) - Date.parse(second.createdAt) || first.id - second.id)
}

export function getExpenseWorkbookData(expenses: Expense[]): SheetData {
    const totalPaise = expenses.reduce((total, expense) => total + Math.round(expense.amount * 100), 0)
    return [
        ['Date (IST)', 'Title', 'Added by', 'Description', 'Amount (INR)'].map((value) => ({ value, fontWeight: 'bold' })),
        ...expenses.map((expense) => [
            formatDateTime(expense.createdAt),
            expense.title,
            expense.addedBy,
            expense.description ?? '',
            { value: expense.amount, type: Number, format: '#,##0.00' },
        ]),
        ['Total', null, null, null, { value: totalPaise / 100, type: Number, format: '#,##0.00', fontWeight: 'bold' }],
    ]
}

export async function downloadExpenseWorkbook(expenses: Expense[], fileName: string) {
    const { default: writeExcelFile } = await import('write-excel-file/browser')
    await writeExcelFile(getExpenseWorkbookData(expenses), {
        sheet: 'Expenses',
        columns: [{ width: 30 }, { width: 32 }, { width: 24 }, { width: 60 }, { width: 20 }],
        stickyRowsCount: 1,
    }).toFile(fileName)
}