export type PaymentMethod = 'CASH' | 'ONLINE' | 'SPLIT'

export type RefundType = 'VOID' | 'REFUND'

export type BillRefund = {
    id: number
    billId: number
    refundType: RefundType
    amount: number
    reason: string
    refundedBy?: string | null
    refundedAt: string
}

export type PaidOrderLine = {
    itemName: string
    section?: string
    quantity: number
    unitPrice: number
    lineTotal: number
}

export type PaidOrder = {
    id: number
    billNumber: string
    tableName: string
    tableLabel?: string | null
    orderDescription?: string | null
    customerName?: string | null
    paymentMethod: PaymentMethod
    cashAmount?: number
    onlineAmount?: number
    paidAt: string
    subtotal?: number
    discountPercent?: number
    discountAmount?: number
    total: number
    lines: PaidOrderLine[]
    refund: BillRefund | null
}

export type OpenOrderLine = {
    menuItemId: number
    itemName: string
    section?: string
    quantity: number
    unitPrice: number
    lineTotal: number
    addOns: OpenOrderAddOn[]
}

export type OpenOrderAddOn = {
    id: number
    name: string
    price: number
}

export type OpenOrder = {
    tableName: string
    tableLabel?: string | null
    orderDescription?: string | null
    committeeDiscountPercent?: number | null
    customerName?: string | null
    customerPhone?: string | null
    customerDateOfBirth?: string | null
    subtotal?: number
    discountPercent?: number
    discountAmount?: number
    total: number
    completed: boolean
    lines: OpenOrderLine[]
}

export type CustomerDetails = {
    name: string | null
    phoneNumber: string
    dateOfBirth: string | null
}

export type Expense = {
    id: number
    title: string
    amount: number
    addedBy: string
    description: string | null
    createdAt: string
}

export type BalanceSheet = {
    profits: number
    refunds: number
    expenses: number
    revenue: number
}

export type DailyClosing = {
    id: number
    closingDate: string
    startedAt: string | null
    cashSales: number
    onlineSales: number
    profits: number
    refunds: number
    expenses: number
    revenue: number
    paidOrderCount: number
    expenseCount: number
    closedAt: string
}

export type DailyClosingPreview = {
    closingDate: string
    startedAt: string
    endedAt: string
    cashSales: number
    onlineSales: number
    profits: number
    refunds: number
    expenses: number
    revenue: number
    paidOrderCount: number
    expenseCount: number
}

export type BusinessDayStatus = {
    active: boolean
    startedAt: string | null
    businessDate: string | null
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''
export const INDIA_TIME_ZONE = 'Asia/Kolkata'

export function getTableDisplayName(order: { tableName: string; tableLabel?: string | null }) {
    return order.tableLabel?.trim() || order.tableName.replace(/^Committee (.+)$/, '$1')
}

export const currencyFormatter = new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
})

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: INDIA_TIME_ZONE,
})

const timeFormatter = new Intl.DateTimeFormat('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: INDIA_TIME_ZONE,
})

const dateInputFormatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: INDIA_TIME_ZONE,
    year: 'numeric',
})

const dateOnlyFormatter = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeZone: INDIA_TIME_ZONE,
})

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
    return value === 'CASH' || value === 'ONLINE' || value === 'SPLIT'
}

export function parsePaymentAmountInPaise(value: string): number | null {
    if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value.trim())) return null
    const [whole, fraction = ''] = value.trim().split('.')
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

function isRefundType(value: unknown): value is RefundType {
    return value === 'VOID' || value === 'REFUND'
}

export function isBillRefund(value: unknown): value is BillRefund {
    return isRecord(value)
        && typeof value.id === 'number'
        && typeof value.billId === 'number'
        && isRefundType(value.refundType)
        && typeof value.amount === 'number'
        && typeof value.reason === 'string'
        && typeof value.refundedAt === 'string'
}

function isPaidOrderLine(value: unknown): value is PaidOrderLine {
    return isRecord(value)
        && typeof value.itemName === 'string'
        && (!('section' in value) || typeof value.section === 'string')
        && typeof value.quantity === 'number'
        && typeof value.unitPrice === 'number'
        && typeof value.lineTotal === 'number'
}

