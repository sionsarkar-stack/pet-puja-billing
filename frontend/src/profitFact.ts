import type { PaidOrder } from './financial'
import { getBusinessDayStart, shiftCalendarDate } from './businessDay'

export type ProfitPeriod = 'day' | 'month' | 'quarter' | 'all'

export type SectionRevenue = {
    amount: number
    section: string
}

export type FoodRevenue = {
    amount: number
    itemName: string
    quantity: number
}

export type ProfitDateRange = {
    end: Date
    start: Date | null
}

function endBeforeNow(periodEnd: Date, now: Date) {
    return periodEnd.getTime() > now.getTime() ? now : periodEnd
}

function getPeriodRange(startDate: string, nextDate: string, now: Date): ProfitDateRange {
    const start = getBusinessDayStart(startDate)
    const nextStart = getBusinessDayStart(nextDate)
    if (start === null || nextStart === null) return { end: now, start: null }
    return {
        end: endBeforeNow(new Date(nextStart.getTime() - 1), now),
        start,
    }
}

export function getProfitDateRange(period: ProfitPeriod, selectedDate: string, now: Date): ProfitDateRange {
    if (period === 'all') return { end: now, start: null }

    if (period === 'day') {
        const nextDate = shiftCalendarDate(selectedDate, 1)
        return nextDate === null ? { end: now, start: null } : getPeriodRange(selectedDate, nextDate, now)
    }

    const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedDate)
    if (dateParts === null) return { end: now, start: null }
    const year = Number(dateParts[1])
    const month = Number(dateParts[2])

    if (period === 'month') {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
        const nextDate = shiftCalendarDate(startDate, daysInMonth)
        return nextDate === null ? { end: now, start: null } : getPeriodRange(startDate, nextDate, now)
    }

    const quarterStartMonth = Math.floor((month - 1) / 3) * 3 + 1
    const startDate = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`
    const nextQuarter = new Date(Date.UTC(year, quarterStartMonth - 1 + 3, 1))
    const nextDate = `${nextQuarter.getUTCFullYear()}-${String(nextQuarter.getUTCMonth() + 1).padStart(2, '0')}-01`
    return getPeriodRange(startDate, nextDate, now)
}

export function getPeriodLabel(period: ProfitPeriod, selectedDate: string) {
    if (period === 'all') return 'All recorded history'
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedDate)
    if (dateParts === null) return ''
    const anchor = new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]), 12))

    if (period === 'day') {
        return new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' }).format(anchor)
    }
    if (period === 'month') {
        return new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC', year: 'numeric' }).format(anchor)
    }

    return `Q${Math.floor(anchor.getUTCMonth() / 3) + 1} ${anchor.getUTCFullYear()}`
}

export function getSectionRevenue(
    paidOrders: PaidOrder[],
    period: ProfitPeriod,
    selectedDate: string,
    now: Date,
): SectionRevenue[] {
    const range = getProfitDateRange(period, selectedDate, now)
    const amountsBySection = new Map<string, number>()

    for (const paidOrder of paidOrders) {
        const paidAt = new Date(paidOrder.paidAt)
        if (Number.isNaN(paidAt.getTime())
            || (range.start !== null && paidAt < range.start)
            || paidAt > range.end) {
            continue
        }

        const lineTotal = paidOrder.lines.reduce((total, line) => total + Math.max(0, line.lineTotal), 0)
        if (lineTotal <= 0) continue

        const netPaidAmount = Math.max(0, paidOrder.total - (paidOrder.refund?.amount ?? 0))
        for (const line of paidOrder.lines) {
            const share = Math.max(0, line.lineTotal) / lineTotal
            const section = line.section?.trim() || 'Other'
            amountsBySection.set(section, (amountsBySection.get(section) ?? 0) + netPaidAmount * share)
        }
    }

    return [...amountsBySection.entries()]
        .map(([section, amount]) => ({ amount, section }))
        .sort((left, right) => right.amount - left.amount || left.section.localeCompare(right.section))
}

export function getFoodRevenue(
    paidOrders: PaidOrder[],
    period: ProfitPeriod,
    selectedDate: string,
    now: Date,
): FoodRevenue[] {
    const range = getProfitDateRange(period, selectedDate, now)
    const totalsByItem = new Map<string, { amount: number; quantity: number }>()

    for (const paidOrder of paidOrders) {
        const paidAt = new Date(paidOrder.paidAt)
        if (Number.isNaN(paidAt.getTime())
            || (range.start !== null && paidAt < range.start)
            || paidAt > range.end) {
            continue
        }

        const lineTotal = paidOrder.lines.reduce((total, line) => total + Math.max(0, line.lineTotal), 0)
        if (lineTotal <= 0) continue

        const netPaidAmount = Math.max(0, paidOrder.total - (paidOrder.refund?.amount ?? 0))
        for (const line of paidOrder.lines) {
            const itemName = line.itemName.trim() || 'Unnamed item'
            const share = Math.max(0, line.lineTotal) / lineTotal
            const currentTotals = totalsByItem.get(itemName) ?? { amount: 0, quantity: 0 }
            totalsByItem.set(itemName, {
                amount: currentTotals.amount + netPaidAmount * share,
                quantity: currentTotals.quantity + Math.max(0, line.quantity),
            })
        }
    }

    return [...totalsByItem.entries()]
        .map(([itemName, totals]) => ({ ...totals, itemName }))
        .sort((left, right) => right.amount - left.amount || left.itemName.localeCompare(right.itemName))
}