function isOpenOrderLine(value: unknown): value is OpenOrderLine {
    return isRecord(value)
        && typeof value.menuItemId === 'number'
        && typeof value.itemName === 'string'
        && (!('section' in value) || typeof value.section === 'string')
        && typeof value.quantity === 'number'
        && typeof value.unitPrice === 'number'
        && typeof value.lineTotal === 'number'
        && (!('addOns' in value) || (Array.isArray(value.addOns) && value.addOns.every((addOn) => isRecord(addOn)
            && typeof addOn.id === 'number'
            && typeof addOn.name === 'string'
            && typeof addOn.price === 'number')))
}

export function isPaidOrder(value: unknown): value is PaidOrder {
    return isRecord(value)
        && typeof value.id === 'number'
        && typeof value.billNumber === 'string'
        && typeof value.tableName === 'string'
        && (!('tableLabel' in value) || value.tableLabel === null || typeof value.tableLabel === 'string')
        && (!('orderDescription' in value) || value.orderDescription === null || typeof value.orderDescription === 'string')
        && (!('customerName' in value) || typeof value.customerName === 'string' || value.customerName === null)
        && isPaymentMethod(value.paymentMethod)
        && typeof value.paidAt === 'string'
        && (!('subtotal' in value) || typeof value.subtotal === 'number')
        && (!('discountPercent' in value) || typeof value.discountPercent === 'number')
        && (!('discountAmount' in value) || typeof value.discountAmount === 'number')
        && typeof value.total === 'number'
        && (!('cashAmount' in value) || (typeof value.cashAmount === 'number' && Number.isFinite(value.cashAmount) && value.cashAmount >= 0))
        && (!('onlineAmount' in value) || (typeof value.onlineAmount === 'number' && Number.isFinite(value.onlineAmount) && value.onlineAmount >= 0))
        && (value.paymentMethod !== 'SPLIT' || (typeof value.cashAmount === 'number' && typeof value.onlineAmount === 'number'
            && value.cashAmount > 0 && value.onlineAmount > 0
            && Math.round(value.cashAmount * 100) + Math.round(value.onlineAmount * 100) === Math.round(value.total * 100)))
        && Array.isArray(value.lines)
        && value.lines.every(isPaidOrderLine)
        && (value.refund === null || isBillRefund(value.refund))
}

export function isPaidOrders(value: unknown): value is PaidOrder[] {
    return Array.isArray(value) && value.every(isPaidOrder)
}

export function isOpenOrder(value: unknown): value is OpenOrder {
    return isRecord(value)
        && typeof value.tableName === 'string'
        && (!('tableLabel' in value) || value.tableLabel === null || typeof value.tableLabel === 'string')
        && (!('orderDescription' in value) || value.orderDescription === null || typeof value.orderDescription === 'string')
        && (!('committeeDiscountPercent' in value) || value.committeeDiscountPercent === null
            || (typeof value.committeeDiscountPercent === 'number' && Number.isFinite(value.committeeDiscountPercent)
                && value.committeeDiscountPercent >= 0 && value.committeeDiscountPercent <= 100))
        && (!('customerName' in value) || typeof value.customerName === 'string' || value.customerName === null)
        && (!('customerPhone' in value) || typeof value.customerPhone === 'string' || value.customerPhone === null)
        && (!('customerDateOfBirth' in value) || typeof value.customerDateOfBirth === 'string' || value.customerDateOfBirth === null)
        && (!('subtotal' in value) || typeof value.subtotal === 'number')
        && (!('discountPercent' in value) || typeof value.discountPercent === 'number')
        && (!('discountAmount' in value) || typeof value.discountAmount === 'number')
        && typeof value.total === 'number'
        && typeof value.completed === 'boolean'
        && Array.isArray(value.lines)
        && value.lines.every(isOpenOrderLine)
}

export function isOpenOrders(value: unknown): value is OpenOrder[] {
    return Array.isArray(value) && value.every(isOpenOrder)
}

export function isCustomerDetails(value: unknown): value is CustomerDetails {
    return isRecord(value)
        && (typeof value.name === 'string' || value.name === null)
        && typeof value.phoneNumber === 'string'
        && (typeof value.dateOfBirth === 'string' || value.dateOfBirth === null)
}

export function isCustomerDetailsList(value: unknown): value is CustomerDetails[] {
    return Array.isArray(value) && value.every(isCustomerDetails)
}

export function isExpense(value: unknown): value is Expense {
    return isRecord(value)
        && typeof value.id === 'number'
        && typeof value.title === 'string'
        && typeof value.amount === 'number'
        && typeof value.addedBy === 'string'
        && (typeof value.description === 'string' || value.description === null)
        && typeof value.createdAt === 'string'
}

export function isExpenses(value: unknown): value is Expense[] {
    return Array.isArray(value) && value.every(isExpense)
}

export function isBalanceSheet(value: unknown): value is BalanceSheet {
    return isRecord(value)
        && typeof value.profits === 'number'
        && typeof value.refunds === 'number'
        && typeof value.expenses === 'number'
        && typeof value.revenue === 'number'
}

export function isDailyClosing(value: unknown): value is DailyClosing {
    return isRecord(value)
        && typeof value.id === 'number'
        && typeof value.closingDate === 'string'
        && (!('startedAt' in value) || typeof value.startedAt === 'string' || value.startedAt === null)
        && typeof value.cashSales === 'number'
        && typeof value.onlineSales === 'number'
        && typeof value.profits === 'number'
        && typeof value.refunds === 'number'
        && typeof value.expenses === 'number'
        && typeof value.revenue === 'number'
        && typeof value.paidOrderCount === 'number'
        && typeof value.expenseCount === 'number'
        && typeof value.closedAt === 'string'
}

export function isDailyClosings(value: unknown): value is DailyClosing[] {
    return Array.isArray(value) && value.every(isDailyClosing)
}

export function isDailyClosingPreview(value: unknown): value is DailyClosingPreview {
    return isRecord(value)
        && typeof value.closingDate === 'string'
        && typeof value.startedAt === 'string'
        && typeof value.endedAt === 'string'
        && typeof value.cashSales === 'number'
        && typeof value.onlineSales === 'number'
        && typeof value.profits === 'number'
        && typeof value.refunds === 'number'
        && typeof value.expenses === 'number'
        && typeof value.revenue === 'number'
        && typeof value.paidOrderCount === 'number'
        && typeof value.expenseCount === 'number'
}

export function isBusinessDayStatus(value: unknown): value is BusinessDayStatus {
    return isRecord(value)
        && typeof value.active === 'boolean'
        && (typeof value.startedAt === 'string' || value.startedAt === null)
        && (typeof value.businessDate === 'string' || value.businessDate === null)
}

export function getPaymentMethodLabel(paymentMethod: PaymentMethod) {
    return paymentMethod === 'CASH' ? 'Cash' : paymentMethod === 'ONLINE' ? 'Online' : 'Split'
}

export function formatCustomerName(customerName?: string | null) {
    return customerName?.trim() || 'NA'
}

export function getRefundTypeLabel(refundType: RefundType) {
    return refundType === 'VOID' ? 'Voided' : 'Refunded'
}

export function formatDateTime(value: string) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}

export function formatTime(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? String(value) : timeFormatter.format(date)
}

export function getDateInputValue(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value)
    if (Number.isNaN(date.getTime())) return null

    const parts = dateInputFormatter.formatToParts(date)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value
    const year = part('year')
    const month = part('month')
    const day = part('day')
    return year && month && day ? `${year}-${month}-${day}` : null
}

export function getDateInputBoundary(value: string, endOfDay = false) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
    const time = endOfDay ? '23:59:59.999' : '00:00:00.000'
    const date = new Date(`${value}T${time}+05:30`)
    return getDateInputValue(date) === value ? date : null
}

export function formatDateOnly(value: string) {
    const date = getDateInputBoundary(value)
    return date === null ? value : dateOnlyFormatter.format(date)
}