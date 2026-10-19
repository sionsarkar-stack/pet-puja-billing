import { Fragment, type FormEvent, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import ConfirmationDialog from './ConfirmationDialog'
import { createOrderDocument } from './orderDocument'
import { groupOrderLines } from './orderSections'
import { groupMenuItems } from './menuSections'
import { useRestaurantConfiguration } from './RestaurantConfiguration'
import { createUpiPaymentUri } from './upiPayment'
import {
    apiBaseUrl,
    currencyFormatter,
    formatCustomerName,
    formatDateTime,
    formatTime,
    getPaymentMethodLabel,
    getTableDisplayName,
    parsePaymentAmountInPaise,
    isCustomerDetails,
    isCustomerDetailsList,
    isOpenOrder,
    isOpenOrders,
    isPaidOrder,
    type OpenOrder,
    type PaidOrder,
    type CustomerDetails,
    type PaymentMethod,
} from './financial'

type MenuItem = {
    id: number
    name: string
    description: string | null
    section: string
    subsection: string
    discountApplied: number
    price: number
    addOns: MenuAddOn[]
}

type MenuAddOn = {
    id: number
    name: string
    price: number
}

type OrderLine = {
    menuItemId: number
    name: string
    section: string
    quantity: number
    unitPrice: number
    addOns: MenuAddOn[]
}

const EMPTY_ORDER_LINES: OrderLine[] = []

type OpenOrderState = {
    tableLabel: string | null
    orderDescription: string | null
    committeeDiscountPercent: number | null
    completed: boolean
    customerName: string | null
    customerPhone: string | null
    customerDateOfBirth: string | null
    lines: OrderLine[]
    subtotal?: number
    discountPercent?: number
    discountAmount?: number
    total?: number
}

type TableMessage = {
    tone: 'error' | 'success'
    text: string
}

type OrderSaveIntent = {
    tableLabel?: string
    orderDescription?: string
    committeeDiscountPercent?: number
    completed: boolean
    customerName: string | null
    customerPhone: string | null
    customerDateOfBirth: string | null
    orderLines: OrderLine[]
    resetInvoice?: boolean
    seatingId: string
    successMessage: string
    tableName: string
}

type CustomerDetailsForSave = {
    tableLabel?: string
    orderDescription?: string
    committeeDiscountPercent?: number
    customerName: string | null
    customerPhone: string | null
    customerDateOfBirth: string | null
}

type OrderSaveStatus = {
    savedAt: Date
    seatingId: string
}

type SeatingSpot = {
    id: string
    kind: 'table' | 'outdoor' | 'committee'
    name: string
    number: number
    member?: CommitteeMember
}

type CommitteeMember = {
    id: number
    name: string
    protectedMember: boolean
    fixedDiscountPercent: number | null
}

function isCommitteeMember(value: unknown): value is CommitteeMember {
    return typeof value === 'object' && value !== null
        && 'id' in value && typeof value.id === 'number'
        && 'name' in value && typeof value.name === 'string'
        && 'protectedMember' in value && typeof value.protectedMember === 'boolean'
        && 'fixedDiscountPercent' in value && (value.fixedDiscountPercent === null
            || (typeof value.fixedDiscountPercent === 'number' && value.fixedDiscountPercent >= 0 && value.fixedDiscountPercent <= 100))
}

type SeatingStatus = {
    detail: string
    label: 'Available' | 'Open' | 'Ready'
    tone: 'available' | 'open' | 'ready'
}

const initialTableCount = 7
const initialOutdoorCount = 10

function createSeatingSpots(kind: SeatingSpot['kind'], label: string, count: number): SeatingSpot[] {
    return Array.from({ length: count }, (_, index) => {
        const number = index + 1
        return { id: `${kind}-${number}`, kind, name: `${label} ${number}`, number }
    })
}

function getSeatingSpotFromName(name: string): SeatingSpot | null {
    if (name.startsWith('Committee ') && name.length > 'Committee '.length) {
        return { id: `committee-${name.slice('Committee '.length).toLowerCase()}`, kind: 'committee', name, number: 0 }
    }
    const match = /^(Table|Outdoor) ([1-9]\d*)$/.exec(name)
    if (match === null) return null

    const kind = match[1] === 'Table' ? 'table' : 'outdoor'
    const number = Number(match[2])
    return { id: `${kind}-${number}`, kind, name, number }
}

function isMenuItem(value: unknown): value is MenuItem {
    return typeof value === 'object'
        && value !== null
        && 'id' in value
        && typeof value.id === 'number'
        && 'name' in value
        && typeof value.name === 'string'
        && 'description' in value
        && (typeof value.description === 'string' || value.description === null)
        && (!('section' in value) || typeof value.section === 'string')
        && (!('subsection' in value) || typeof value.subsection === 'string')
        && 'discountApplied' in value
        && typeof value.discountApplied === 'number'
        && 'price' in value
        && typeof value.price === 'number'
        && (!('addOns' in value) || (Array.isArray(value.addOns) && value.addOns.every((addOn) =>
            typeof addOn === 'object' && addOn !== null
            && 'id' in addOn && typeof addOn.id === 'number'
            && 'name' in addOn && typeof addOn.name === 'string'
            && 'price' in addOn && typeof addOn.price === 'number')))
}

function isMenuItems(value: unknown): value is MenuItem[] {
    return Array.isArray(value) && value.every(isMenuItem)
}

function normalizeMenuItem(menuItem: MenuItem): MenuItem {
    return {
        ...menuItem,
        section: menuItem.section ?? 'Other',
        subsection: menuItem.subsection ?? '',
        addOns: menuItem.addOns ?? [],
    }
}

function roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

function getUnitPrice(menuItem: MenuItem, addOns: MenuAddOn[] = []) {
    const discountedPrice = menuItem.price * (1 - menuItem.discountApplied / 100)
    return roundCurrency(discountedPrice + addOns.reduce((total, addOn) => total + addOn.price, 0))
}

function getOrderLineKey(orderLine: Pick<OrderLine, 'menuItemId' | 'addOns'>) {
    const addOnIds = orderLine.addOns.map((addOn) => addOn.id).sort((leftId, rightId) => leftId - rightId)
    return `${orderLine.menuItemId}:${addOnIds.join(',')}`
}

function getOrderLineDisplayName(orderLine: OrderLine) {
    if (orderLine.addOns.length === 0) return orderLine.name
    return `${orderLine.name} + ${orderLine.addOns.map((addOn) => addOn.name).join(', ')}`
}

function getLineTotal(orderLine: OrderLine) {
    return roundCurrency(orderLine.unitPrice * orderLine.quantity)
}

function getOrderTotal(orderLines: OrderLine[]) {
    return roundCurrency(orderLines.reduce((total, orderLine) => total + getLineTotal(orderLine), 0))
}

function getOrderLineGroupTotal(orderLines: OrderLine[]) {
    return roundCurrency(orderLines.reduce((total, orderLine) => total + getLineTotal(orderLine), 0))
}

function getSeatingStatus(order: OpenOrderState | undefined): SeatingStatus {
    if (order === undefined) {
        return { detail: 'Start an order', label: 'Available', tone: 'available' }
    }

    const total = currencyFormatter.format(order.total ?? getOrderTotal(order.lines))
    if (order.completed) {
        return { detail: `${total} awaiting payment`, label: 'Ready', tone: 'ready' }
    }

    const itemCount = order.lines.reduce((totalItems, orderLine) => totalItems + orderLine.quantity, 0)
    const itemLabel = itemCount === 1 ? 'item' : 'items'
    return { detail: `${itemCount} ${itemLabel} · ${total}`, label: 'Open', tone: 'open' }
}

function toOrderLines(openOrder: OpenOrder): OrderLine[] {
    return openOrder.lines.map((line) => ({
        menuItemId: line.menuItemId,
        name: line.itemName,
        section: line.section ?? 'Other',
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        addOns: line.addOns ?? [],
    }))
}

function toOpenOrderState(openOrder: OpenOrder): OpenOrderState {
    return {
        tableLabel: openOrder.tableLabel ?? null,
        orderDescription: openOrder.orderDescription ?? null,
        committeeDiscountPercent: openOrder.committeeDiscountPercent ?? null,
        completed: openOrder.completed,
        customerName: openOrder.customerName ?? null,
        customerPhone: openOrder.customerPhone ?? null,
        customerDateOfBirth: openOrder.customerDateOfBirth ?? null,
        lines: toOrderLines(openOrder),
        subtotal: openOrder.subtotal,
        discountPercent: openOrder.discountPercent,
        discountAmount: openOrder.discountAmount,
        total: openOrder.total,
    }
}

function getInvoiceFileName(seatingName: string) {
    return `${seatingName.toLowerCase().replaceAll(' ', '-')}-invoice.pdf`
}

function normalizeCustomerPhoneNumber(value: string) {
    let digits = value.replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) digits = `91${digits}`
    if (!/^91[6-9]\d{9}$/.test(digits)) return null

    return `+${digits}`
}

function isFutureDateOfBirth(value: string) {
    return value > new Date().toISOString().slice(0, 10)
}

function getReceiptFileName(billNumber: string) {
    return `${billNumber.toLowerCase()}-receipt.pdf`
}

function getInvoiceReference(createdAt: Date, seatingName: string) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        second: '2-digit',
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
    }).formatToParts(createdAt)
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? ''
    const datePart = `${part('year')}${part('month')}${part('day')}`
    const timePart = `${part('hour')}${part('minute')}${part('second')}`
    const seatingPart = seatingName.toUpperCase().replaceAll(' ', '-')

    return `PP-${datePart}-${timePart}-${seatingPart}`
}

type TableManagerProps = {
    isActive?: boolean
    canManageCommitteeMembers?: boolean
}

function mergeOrderLines(existingLines: OrderLine[], additions: OrderLine[]) {
    const lines = [...existingLines]
    for (const addition of additions) {
        const index = lines.findIndex((line) => getOrderLineKey(line) === getOrderLineKey(addition))
        if (index === -1) lines.push(addition)
        else lines[index] = { ...lines[index], quantity: lines[index].quantity + addition.quantity }
    }
    return lines
}

function TableManager({ isActive = true, canManageCommitteeMembers = true }: TableManagerProps) {
    const { restaurantName, upiVpa, secondaryUpiVpa = '' } = useRestaurantConfiguration()
    const paidReceiptFrameRef = useRef<HTMLIFrameElement>(null)
    const selectedOrderPanelRef = useRef<HTMLDivElement>(null)
    const [menuItems, setMenuItems] = useState<MenuItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [tableCount, setTableCount] = useState(initialTableCount)
    const [outdoorCount, setOutdoorCount] = useState(initialOutdoorCount)
    const [selectedSeatingId, setSelectedSeatingId] = useState<string | null>(null)
    const [menuSearch, setMenuSearch] = useState('')
    const [isMenuPickerOpen, setIsMenuPickerOpen] = useState(false)
    const [activeMenuItemId, setActiveMenuItemId] = useState<number | null>(null)
    const [expandedAddOnMenuItemId, setExpandedAddOnMenuItemId] = useState<number | null>(null)
    const [menuItemToRevealAddOns, setMenuItemToRevealAddOns] = useState<number | null>(null)
    const menuPickerRef = useRef<HTMLDivElement>(null)
    const [customerNameDraftsBySeating, setCustomerNameDraftsBySeating] = useState<Partial<Record<string, string>>>({})
    const [orderDescriptionDraftsBySeating, setOrderDescriptionDraftsBySeating] = useState<Partial<Record<string, string>>>({})
    const [tableLabelDraftsBySeating, setTableLabelDraftsBySeating] = useState<Partial<Record<string, string>>>({})
    const [committeeDiscountDrafts, setCommitteeDiscountDrafts] = useState<Partial<Record<string, string>>>({})
    const [committeeMembers, setCommitteeMembers] = useState<CommitteeMember[]>([])
    const [newCommitteeName, setNewCommitteeName] = useState('')
    const [isSavingCommitteeMember, setIsSavingCommitteeMember] = useState(false)
    const [committeeMemberPendingDeletion, setCommitteeMemberPendingDeletion] = useState<CommitteeMember | null>(null)
    const [committeeMessage, setCommitteeMessage] = useState<TableMessage | null>(null)
    const [customerPhoneDraftsBySeating, setCustomerPhoneDraftsBySeating] = useState<Partial<Record<string, string>>>({})
    const [customerDateOfBirthDraftsBySeating, setCustomerDateOfBirthDraftsBySeating] = useState<Partial<Record<string, string>>>({})
    const [addNameEnabledBySeating, setAddNameEnabledBySeating] = useState<Partial<Record<string, boolean>>>({})
    const [addPhoneEnabledBySeating, setAddPhoneEnabledBySeating] = useState<Partial<Record<string, boolean>>>({})
    const [addDateOfBirthEnabledBySeating, setAddDateOfBirthEnabledBySeating] = useState<Partial<Record<string, boolean>>>({})
    const [customerSearchQuery, setCustomerSearchQuery] = useState('')
    const [customerSearchMatches, setCustomerSearchMatches] = useState<CustomerDetails[]>([])
    const [customerSearchMessage, setCustomerSearchMessage] = useState<string | null>(null)
    const [customerSearchStatus, setCustomerSearchStatus] = useState<'idle' | 'found' | 'multiple' | 'not-found'>('idle')
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false)
    const [isCreateContactOpen, setIsCreateContactOpen] = useState(false)
    const [newContactName, setNewContactName] = useState('')
    const [newContactPhone, setNewContactPhone] = useState('')
    const [newContactDateOfBirth, setNewContactDateOfBirth] = useState('')
    const [isSavingNewContact, setIsSavingNewContact] = useState(false)
    const [ordersBySeating, setOrdersBySeating] = useState<Partial<Record<string, OpenOrderState>>>({})
    const [isOrderSaving, setIsOrderSaving] = useState(false)
    const [failedOrderSave, setFailedOrderSave] = useState<OrderSaveIntent | null>(null)
    const [lastOrderSave, setLastOrderSave] = useState<OrderSaveStatus | null>(null)
    const [paymentMethodInProgress, setPaymentMethodInProgress] = useState<PaymentMethod | null>(null)
    const [pendingPaymentMethod, setPendingPaymentMethod] = useState<PaymentMethod | null>(null)
    const [isSplitPayment, setIsSplitPayment] = useState(false)
    const [splitCashAmount, setSplitCashAmount] = useState('')
    const [splitOnlineAmount, setSplitOnlineAmount] = useState('')
    const [upiQrSeatingId, setUpiQrSeatingId] = useState<string | null>(null)
    const [upiQrProvider, setUpiQrProvider] = useState<'primary' | 'secondary'>('primary')
    const [lastPaidSeatingId, setLastPaidSeatingId] = useState<string | null>(null)
    const [lastPaidOrder, setLastPaidOrder] = useState<PaidOrder | null>(null)
    const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null)
    const [invoiceReference, setInvoiceReference] = useState<string | null>(null)
    const [invoiceWhatsAppPhone, setInvoiceWhatsAppPhone] = useState('')
    const [paidReceiptUrl, setPaidReceiptUrl] = useState<string | null>(null)
    const [isPaidReceiptReadyToPrint, setIsPaidReceiptReadyToPrint] = useState(false)
    const [message, setMessage] = useState<TableMessage | null>(null)

    useEffect(() => {
        if (!isActive) return

        const controller = new AbortController()

        async function loadTableOrders() {
            const menuLoad = fetch(`${apiBaseUrl}/api/menu`, {
                credentials: 'include',
                signal: controller.signal,
            })
                .then(async (response) => {
                    if (!response.ok) throw new Error(`Menu load failed: ${response.status}`)

                    const items: unknown = await response.json()
                    if (!isMenuItems(items)) throw new Error('Menu response has an unexpected shape')

                    setMenuItems(items.map(normalizeMenuItem))
                })

            const openOrdersLoad = fetch(`${apiBaseUrl}/api/open-orders`, {
                credentials: 'include',
                signal: controller.signal,
            })
                .then(async (response) => {
                    if (!response.ok) throw new Error(`Open order load failed: ${response.status}`)

                    const openOrders: unknown = await response.json()
                    if (!isOpenOrders(openOrders)) throw new Error('Open order response has an unexpected shape')

                    const restoredOrders: Partial<Record<string, OpenOrderState>> = {}
                    let restoredTableCount = initialTableCount
                    let restoredOutdoorCount = initialOutdoorCount

                    for (const openOrder of openOrders) {
                        const seatingSpot = getSeatingSpotFromName(openOrder.tableName)
                        if (seatingSpot === null) continue

                        restoredOrders[seatingSpot.id] = toOpenOrderState(openOrder)
                        if (seatingSpot.kind === 'table') {
                            restoredTableCount = Math.max(restoredTableCount, seatingSpot.number)
                        } else if (seatingSpot.kind === 'outdoor') {
                            restoredOutdoorCount = Math.max(restoredOutdoorCount, seatingSpot.number)
                        }
                    }

                    setOrdersBySeating(restoredOrders)
                    setTableCount((currentCount) => Math.max(currentCount, restoredTableCount))
                    setOutdoorCount((currentCount) => Math.max(currentCount, restoredOutdoorCount))
                })

            const membersLoad = fetch(`${apiBaseUrl}/api/committee-members`, { credentials: 'include', signal: controller.signal })
                .then(async (response) => {
                    if (!response.ok) throw new Error('Committee members could not be loaded')
                    const members: unknown = await response.json()
                    if (!Array.isArray(members) || !members.every(isCommitteeMember)) throw new Error('Unexpected committee members')
                    setCommitteeMembers(members)
                })
            const [menuResult, openOrdersResult, membersResult] = await Promise.allSettled([menuLoad, openOrdersLoad, membersLoad])
            if (controller.signal.aborted) return
            if (membersResult.status === 'rejected') {
                setCommitteeMessage({ tone: 'error', text: 'We could not load Committee members. Please try again.' })
            }

            if (menuResult.status === 'rejected') {
                setMessage({ tone: 'error', text: 'We could not load the menu. Please try again.' })
            } else if (openOrdersResult.status === 'rejected') {
                setMessage({ tone: 'error', text: 'We could not restore current orders. The menu is still available.' })
            }

            setIsLoading(false)
        }

        void loadTableOrders().catch((error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') return
            if (!controller.signal.aborted) {
                setMessage({ tone: 'error', text: 'We could not load the table workspace. Please try again.' })
            }
        })

        return () => controller.abort()
    }, [isActive])

    useEffect(() => {
        if (invoiceUrl === null) return

        return () => URL.revokeObjectURL(invoiceUrl)
    }, [invoiceUrl])

    useEffect(() => {
        if (paidReceiptUrl === null) return

        return () => URL.revokeObjectURL(paidReceiptUrl)
    }, [paidReceiptUrl])

    useEffect(() => {
        if (selectedSeatingId?.startsWith('committee-')) {
            selectedOrderPanelRef.current?.scrollIntoView?.({ block: 'start' })
        }
    }, [selectedSeatingId])

    const tableSpots = createSeatingSpots('table', 'Table', tableCount)
    const outdoorSpots = createSeatingSpots('outdoor', 'Outdoor', outdoorCount)
    const committeeSpots: SeatingSpot[] = committeeMembers.map((member, index) => ({
        id: `committee-${member.name.toLowerCase()}`, kind: 'committee', name: `Committee ${member.name}`, number: index + 1, member,
    }))
    const selectedSeating = [...tableSpots, ...outdoorSpots, ...committeeSpots].find((spot) => spot.id === selectedSeatingId) ?? null
    const selectedOpenOrder = selectedSeating === null ? null : ordersBySeating[selectedSeating.id] ?? null
    const tableLabel = selectedSeating === null ? '' : tableLabelDraftsBySeating[selectedSeating.id] ?? selectedOpenOrder?.tableLabel ?? ''
    const orderDescription = selectedSeating === null ? '' : orderDescriptionDraftsBySeating[selectedSeating.id] ?? selectedOpenOrder?.orderDescription ?? ''
    const orderDescriptionForSave = orderDescription.trim()
    const savedOrderDescription = selectedOpenOrder?.orderDescription?.trim() ?? ''
    const isOrderDescriptionDirty = orderDescriptionForSave !== savedOrderDescription
    const tableLabelForSave = tableLabel.trim()
    const savedTableLabel = selectedOpenOrder?.tableLabel?.trim() ?? ''
    const isTableLabelDirty = tableLabelForSave !== savedTableLabel
    const selectedSeatingName = getTableDisplayName({ tableName: selectedSeating?.name ?? '', tableLabel: tableLabelForSave })
    const isCommitteeOrder = selectedSeating?.kind === 'committee'
    const fixedCommitteeDiscount = selectedSeating?.member?.fixedDiscountPercent ?? null
    const committeeDiscount = fixedCommitteeDiscount !== null ? String(fixedCommitteeDiscount)
        : selectedSeating === null ? '' : committeeDiscountDrafts[selectedSeating.id] ?? String(selectedOpenOrder?.committeeDiscountPercent ?? 0)
    const committeeDiscountValue = Number(committeeDiscount)
    const isValidCommitteeDiscount = /^\d{1,3}(?:\.\d{1,2})?$/.test(committeeDiscount)
        && committeeDiscountValue >= 0 && committeeDiscountValue <= 100
    const isCommitteeDiscountDirty = isCommitteeOrder && (!isValidCommitteeDiscount
        || committeeDiscountValue !== (selectedOpenOrder?.committeeDiscountPercent ?? 0))
    const customerName = selectedSeating === null
        ? ''
        : customerNameDraftsBySeating[selectedSeating.id] ?? selectedOpenOrder?.customerName ?? ''
    const customerPhone = selectedSeating === null
        ? ''
        : customerPhoneDraftsBySeating[selectedSeating.id] ?? selectedOpenOrder?.customerPhone ?? ''
    const customerDateOfBirth = selectedSeating === null
        ? ''
        : customerDateOfBirthDraftsBySeating[selectedSeating.id] ?? selectedOpenOrder?.customerDateOfBirth ?? ''
    const isAddNameEnabled = selectedSeating !== null
        ? addNameEnabledBySeating[selectedSeating.id] ?? Boolean(selectedOpenOrder?.customerName?.trim())
        : false
    const isAddPhoneEnabled = selectedSeating !== null
        ? addPhoneEnabledBySeating[selectedSeating.id] ?? Boolean(selectedOpenOrder?.customerPhone)
        : false
    const isAddDateOfBirthEnabled = selectedSeating !== null
        ? addDateOfBirthEnabledBySeating[selectedSeating.id] ?? Boolean(selectedOpenOrder?.customerDateOfBirth)
        : false
    const selectedOrderLines = selectedOpenOrder?.lines ?? EMPTY_ORDER_LINES
    const orderLineGroups = isCommitteeOrder ? [{ section: 'Committee', lines: selectedOrderLines }] : groupOrderLines(selectedOrderLines)
    const generalSubtotal = getOrderLineGroupTotal(
        orderLineGroups.find((group) => group.section === 'General')?.lines ?? [],
    )
    const othersSubtotal = getOrderLineGroupTotal(
        orderLineGroups.find((group) => group.section === 'Others')?.lines ?? [],
    )
    const isOrderCompleted = selectedOpenOrder?.completed ?? false
    const customerNameForSave = isAddNameEnabled ? customerName.trim() || null : null
    const customerPhoneForSave = isAddPhoneEnabled ? normalizeCustomerPhoneNumber(customerPhone) : null
    const customerDateOfBirthForSave = isAddDateOfBirthEnabled ? customerDateOfBirth || null : null
    const savedCustomerName = selectedOpenOrder?.customerName?.trim() || null
    const isCustomerDetailsDirty = isTableLabelDirty || isCommitteeDiscountDirty || customerNameForSave !== savedCustomerName
        || customerPhoneForSave !== (selectedOpenOrder?.customerPhone ?? null)
        || customerDateOfBirthForSave !== (selectedOpenOrder?.customerDateOfBirth ?? null)
    const isOrderDetailsDirty = isCustomerDetailsDirty || isOrderDescriptionDirty
    const hasInvalidCustomerName = isAddNameEnabled && customerName.trim() === ''
    const hasInvalidCustomerPhone = isAddPhoneEnabled && customerPhoneForSave === null
    const hasInvalidCustomerDateOfBirth = isAddDateOfBirthEnabled && customerDateOfBirth === ''
    const hasInvalidCustomerDetails = hasInvalidCustomerName
        || hasInvalidCustomerPhone
        || hasInvalidCustomerDateOfBirth
    const hasJustPaid = selectedSeating !== null && lastPaidSeatingId === selectedSeating.id
    const hasFailedOrderSave = selectedSeating !== null && failedOrderSave?.seatingId === selectedSeating.id
    const hasRecentOrderSave = selectedSeating !== null && lastOrderSave?.seatingId === selectedSeating.id
    const selectedOrderSubtotal = selectedOpenOrder?.subtotal ?? getOrderTotal(selectedOrderLines)
    const selectedDiscountPercent = selectedOpenOrder?.discountPercent ?? 0
    const selectedDiscountAmount = selectedOpenOrder?.discountAmount ?? 0
    const selectedOrderTotal = selectedOpenOrder?.total ?? roundCurrency(selectedOrderSubtotal - selectedDiscountAmount)
    const splitCashPaise = parsePaymentAmountInPaise(splitCashAmount)
    const splitOnlinePaise = parsePaymentAmountInPaise(splitOnlineAmount)
    const isValidSplit = splitCashPaise !== null && splitOnlinePaise !== null
        && splitCashPaise > 0 && splitOnlinePaise > 0
        && splitCashPaise + splitOnlinePaise === Math.round(selectedOrderTotal * 100)
    const qrPaymentAmount = isSplitPayment ? (splitOnlinePaise ?? 0) / 100 : selectedOrderTotal
    const selectedUpiVpa = upiQrProvider === 'secondary' && secondaryUpiVpa.trim() !== ''
        ? secondaryUpiVpa
        : upiVpa
    const isOrderActionInProgress = isOrderSaving || isSavingCommitteeMember || paymentMethodInProgress !== null || pendingPaymentMethod !== null
    const menuKeywords = menuSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
    const matchingMenuItems = menuItems.filter((item) => {
        const searchableText = `${item.name} ${item.description ?? ''} ${item.section} ${item.subsection}`.toLocaleLowerCase()
        return menuKeywords.every((keyword) => searchableText.includes(keyword))
    })
    const groupedMenuItems = groupMenuItems(matchingMenuItems).flatMap(({ section, items, subsections }) => [
        ...(items.length > 0 ? [{ section, subsection: '', items }] : []),
        ...subsections.map(({ subsection, items: subsectionItems }) => ({
            section,
            subsection,
            items: subsectionItems,
        })),
    ])

    useEffect(() => {
        if (menuItemToRevealAddOns === null || !isMenuPickerOpen) return

        const addOnOptions = menuPickerRef.current?.querySelector<HTMLElement>(
            `#table-menu-option-${menuItemToRevealAddOns} .table-menu-inline-addons`,
        )
        if (!addOnOptions) return

        addOnOptions.scrollIntoView?.({ block: 'nearest' })
        setMenuItemToRevealAddOns(null)
    }, [isMenuPickerOpen, menuItemToRevealAddOns, selectedOrderLines])

    useEffect(() => {
        if (!isMenuPickerOpen) return

        function closeOnOutsidePointer(event: PointerEvent) {
            if (!(event.target instanceof Node) || menuPickerRef.current?.contains(event.target)) return

            setIsMenuPickerOpen(false)
            setActiveMenuItemId(null)
        }

        document.addEventListener('pointerdown', closeOnOutsidePointer)
        return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
    }, [isMenuPickerOpen])

    function getCustomerDetailsForSave(): CustomerDetailsForSave | undefined {
        if (isCommitteeOrder && !isValidCommitteeDiscount) {
            setMessage({ tone: 'error', text: 'Committee discount must be between 0 and 100 with at most two decimal places.' })
            return undefined
        }
        if (tableLabelForSave.length > 100) {
            setMessage({ tone: 'error', text: 'Table name cannot exceed 100 characters.' })
            return undefined
        }
        if (orderDescriptionForSave.length > 500) {
            setMessage({ tone: 'error', text: 'Order description cannot exceed 500 characters.' })
            return undefined
        }
        if (hasInvalidCustomerName) {
            setMessage({ tone: 'error', text: 'Enter a name or choose Skip name.' })
            return undefined
        }
        if (hasInvalidCustomerPhone) {
            setMessage({ tone: 'error', text: 'Enter a valid phone number.' })
            return undefined
        }
        if (hasInvalidCustomerDateOfBirth) {
            setMessage({ tone: 'error', text: 'Enter a date of birth or choose Skip date of birth.' })
            return undefined
        }
        if (customerDateOfBirth !== '' && isFutureDateOfBirth(customerDateOfBirth)) {
            setMessage({ tone: 'error', text: 'Date of birth cannot be in the future.' })
            return undefined
        }
        return {
            ...(isCommitteeOrder ? { committeeDiscountPercent: committeeDiscountValue } : {}),
            ...(tableLabelForSave !== '' || savedTableLabel !== '' ? { tableLabel: tableLabelForSave } : {}),
            ...(orderDescriptionForSave !== savedOrderDescription || savedOrderDescription !== ''
                ? { orderDescription: orderDescriptionForSave }
                : {}),
            customerName: customerNameForSave,
            customerPhone: customerPhoneForSave,
            customerDateOfBirth: customerDateOfBirthForSave,
        }
    }

    function setSelectedCustomerName(name: string) {
        if (selectedSeating === null) return

        setCustomerNameDraftsBySeating((currentNames) => ({
            ...currentNames,
            [selectedSeating.id]: name,
        }))
    }

    function setSelectedCustomerFieldEnabled(field: 'name' | 'phone' | 'dateOfBirth', enabled: boolean) {
        if (selectedSeating === null) return
        if (field === 'name') {
            setAddNameEnabledBySeating((currentValues) => ({ ...currentValues, [selectedSeating.id]: enabled }))
        } else if (field === 'phone') {
            setAddPhoneEnabledBySeating((currentValues) => ({ ...currentValues, [selectedSeating.id]: enabled }))
        } else {
            setAddDateOfBirthEnabledBySeating((currentValues) => ({ ...currentValues, [selectedSeating.id]: enabled }))
        }
        clearInvoice()
        setMessage(null)
    }

    function setSelectedCustomerPhone(phoneNumber: string) {
        if (selectedSeating === null) return

        setCustomerPhoneDraftsBySeating((currentPhones) => ({
            ...currentPhones,
            [selectedSeating.id]: phoneNumber,
        }))
    }

    function setSelectedCustomerDateOfBirth(dateOfBirth: string) {
        if (selectedSeating === null) return

        setCustomerDateOfBirthDraftsBySeating((currentDates) => ({
            ...currentDates,
            [selectedSeating.id]: dateOfBirth,
        }))
    }

    function selectCustomerProfile(customer: CustomerDetails) {
        if (selectedSeating !== null) {
            setCustomerNameDraftsBySeating((currentNames) => ({ ...currentNames, [selectedSeating.id]: customer.name ?? '' }))
            setCustomerPhoneDraftsBySeating((currentPhones) => ({ ...currentPhones, [selectedSeating.id]: customer.phoneNumber }))
            setCustomerDateOfBirthDraftsBySeating((currentDates) => ({ ...currentDates, [selectedSeating.id]: customer.dateOfBirth ?? '' }))
            setAddNameEnabledBySeating((currentValues) => ({ ...currentValues, [selectedSeating.id]: Boolean(customer.name) }))
            setAddPhoneEnabledBySeating((currentValues) => ({ ...currentValues, [selectedSeating.id]: true }))
            setAddDateOfBirthEnabledBySeating((currentValues) => ({ ...currentValues, [selectedSeating.id]: Boolean(customer.dateOfBirth) }))
        }
        clearInvoice()
        setCustomerSearchMatches([])
        setCustomerSearchStatus('found')
        setIsCreateContactOpen(false)
        setCustomerSearchMessage('Saved profile filled into this order. Save details with the order to attach it.')
    }

    async function searchCustomerByPhone(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const query = customerSearchQuery.trim()
        if (query === '') {
            setCustomerSearchMessage('Enter a name or 10-digit mobile number to search.')
            return
        }
        const isPhoneQuery = /^[+0-9().\s-]+$/.test(query)
        const normalizedPhone = isPhoneQuery ? normalizeCustomerPhoneNumber(query) : null
        if (isPhoneQuery && normalizedPhone === null) {
            setCustomerSearchMessage('Enter a valid 10-digit mobile number.')
            return
        }

        setIsSearchingCustomer(true)
        setCustomerSearchMessage(null)
        try {
            const response = await fetch(
                `${apiBaseUrl}/api/customers/search?query=${encodeURIComponent(normalizedPhone ?? query)}`,
                { credentials: 'include' },
            )
            if (!response.ok) throw new Error(`Customer lookup failed: ${response.status}`)

            const result: unknown = await response.json()
            if (!isCustomerDetailsList(result)) throw new Error('Customer lookup response has an unexpected shape')
            setCustomerSearchMatches(result)
            clearInvoice()
            setIsCreateContactOpen(false)
            if (result.length === 0) {
                setCustomerSearchStatus('not-found')
                setNewContactName(isPhoneQuery ? '' : query)
                setNewContactPhone(normalizedPhone ?? '')
                setNewContactDateOfBirth('')
                setCustomerSearchMessage('No saved profile found. Create a contact or continue without customer details.')
            } else if (result.length === 1) {
                selectCustomerProfile(result[0])
            } else {
                setCustomerSearchStatus('multiple')
                setCustomerSearchMessage(`${result.length} matching customers found. Choose one to fill this order.`)
            }
        } catch {
            setCustomerSearchMessage('We could not search customer details. Please try again.')
        } finally {
            setIsSearchingCustomer(false)
        }
    }

    async function createCustomerContact(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const rawPhone = newContactPhone.trim()
        const normalizedPhone = normalizeCustomerPhoneNumber(rawPhone)
        if (rawPhone !== '' && normalizedPhone === null) {
            setCustomerSearchMessage('Enter a valid phone number for the new contact.')
            return
        }

        if (normalizedPhone === null) {
            if (selectedSeating !== null) {
                setSelectedCustomerName(newContactName)
                setSelectedCustomerPhone('')
                setSelectedCustomerDateOfBirth(newContactDateOfBirth)
                setSelectedCustomerFieldEnabled('name', newContactName.trim() !== '')
                setSelectedCustomerFieldEnabled('phone', false)
                setSelectedCustomerFieldEnabled('dateOfBirth', newContactDateOfBirth !== '')
            }
            setCustomerSearchStatus('found')
            setIsCreateContactOpen(false)
            setCustomerSearchMessage('Details added to this order. Add a phone to save a directory profile.')
            return
        }

        setIsSavingNewContact(true)
        setCustomerSearchMessage(null)
        try {
            const response = await fetch(`${apiBaseUrl}/api/customers`, {
                body: JSON.stringify({
                    dateOfBirth: newContactDateOfBirth || null,
                    name: newContactName.trim() || null,
                    phoneNumber: normalizedPhone,
                }),
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
            })
            if (!response.ok) throw new Error(`Customer save failed: ${response.status}`)

            const result: unknown = await response.json()
            if (!isCustomerDetails(result)) throw new Error('Customer save response has an unexpected shape')
            if (selectedSeating !== null) {
                setCustomerNameDraftsBySeating((currentNames) => ({
                    ...currentNames,
                    [selectedSeating.id]: result.name ?? '',
                }))
                setCustomerPhoneDraftsBySeating((currentPhones) => ({
                    ...currentPhones,
                    [selectedSeating.id]: result.phoneNumber,
                }))
                setCustomerDateOfBirthDraftsBySeating((currentDates) => ({
                    ...currentDates,
                    [selectedSeating.id]: result.dateOfBirth ?? '',
                }))
                setAddNameEnabledBySeating((currentValues) => ({
                    ...currentValues,
                    [selectedSeating.id]: Boolean(result.name),
                }))
                setAddPhoneEnabledBySeating((currentValues) => ({
                    ...currentValues,
                    [selectedSeating.id]: true,
                }))
                setAddDateOfBirthEnabledBySeating((currentValues) => ({
                    ...currentValues,
                    [selectedSeating.id]: Boolean(result.dateOfBirth),
                }))
            }
            setCustomerSearchQuery(result.phoneNumber)
            setCustomerSearchStatus('found')
            setIsCreateContactOpen(false)
            setCustomerSearchMessage('Contact saved and filled into this order. Save details to attach it to the order.')
        } catch {
            setCustomerSearchMessage('We could not save this contact. Please try again.')
        } finally {
            setIsSavingNewContact(false)
        }
    }

    function selectSeating(seatingId: string) {
        clearInvoice()
        setCommitteeMessage(null)
        setIsSplitPayment(false)
        setSplitCashAmount('')
        setSplitOnlineAmount('')
        setUpiQrSeatingId(null)
        setUpiQrProvider('primary')
        setMenuSearch('')
        setIsMenuPickerOpen(false)
        setActiveMenuItemId(null)
        setSelectedSeatingId(seatingId)
        setCustomerSearchQuery(ordersBySeating[seatingId]?.customerPhone ?? '')
        setCustomerSearchMessage(null)
        setCustomerSearchStatus('idle')
        setIsCreateContactOpen(false)
        setMessage(null)
    }

    function clearInvoice() {
        setInvoiceUrl(null)
        setInvoiceReference(null)
        setInvoiceWhatsAppPhone('')
    }

    async function saveOpenOrder(tableName: string, orderLines: OrderLine[], completed: boolean, customerDetails: CustomerDetailsForSave) {
        const response = await fetch(`${apiBaseUrl}/api/open-orders`, {
            body: JSON.stringify({
                completed,
                ...customerDetails,
                lines: orderLines.map((orderLine) => ({
                    menuItemId: orderLine.menuItemId,
                    quantity: orderLine.quantity,
                    addOnIds: orderLine.addOns.map((addOn) => addOn.id),
                })),
                tableName,
            }),
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT',
        })

        if (response.status === 204) return null
        if (!response.ok) {
            throw new Error(`Open order save failed: ${response.status}`)
        }

        const savedOpenOrder = await response.json() as unknown
        if (!isOpenOrder(savedOpenOrder)) {
            throw new Error('Open order response has an unexpected shape')
        }

        return toOpenOrderState(savedOpenOrder)
    }

    function applySavedOrder(intent: OrderSaveIntent, savedOpenOrder: OpenOrderState | null) {
        if (intent.seatingId.startsWith('committee-')) {
            setCommitteeDiscountDrafts((current) => ({ ...current, [intent.seatingId]: String(savedOpenOrder?.committeeDiscountPercent ?? 0) }))
        }
        setTableLabelDraftsBySeating((current) => ({ ...current, [intent.seatingId]: savedOpenOrder?.tableLabel ?? '' }))
        setOrdersBySeating((currentOrders) => {
            const nextOrders = { ...currentOrders }
            if (savedOpenOrder === null) {
                delete nextOrders[intent.seatingId]
            } else {
                nextOrders[intent.seatingId] = savedOpenOrder
            }

            return nextOrders
        })
        setCustomerNameDraftsBySeating((currentNames) => {
            const nextNames = { ...currentNames }
            if (savedOpenOrder === null) {
                delete nextNames[intent.seatingId]
            } else {
                nextNames[intent.seatingId] = savedOpenOrder.customerName ?? ''
            }
            return nextNames
        })
        setOrderDescriptionDraftsBySeating((currentDescriptions) => {
            const nextDescriptions = { ...currentDescriptions }
            if (savedOpenOrder === null) delete nextDescriptions[intent.seatingId]
            else nextDescriptions[intent.seatingId] = savedOpenOrder.orderDescription ?? ''
            return nextDescriptions
        })
        setCustomerPhoneDraftsBySeating((currentPhones) => {
            const nextPhones = { ...currentPhones }
            if (savedOpenOrder === null) {
                delete nextPhones[intent.seatingId]
            } else {
                nextPhones[intent.seatingId] = savedOpenOrder.customerPhone ?? ''
            }
            return nextPhones
        })
        setCustomerDateOfBirthDraftsBySeating((currentDates) => {
            const nextDates = { ...currentDates }
            if (savedOpenOrder === null) {
                delete nextDates[intent.seatingId]
            } else {
                nextDates[intent.seatingId] = savedOpenOrder.customerDateOfBirth ?? ''
            }
            return nextDates
        })
        setAddNameEnabledBySeating((currentValues) => {
            const nextValues = { ...currentValues }
            if (savedOpenOrder === null) delete nextValues[intent.seatingId]
            else nextValues[intent.seatingId] = Boolean(savedOpenOrder.customerName?.trim())
            return nextValues
        })
        setAddPhoneEnabledBySeating((currentValues) => {
            const nextValues = { ...currentValues }
            if (savedOpenOrder === null) delete nextValues[intent.seatingId]
            else nextValues[intent.seatingId] = Boolean(savedOpenOrder.customerPhone)
            return nextValues
        })
        setAddDateOfBirthEnabledBySeating((currentValues) => {
            const nextValues = { ...currentValues }
            if (savedOpenOrder === null) delete nextValues[intent.seatingId]
            else nextValues[intent.seatingId] = Boolean(savedOpenOrder.customerDateOfBirth)
            return nextValues
        })
        if (intent.resetInvoice) {
            clearInvoice()
        }
        setCustomerSearchMessage(null)
        setCustomerSearchStatus('idle')
        setFailedOrderSave(null)
        setLastOrderSave({ savedAt: new Date(), seatingId: intent.seatingId })
        setMessage({ tone: 'success', text: intent.successMessage })
    }

    async function persistOrder(intent: OrderSaveIntent) {
        if (isOrderSaving) return

        setIsOrderSaving(true)
        setFailedOrderSave(null)
        setMessage(null)

        try {
            const savedOpenOrder = await saveOpenOrder(
                intent.tableName,
                intent.orderLines,
                intent.completed,
                {
                    ...(intent.tableLabel !== undefined ? { tableLabel: intent.tableLabel } : {}),
                    orderDescription: intent.orderDescription,
                    ...(intent.committeeDiscountPercent !== undefined ? { committeeDiscountPercent: intent.committeeDiscountPercent } : {}),
                    customerName: intent.customerName,
                    customerPhone: intent.customerPhone,
                    customerDateOfBirth: intent.customerDateOfBirth,
                },
            )
            applySavedOrder(intent, savedOpenOrder)
        } catch {
            setFailedOrderSave(intent)
            setMessage({ tone: 'error', text: 'We could not save this order. Your last confirmed order is unchanged.' })
        } finally {
            setIsOrderSaving(false)
        }
    }

    function retryOrderSave() {
        if (failedOrderSave === null) return

        void persistOrder(failedOrderSave)
    }

    function toggleMenuItem(menuItem: MenuItem, checked: boolean) {
        if (selectedSeating === null || isOrderActionInProgress) return
        const existing = selectedOrderLines.find((line) => line.menuItemId === menuItem.id)
        if (!checked) {
            if (expandedAddOnMenuItemId === menuItem.id) setExpandedAddOnMenuItemId(null)
            if (menuItemToRevealAddOns === menuItem.id) setMenuItemToRevealAddOns(null)
            if (existing) saveMenuSelection(selectedOrderLines.filter((line) => line.menuItemId !== menuItem.id), `${menuItem.name} removed from ${selectedSeatingName}.`)
            return
        }
        if (existing) return
        if (selectedOrderLines.length >= 100) {
            setMessage({ tone: 'error', text: 'An order can contain at most 100 lines.' })
            return
        }
        const line: OrderLine = {
            menuItemId: menuItem.id,
            name: menuItem.name,
            section: menuItem.section,
            quantity: 1,
            unitPrice: getUnitPrice(menuItem),
            addOns: [],
        }
        if (menuItem.addOns.length > 0) {
            setExpandedAddOnMenuItemId(menuItem.id)
            setMenuItemToRevealAddOns(menuItem.id)
        }
        saveMenuSelection([...selectedOrderLines, line], `${menuItem.name} added to ${selectedSeatingName}.`)
    }

    function toggleAddOnDropdown(menuItem: MenuItem) {
        const shouldExpand = expandedAddOnMenuItemId !== menuItem.id
        setExpandedAddOnMenuItemId(shouldExpand ? menuItem.id : null)
        setMenuItemToRevealAddOns(shouldExpand ? menuItem.id : null)
    }

    function toggleOrderAddOn(menuItem: MenuItem, line: OrderLine, addOn: MenuAddOn, checked: boolean) {
        if (selectedSeating === null || isOrderActionInProgress) return
        const addOns = checked ? [...line.addOns, addOn] : line.addOns.filter((item) => item.id !== addOn.id)
        const lines = selectedOrderLines.map((item) => getOrderLineKey(item) === getOrderLineKey(line)
            ? { ...item, addOns, unitPrice: getUnitPrice(menuItem, addOns) } : item)
        saveMenuSelection(mergeOrderLines([], lines), `${menuItem.name} add-ons updated.`)
    }

    function saveMenuSelection(nextOrderLines: OrderLine[], successMessage: string) {
        if (selectedSeating === null || isOrderActionInProgress) return
        if (nextOrderLines.some((item) => item.quantity > 10_000) || nextOrderLines.length > 100) {
            setMessage({ tone: 'error', text: 'An order can contain at most 100 lines and 10000 of each item.' })
            return
        }
        const customerDetails = getCustomerDetailsForSave()
        if (customerDetails === undefined) return

        void persistOrder({
            completed: false,
            ...customerDetails,
            orderLines: nextOrderLines,
            resetInvoice: true,
            seatingId: selectedSeating.id,
            successMessage,
            tableName: selectedSeating.name,
        })
    }

    async function removeOrderLine(orderLine: OrderLine) {
        if (selectedSeating === null) return
        const customerDetails = getCustomerDetailsForSave()
        if (customerDetails === undefined) return

        const nextOrderLines = selectedOrderLines.filter(
            (currentOrderLine) => getOrderLineKey(currentOrderLine) !== getOrderLineKey(orderLine),
        )
        void persistOrder({
            completed: false,
            ...customerDetails,
            orderLines: nextOrderLines,
            seatingId: selectedSeating.id,
            successMessage: `${getOrderLineDisplayName(orderLine)} removed from ${selectedSeatingName}.`,
            tableName: selectedSeating.name,
        })
    }

    function adjustOrderLineQuantity(orderLine: OrderLine, change: number) {
        if (selectedSeating === null || isOrderSaving) return
        const customerDetails = getCustomerDetailsForSave()
        if (customerDetails === undefined) return

        const lineKey = getOrderLineKey(orderLine)
        const nextQuantity = orderLine.quantity + change
        if (nextQuantity < 1) return
        const nextOrderLines = selectedOrderLines.map((currentOrderLine) => (
            getOrderLineKey(currentOrderLine) === lineKey
                ? { ...currentOrderLine, quantity: nextQuantity }
                : currentOrderLine
        ))
        void persistOrder({
            completed: false,
            ...customerDetails,
            orderLines: nextOrderLines,
            resetInvoice: true,
            seatingId: selectedSeating.id,
            successMessage: `${getOrderLineDisplayName(orderLine)} quantity updated to ${nextQuantity}.`,
            tableName: selectedSeating.name,
        })
    }

    async function completeOrder() {
        if (selectedSeating === null || selectedOrderLines.length === 0 || isOrderCompleted) return
        const customerDetails = getCustomerDetailsForSave()
        if (customerDetails === undefined) return

        void persistOrder({
            completed: true,
            ...customerDetails,
            orderLines: selectedOrderLines,
            resetInvoice: true,
            seatingId: selectedSeating.id,
            successMessage: `${selectedSeatingName} completed. Final price: ${currencyFormatter.format(selectedOrderTotal)}.`,
            tableName: selectedSeating.name,
        })
    }

    async function openTable() {
        if (selectedSeating === null || selectedOrderLines.length === 0 || !isOrderCompleted) return
        const customerDetails = getCustomerDetailsForSave()
        if (customerDetails === undefined) return

        void persistOrder({
            completed: false,
            ...customerDetails,
            orderLines: selectedOrderLines,
            resetInvoice: true,
            seatingId: selectedSeating.id,
            successMessage: `${selectedSeatingName} is open for more items.`,
            tableName: selectedSeating.name,
        })
    }

    async function addCommitteeMember(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (!canManageCommitteeMembers || isOrderActionInProgress) return
        const name = newCommitteeName.trim().replace(/\s+/g, ' ')
        if (!/^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,19}$/u.test(name)) {
            setCommitteeMessage({ tone: 'error', text: 'Enter a member name of 1 to 20 letters, numbers, spaces, apostrophes, dots, or hyphens.' })
            return
        }
        setIsSavingCommitteeMember(true)
        try {
            const response = await fetch(`${apiBaseUrl}/api/committee-members`, {
                method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
            })
            if (response.status === 409) {
                setCommitteeMessage({ tone: 'error', text: 'A Committee member with this name already exists.' })
                return
            }
            if (!response.ok) throw new Error('Member save failed')
            const member: unknown = await response.json()
            if (!isCommitteeMember(member)) throw new Error('Unexpected member response')
            setCommitteeMembers((current) => [...current, member])
            setNewCommitteeName('')
            selectSeating(`committee-${member.name.toLowerCase()}`)
            setCommitteeMessage({ tone: 'success', text: 'Committee member added.' })
        } catch {
            setCommitteeMessage({ tone: 'error', text: 'We could not add this Committee member. Please try again.' })
        } finally {
            setIsSavingCommitteeMember(false)
        }
    }

    async function deleteCommitteeMember() {
        const member = committeeMemberPendingDeletion
        if (member === null || member.protectedMember || !canManageCommitteeMembers || isSavingCommitteeMember) return
        setIsSavingCommitteeMember(true)
        try {
            const response = await fetch(`${apiBaseUrl}/api/committee-members/${member.id}`, { method: 'DELETE', credentials: 'include' })
            if (response.status === 409) {
                setCommitteeMessage({ tone: 'error', text: "Settle this member's unpaid order before deleting them." })
                return
            }
            if (!response.ok) throw new Error('Member deletion failed')
            const id = `committee-${member.name.toLowerCase()}`
            setCommitteeMembers((current) => current.filter((item) => item.id !== member.id))
            setCommitteeDiscountDrafts((current) => ({ ...current, [id]: '0' }))
            setTableLabelDraftsBySeating((current) => ({ ...current, [id]: '' }))
            setCustomerNameDraftsBySeating((current) => ({ ...current, [id]: '' }))
            setCustomerPhoneDraftsBySeating((current) => ({ ...current, [id]: '' }))
            setCustomerDateOfBirthDraftsBySeating((current) => ({ ...current, [id]: '' }))
            setFailedOrderSave((current) => current?.seatingId === id ? null : current)
            if (selectedSeatingId === id) setSelectedSeatingId(null)
            setCommitteeMessage({ tone: 'success', text: 'Committee member deleted.' })
        } catch {
            setCommitteeMessage({ tone: 'error', text: 'We could not delete this Committee member. Please try again.' })
        } finally {
            setCommitteeMemberPendingDeletion(null)
            setIsSavingCommitteeMember(false)
        }
    }

    function applyCommitteeDiscount() {
        if (selectedSeating === null || !isCommitteeOrder || isOrderActionInProgress) return
        const details = getCustomerDetailsForSave()
        if (details === undefined) return
        if (selectedOrderLines.length === 0) {
            setMessage({ tone: 'success', text: `Committee discount set to ${committeeDiscountValue}%.` })
            return
        }
        void persistOrder({
            completed: isOrderCompleted, ...details, orderLines: selectedOrderLines, resetInvoice: true,
            seatingId: selectedSeating.id, tableName: selectedSeating.name,
            successMessage: `${selectedSeatingName} discount updated to ${committeeDiscountValue}%.`,
        })
    }

    function saveTableLabel() {
        if (selectedSeating === null || selectedOrderLines.length === 0 || isOrderSaving) return
        const details = getCustomerDetailsForSave()
        if (details === undefined) return
        void persistOrder({
            completed: isOrderCompleted,
            ...details,
            orderLines: selectedOrderLines,
            resetInvoice: true,
            seatingId: selectedSeating.id,
            successMessage: tableLabelForSave ? 'Table name saved.' : 'Table name cleared.',
            tableName: selectedSeating.name,
        })
    }

    function saveCustomerDetails() {
        if (selectedSeating === null || selectedOrderLines.length === 0 || isOrderSaving) return
        const customerDetails = getCustomerDetailsForSave()
        if (customerDetails === undefined) return
        const hasDetails = Object.values(customerDetails).some((value) => value !== null)

        void persistOrder({
            completed: isOrderCompleted,
            ...customerDetails,
            orderLines: selectedOrderLines,
            resetInvoice: true,
            seatingId: selectedSeating.id,
            successMessage: hasDetails
                ? `Customer details saved for ${selectedSeatingName}.`
                : `Customer details cleared for ${selectedSeatingName}.`,
            tableName: selectedSeating.name,
        })
    }

    function saveOrderDescription() {
        if (selectedSeating === null || selectedOrderLines.length === 0 || isOrderSaving) return
        const details = getCustomerDetailsForSave()
        if (details === undefined) return
        void persistOrder({
            completed: isOrderCompleted,
            ...details,
            orderLines: selectedOrderLines,
            resetInvoice: true,
            seatingId: selectedSeating.id,
            successMessage: orderDescriptionForSave ? 'Order description saved.' : 'Order description cleared.',
            tableName: selectedSeating.name,
        })
    }

    function createInvoice() {
        if (selectedSeating === null || selectedOrderLines.length === 0 || !isOrderCompleted
            || isOrderDetailsDirty || hasInvalidCustomerDetails) return

        const createdAt = new Date()
        const invoiceReference = getInvoiceReference(createdAt, selectedSeating.name)
        const invoice = createOrderDocument({
            documentTitle: 'INVOICE',
            issuedAt: createdAt,
            lines: selectedOrderLines.map((orderLine) => ({
                itemName: getOrderLineDisplayName(orderLine),
                lineTotal: getLineTotal(orderLine),
                quantity: orderLine.quantity,
                section: orderLine.section,
                unitPrice: orderLine.unitPrice,
            })),
            paymentMethod: null,
            paymentStatus: 'PENDING',
            reference: invoiceReference,
            restaurantName,
            seatingName: selectedSeatingName,
            isCommitteeOrder,
            customerName: selectedOpenOrder?.customerName,
            orderDescription: selectedOpenOrder?.orderDescription,
            subtotal: selectedOrderSubtotal,
            discountPercent: selectedDiscountPercent,
            discountAmount: selectedDiscountAmount,
            total: selectedOrderTotal,
        })
        setInvoiceUrl(URL.createObjectURL(invoice))
        setInvoiceReference(invoiceReference)
        setInvoiceWhatsAppPhone('')
    }

    function openInvoiceInWhatsApp() {
        const normalizedPhone = selectedOpenOrder?.customerPhone
            ?? normalizeCustomerPhoneNumber(invoiceWhatsAppPhone)
        const phoneNumber = normalizedPhone?.replace(/\D/g, '')
        if (selectedSeating === null || invoiceReference === null || !phoneNumber) return

        const message = [
            `Hello! Here are the invoice details from ${restaurantName}.`,
            `Invoice: ${invoiceReference}`,
            `Seating: ${selectedSeatingName}`,
            `Ordering name: ${formatCustomerName(selectedOpenOrder?.customerName)}`,
            `Amount due: ${currencyFormatter.format(selectedOrderTotal)}.`,
            '',
            'Please attach the downloaded invoice PDF before sending.',
        ].join('\n')
        const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
    }

    function createPaidReceipt() {
        if (lastPaidOrder === null) return

        setIsPaidReceiptReadyToPrint(false)
        setPaidReceiptUrl(URL.createObjectURL(createOrderDocument({
            documentTitle: 'PAYMENT RECEIPT',
            issuedAt: new Date(lastPaidOrder.paidAt),
            lines: lastPaidOrder.lines,
            paymentMethod: lastPaidOrder.paymentMethod,
            cashAmount: lastPaidOrder.cashAmount,
            onlineAmount: lastPaidOrder.onlineAmount,
            paymentStatus: 'PAID',
            reference: lastPaidOrder.billNumber,
            restaurantName,
            seatingName: getTableDisplayName(lastPaidOrder),
            isCommitteeOrder: lastPaidOrder.tableName.startsWith('Committee '),
            tableLabel: lastPaidOrder.tableLabel,
            customerName: lastPaidOrder.customerName,
            orderDescription: lastPaidOrder.orderDescription,
            subtotal: lastPaidOrder.subtotal ?? lastPaidOrder.total + (lastPaidOrder.discountAmount ?? 0),
            discountPercent: lastPaidOrder.discountPercent ?? 0,
            discountAmount: lastPaidOrder.discountAmount ?? 0,
            total: lastPaidOrder.total,
        })))
    }

    function printPaidReceipt() {
        const receiptWindow = paidReceiptFrameRef.current?.contentWindow
        if (!receiptWindow) return

        receiptWindow.focus()
        receiptWindow.print()
    }

    function restartTable() {
        if (selectedSeating !== null) {
            setCommitteeDiscountDrafts((current) => ({ ...current, [selectedSeating.id]: '0' }))
            setTableLabelDraftsBySeating((current) => ({ ...current, [selectedSeating.id]: '' }))
        }
        if (selectedSeating === null || !hasJustPaid) return

        setOrdersBySeating((currentOrders) => {
            const nextOrders = { ...currentOrders }
            delete nextOrders[selectedSeating.id]
            return nextOrders
        })
        clearInvoice()
        setPaidReceiptUrl(null)
        setIsPaidReceiptReadyToPrint(false)
        setLastPaidSeatingId(null)
        setLastPaidOrder(null)
        setMessage(null)
        setMenuSearch('')
        setIsMenuPickerOpen(false)
        setSelectedSeatingId(null)
    }

    async function settleOrder(paymentMethod: PaymentMethod) {
        if (selectedSeating === null || selectedOrderLines.length === 0 || isOrderSaving || !isOrderCompleted) return
        if (paymentMethod === 'SPLIT' && !isValidSplit) {
            setMessage({ tone: 'error', text: 'Cash and online amounts must be positive and add up to the bill total.' })
            setPendingPaymentMethod(null)
            return
        }

        setPaymentMethodInProgress(paymentMethod)
        setMessage(null)

        try {
            const response = await fetch(`${apiBaseUrl}/api/payments`, {
                body: JSON.stringify({
                    paymentMethod,
                    tableName: selectedSeating.name,
                    ...(paymentMethod === 'SPLIT' ? { cashAmount: (splitCashPaise ?? 0) / 100, onlineAmount: (splitOnlinePaise ?? 0) / 100 } : {}),
                }),
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
            })

            if (!response.ok) {
                throw new Error(`Payment save failed: ${response.status}`)
            }

            const paidOrder = await response.json() as unknown
            if (!isPaidOrder(paidOrder)) {
                throw new Error('Payment response has an unexpected shape')
            }

            setOrdersBySeating((currentOrders) => {
                const nextOrders = { ...currentOrders }
                delete nextOrders[selectedSeating.id]
                return nextOrders
            })
            clearInvoice()
            setPaidReceiptUrl(null)
            setIsPaidReceiptReadyToPrint(false)
            setLastPaidSeatingId(selectedSeating.id)
            setLastPaidOrder(paidOrder)
            setTableLabelDraftsBySeating((current) => ({ ...current, [selectedSeating.id]: paidOrder.tableLabel ?? '' }))
            setOrderDescriptionDraftsBySeating((current) => ({ ...current, [selectedSeating.id]: paidOrder.orderDescription ?? '' }))
            setUpiQrSeatingId(null)
            setIsSplitPayment(false)
            setSplitCashAmount('')
            setSplitOnlineAmount('')
            setMessage({
                tone: 'success',
                text: `${selectedSeatingName} paid by ${getPaymentMethodLabel(paymentMethod).toLowerCase()}: ${currencyFormatter.format(paidOrder.total)}.`,
            })
        } catch {
            setMessage({ tone: 'error', text: 'We could not record this payment. Please try again.' })
        } finally {
            setPaymentMethodInProgress(null)
            setPendingPaymentMethod(null)
        }
    }

    function requestPayment(paymentMethod: PaymentMethod) {
        if (selectedSeating === null || selectedOrderLines.length === 0 || isOrderSaving || !isOrderCompleted) return
        if (paymentMethod === 'SPLIT' && !isValidSplit) {
            setMessage({ tone: 'error', text: 'Cash and online amounts must be positive and add up to the bill total.' })
            return
        }
        if (hasInvalidCustomerDetails) {
            getCustomerDetailsForSave()
            return
        }
        if (isOrderDetailsDirty) {
            setMessage({ tone: 'error', text: isOrderDescriptionDirty ? 'Save the order description before recording payment.' : isCommitteeDiscountDirty ? 'Apply the committee discount before recording payment.' : isTableLabelDirty ? 'Save the table name before recording payment.' : 'Save customer details before recording payment.' })
            return
        }

        setPendingPaymentMethod(paymentMethod)
    }

    return (
        <div className="table-workspace">
            <header className="table-page-heading">
                <div>
                    <p className="eyebrow">Table</p>
                    <h1>Table orders</h1>
                </div>
                <p>Start an order from the dishes already saved in the menu.</p>
            </header>

            <section
                aria-label="Restaurant seating"
                className={`table-seating-layout table-seating-layout-${selectedSeating?.kind ?? 'none'}`}
            >
                <section aria-labelledby="table-seating-heading" className="seating-zone seating-zone-table">
                    <header className="seating-zone-heading">
                        <div>
                            <p className="eyebrow">Indoor</p>
                            <h2 id="table-seating-heading">Table</h2>
                        </div>
                        <button
                            aria-label="Add table"
                            className="table-selector table-add-selector"
                            disabled={isOrderActionInProgress}
                            onClick={() => setTableCount((currentCount) => currentCount + 1)}
                            title="Add table"
                            type="button"
                        >
                            <span aria-hidden="true">+</span>
                        </button>
                    </header>

                    <div className="table-grid">
                        {tableSpots.map((tableSpot) => {
                            const seatingStatus = getSeatingStatus(ordersBySeating[tableSpot.id])
                            const displayName = getTableDisplayName({ tableName: tableSpot.name, tableLabel: tableLabelDraftsBySeating[tableSpot.id] ?? ordersBySeating[tableSpot.id]?.tableLabel })

                            return (
                                <button
                                    aria-describedby={`seat-status-${tableSpot.id}`}
                                    aria-label={displayName}
                                    aria-pressed={selectedSeating?.id === tableSpot.id}
                                    className={`table-selector table-selector-${seatingStatus.tone}`}
                                    disabled={isOrderActionInProgress}
                                    key={tableSpot.id}
                                    onClick={() => selectSeating(tableSpot.id)}
                                    title={`${displayName}: ${seatingStatus.label}: ${seatingStatus.detail}`}
                                    type="button"
                                >
                                    <span aria-hidden="true" className="seating-selector-name">{displayName}</span>
                                    <span aria-hidden="true" className="seating-selector-meta">
                                        <span className="seating-selector-status">{seatingStatus.label}</span>
                                        <span className="seating-selector-detail">{seatingStatus.detail}</span>
                                    </span>
                                    <span className="screen-reader-only" id={`seat-status-${tableSpot.id}`}>
                                        {seatingStatus.label}. {seatingStatus.detail}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </section>

                <section aria-labelledby="outdoor-seating-heading" className="seating-zone seating-zone-outdoor">
                    <header className="seating-zone-heading">
                        <div>
                            <p className="eyebrow">Open air</p>
                            <h2 id="outdoor-seating-heading">Outdoor</h2>
                        </div>
                        <button
                            aria-label="Add outdoor table"
                            className="outdoor-selector table-add-selector"
                            disabled={isOrderActionInProgress}
                            onClick={() => setOutdoorCount((currentCount) => currentCount + 1)}
                            title="Add outdoor table"
                            type="button"
                        >
                            <span aria-hidden="true">+</span>
                        </button>
                    </header>

                    <div className="outdoor-grid">
                        {outdoorSpots.map((outdoorSpot) => {
                            const seatingStatus = getSeatingStatus(ordersBySeating[outdoorSpot.id])
                            const displayName = getTableDisplayName({ tableName: outdoorSpot.name, tableLabel: tableLabelDraftsBySeating[outdoorSpot.id] ?? ordersBySeating[outdoorSpot.id]?.tableLabel })

                            return (
                                <button
                                    aria-describedby={`seat-status-${outdoorSpot.id}`}
                                    aria-label={displayName}
                                    aria-pressed={selectedSeating?.id === outdoorSpot.id}
                                    className={`outdoor-selector outdoor-selector-${seatingStatus.tone}`}
                                    disabled={isOrderActionInProgress}
                                    key={outdoorSpot.id}
                                    onClick={() => selectSeating(outdoorSpot.id)}
                                    title={`${displayName}: ${seatingStatus.label}: ${seatingStatus.detail}`}
                                    type="button"
                                >
                                    {displayName === outdoorSpot.name ? <>
                                        <span aria-hidden="true" className="seating-selector-name">Outdoor</span>
                                        <strong aria-hidden="true">{outdoorSpot.name.replace('Outdoor ', '')}</strong>
                                    </> : <span aria-hidden="true" className="seating-selector-name">{displayName}</span>}
                                    <span aria-hidden="true" className="seating-selector-status">{seatingStatus.label}</span>
                                    <span className="screen-reader-only" id={`seat-status-${outdoorSpot.id}`}>
                                        {seatingStatus.label}. {seatingStatus.detail}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </section>
                <section aria-labelledby="committee-seating-heading" className="seating-zone seating-zone-committee">
                    <header className="seating-zone-heading"><div><p className="eyebrow">Members</p><h2 id="committee-seating-heading">Committee</h2></div></header>
                    <div className="committee-table-wrap">
                        <table aria-label="Committee members" className="committee-table financial-table">
                            <thead><tr>
                                <th scope="col">Member</th><th scope="col">Items</th><th scope="col">Total</th><th scope="col">Discount (%)</th>
                                {canManageCommitteeMembers && <th scope="col">Actions</th>}
                            </tr></thead>
                            <tbody>{committeeSpots.map((spot) => {
                                const order = ordersBySeating[spot.id]
                                const isSelected = selectedSeating?.id === spot.id
                                const discount = spot.member?.fixedDiscountPercent !== null && spot.member?.fixedDiscountPercent !== undefined
                                    ? String(spot.member.fixedDiscountPercent)
                                    : committeeDiscountDrafts[spot.id] ?? String(order?.committeeDiscountPercent ?? 0)
                                return <tr
                                    aria-expanded={isSelected}
                                    aria-controls={isSelected ? 'selected-order-panel' : undefined}
                                    aria-selected={isSelected}
                                    className={isSelected ? 'committee-row committee-row-selected' : 'committee-row'}
                                    key={spot.id}
                                    onClick={(event) => {
                                        if (!isOrderActionInProgress && event.target instanceof Element && !event.target.closest('button, input, select, label')) {
                                            if (isSelected) setSelectedSeatingId(null)
                                            else selectSeating(spot.id)
                                        }
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.target === event.currentTarget && !isOrderActionInProgress && (event.key === 'Enter' || event.key === ' ')) {
                                            event.preventDefault()
                                            if (isSelected) setSelectedSeatingId(null)
                                            else selectSeating(spot.id)
                                        }
                                    }}
                                    tabIndex={isOrderActionInProgress ? -1 : 0}
                                >
                                    <th scope="row">{spot.member?.name}</th>
                                    <td>{order?.lines.reduce((count, line) => count + line.quantity, 0) ?? 0}</td>
                                    <td>{currencyFormatter.format(order?.total ?? getOrderTotal(order?.lines ?? []))}</td>
                                    <td><div className="committee-row-discount">
                                        <input aria-label={`Discount for ${spot.member?.name} (%)`} disabled={isOrderActionInProgress || !isSelected || (hasJustPaid && isSelected) || spot.member?.fixedDiscountPercent !== null} inputMode="decimal" max="100" min="0" onChange={(event) => {
                                            setCommitteeDiscountDrafts((current) => ({ ...current, [spot.id]: event.target.value }))
                                            clearInvoice()
                                        }} step="0.01" type="number" value={discount} />
                                        <button aria-label={`Apply discount for ${spot.member?.name}`} disabled={isOrderActionInProgress || !isSelected || !isValidCommitteeDiscount || (hasJustPaid && isSelected)} onClick={applyCommitteeDiscount} type="button">Apply discount</button>
                                    </div></td>
                                    {canManageCommitteeMembers && <td><button aria-label={`Delete ${spot.member?.name}`} disabled={isOrderActionInProgress || spot.member?.protectedMember} onClick={() => setCommitteeMemberPendingDeletion(spot.member ?? null)} title={spot.member?.protectedMember ? 'Dinda cannot be deleted' : `Delete ${spot.member?.name}`} type="button">Delete member</button></td>}
                                </tr>
                            })}</tbody>
                        </table>
                        {!isLoading && committeeMembers.length === 0 && <p>No Committee members.</p>}
                    </div>
                    {canManageCommitteeMembers && <form className="committee-order-controls committee-member-form" noValidate onSubmit={addCommitteeMember}>
                        <label htmlFor="new-committee-member">New committee member
                            <input disabled={isOrderActionInProgress || isLoading} id="new-committee-member" maxLength={20} onChange={(event) => setNewCommitteeName(event.target.value)} value={newCommitteeName} />
                        </label>
                        <button disabled={isOrderActionInProgress || isLoading || newCommitteeName.trim() === ''} type="submit">Add member</button>
                    </form>}
                    {committeeMessage && <p className={`menu-message menu-message-${committeeMessage.tone}`} role={committeeMessage.tone === 'error' ? 'alert' : 'status'}>{committeeMessage.text}</p>}
                </section>
                {selectedSeating !== null && (
                    <div className="table-order-area" id="selected-order-panel" ref={selectedOrderPanelRef}>
                        <section aria-labelledby="table-order-builder-heading" className="table-order-builder">
                            <header className="table-order-heading">
                                <p className="eyebrow">Selected seating</p>
                                <h2 id="table-order-builder-heading">{selectedSeatingName}</h2>
                            </header>

                            {!hasJustPaid && !isCommitteeOrder && <div className="field-group table-name-field">
                                <label htmlFor="order-table-name">Table name</label>
                                <input disabled={isOrderActionInProgress} id="order-table-name" maxLength={100} onChange={(event) => {
                                    setTableLabelDraftsBySeating((current) => ({ ...current, [selectedSeating.id]: event.target.value }))
                                    clearInvoice()
                                }} placeholder={selectedSeating.name} value={tableLabel} />
                                {selectedOrderLines.length > 0 && isTableLabelDirty && <button disabled={isOrderActionInProgress} onClick={saveTableLabel} type="button">Save table name</button>}
                            </div>}

                            {!hasJustPaid && !isCommitteeOrder && (
                                <fieldset className="table-order-customer" disabled={isOrderActionInProgress}>
                                    <legend>Customer details</legend>
                                    <form className="customer-mobile-search" noValidate onSubmit={searchCustomerByPhone}>
                                        <label htmlFor="table-customer-search-phone">Search by name or mobile</label>
                                        <div>
                                            <input
                                                id="table-customer-search-phone"
                                                onChange={(event) => {
                                                    setCustomerSearchQuery(event.target.value)
                                                    setCustomerSearchMessage(null)
                                                    setCustomerSearchStatus('idle')
                                                    setIsCreateContactOpen(false)
                                                    setCustomerSearchMatches([])
                                                }}
                                                placeholder="Name or 10-digit mobile"
                                                type="search"
                                                value={customerSearchQuery}
                                            />
                                            <button disabled={isSearchingCustomer} type="submit">
                                                {isSearchingCustomer ? 'Searching...' : 'Search'}
                                            </button>
                                        </div>
                                    </form>
                                    {customerSearchMessage && (
                                        <p className="customer-search-message" role="status">{customerSearchMessage}</p>
                                    )}
                                    {customerSearchStatus === 'multiple' && customerSearchMatches.length > 0 && (
                                        <div aria-label="Matching customers" className="customer-search-matches">
                                            {customerSearchMatches.map((customer) => (
                                                <button
                                                    aria-label={`Use ${formatCustomerName(customer.name)}, ${customer.phoneNumber}`}
                                                    key={customer.phoneNumber}
                                                    onClick={() => selectCustomerProfile(customer)}
                                                    type="button"
                                                >
                                                    <strong>{formatCustomerName(customer.name)}</strong>
                                                    <span>{customer.phoneNumber}</span>
                                                    {customer.dateOfBirth && <small>{customer.dateOfBirth}</small>}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {customerSearchStatus === 'not-found' && !isCreateContactOpen && (
                                        <button
                                            className="table-customer-create"
                                            onClick={() => setIsCreateContactOpen(true)}
                                            type="button"
                                        >
                                            Create new contact
                                        </button>
                                    )}
                                    {isCreateContactOpen && (
                                        <form className="table-customer-create-form" onSubmit={createCustomerContact}>
                                            <div className="field-group table-order-customer-input">
                                                <label htmlFor="new-contact-name">Name (optional)</label>
                                                <input
                                                    autoComplete="name"
                                                    id="new-contact-name"
                                                    maxLength={100}
                                                    onChange={(event) => setNewContactName(event.target.value)}
                                                    value={newContactName}
                                                />
                                            </div>
                                            <div className="field-group table-order-customer-input">
                                                <label htmlFor="new-contact-phone">Phone number (optional)</label>
                                                <input
                                                    autoComplete="tel"
                                                    id="new-contact-phone"
                                                    inputMode="tel"
                                                    maxLength={32}
                                                    onChange={(event) => setNewContactPhone(event.target.value)}
                                                    type="tel"
                                                    value={newContactPhone}
                                                />
                                            </div>
                                            <div className="field-group table-order-customer-input">
                                                <label htmlFor="new-contact-date-of-birth">Date of birth (optional)</label>
                                                <input
                                                    id="new-contact-date-of-birth"
                                                    onChange={(event) => setNewContactDateOfBirth(event.target.value)}
                                                    type="date"
                                                    value={newContactDateOfBirth}
                                                />
                                            </div>
                                            <div className="table-customer-create-actions">
                                                <button disabled={isSavingNewContact} type="submit">
                                                    {isSavingNewContact ? 'Saving contact...' : 'Save contact'}
                                                </button>
                                                <button disabled={isSavingNewContact} onClick={() => setIsCreateContactOpen(false)} type="button">
                                                    Cancel
                                                </button>
                                            </div>
                                        </form>
                                    )}

                                    {(customerNameForSave || customerPhoneForSave || customerDateOfBirthForSave) && (
                                        <div aria-label="Selected customer" className="customer-search-message" role="group">
                                            {customerNameForSave && <p>{customerNameForSave}</p>}
                                            {customerPhoneForSave && <p>{customerPhoneForSave}</p>}
                                            {customerDateOfBirthForSave && <p>{customerDateOfBirthForSave}</p>}
                                            <button
                                                onClick={() => {
                                                    setSelectedCustomerName('')
                                                    setSelectedCustomerPhone('')
                                                    setSelectedCustomerDateOfBirth('')
                                                    setSelectedCustomerFieldEnabled('name', false)
                                                    setSelectedCustomerFieldEnabled('phone', false)
                                                    setSelectedCustomerFieldEnabled('dateOfBirth', false)
                                                    setCustomerSearchQuery('')
                                                    setCustomerSearchMatches([])
                                                    setCustomerSearchStatus('idle')
                                                    setCustomerSearchMessage(null)
                                                    setIsCreateContactOpen(false)
                                                    clearInvoice()
                                                    setMessage(null)
                                                }}
                                                type="button"
                                            >
                                                Remove customer
                                            </button>
                                        </div>
                                    )}
                                    {selectedOrderLines.length > 0 && isCustomerDetailsDirty && (
                                        <button
                                            className="table-customer-save"
                                            disabled={isOrderActionInProgress || hasInvalidCustomerDetails}
                                            onClick={saveCustomerDetails}
                                            type="button"
                                        >
                                            Save details
                                        </button>
                                    )}
                                </fieldset>
                            )}

                            {!hasJustPaid && <div className="field-group table-order-description">
                                <label htmlFor="order-description">Order description (optional)</label>
                                <textarea
                                    disabled={isOrderActionInProgress}
                                    id="order-description"
                                    maxLength={500}
                                    onChange={(event) => {
                                        setOrderDescriptionDraftsBySeating((current) => ({ ...current, [selectedSeating.id]: event.target.value }))
                                        clearInvoice()
                                    }}
                                    placeholder="Add preparation notes or other order details"
                                    rows={3}
                                    value={orderDescription}
                                />
                                {selectedOrderLines.length > 0 && isOrderDescriptionDirty && <button
                                    className="table-customer-save"
                                    disabled={isOrderActionInProgress}
                                    onClick={saveOrderDescription}
                                    type="button"
                                >Save description</button>}
                            </div>}

                            {isLoading && <p className="table-order-empty">Loading menu...</p>}
                            {!isLoading && menuItems.length === 0 && (
                                <p className="table-order-empty">No menu items are available yet.</p>
                            )}

                            {!isLoading && menuItems.length > 0 && !isOrderCompleted && !hasJustPaid && (
                                <form className="table-order-form" noValidate onSubmit={(event) => event.preventDefault()}>
                                    <div className="field-group">
                                        <label htmlFor="table-menu-item">Menu item</label>
                                        <div
                                            className="table-menu-picker"
                                            onKeyDown={(event) => {
                                                if (event.key === 'Escape') {
                                                    event.preventDefault()
                                                    menuPickerRef.current?.querySelector('input')?.focus()
                                                    setIsMenuPickerOpen(false)
                                                    setActiveMenuItemId(null)
                                                    setMenuSearch('')
                                                }
                                            }}
                                            ref={menuPickerRef}
                                        >
                                            <input
                                                aria-autocomplete="list"
                                                aria-controls="table-menu-options"
                                                aria-expanded={isMenuPickerOpen}
                                                aria-haspopup="dialog"
                                                autoComplete="off"
                                                disabled={isOrderActionInProgress}
                                                id="table-menu-item"
                                                onChange={(event) => {
                                                    setMenuSearch(event.target.value)
                                                    setActiveMenuItemId(null)
                                                    setIsMenuPickerOpen(true)
                                                }}
                                                onClick={() => setIsMenuPickerOpen(true)}
                                                onFocus={() => {
                                                    setMenuSearch('')
                                                    setIsMenuPickerOpen(true)
                                                }}
                                                onKeyDown={(event) => {
                                                    const options = groupedMenuItems.flatMap((group) => group.items)
                                                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                                                        event.preventDefault()
                                                        setIsMenuPickerOpen(true)
                                                        if (options.length === 0) return
                                                        const currentIndex = options.findIndex((item) => item.id === activeMenuItemId)
                                                        const nextIndex = currentIndex === -1
                                                            ? event.key === 'ArrowDown' ? 0 : options.length - 1
                                                            : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
                                                        const nextItem = options[nextIndex]
                                                        setActiveMenuItemId(nextItem.id)
                                                        menuPickerRef.current?.querySelector<HTMLElement>(`#table-menu-option-${nextItem.id}`)?.scrollIntoView?.({ block: 'nearest' })
                                                        menuPickerRef.current?.querySelector<HTMLInputElement>(`#table-menu-option-${nextItem.id} input[type='checkbox']`)?.focus()
                                                    } else if (event.key === 'Enter') {
                                                        event.preventDefault()
                                                        if (!isMenuPickerOpen) return
                                                        const item = options.find((option) => option.id === activeMenuItemId)
                                                            ?? (options.length === 1 ? options[0] : undefined)
                                                        if (item) toggleMenuItem(item, !selectedOrderLines.some((line) => line.menuItemId === item.id))
                                                    } else if (event.key === 'Escape') {
                                                        event.preventDefault()
                                                        setIsMenuPickerOpen(false)
                                                        setActiveMenuItemId(null)
                                                        setMenuSearch('')
                                                    }
                                                }}
                                                placeholder="Select or search a dish"
                                                role="combobox"
                                                value={isMenuPickerOpen ? menuSearch : selectedOrderLines.length > 0 ? `${selectedOrderLines.length} selected` : menuSearch}
                                            />
                                            <button
                                                aria-label="Show menu items"
                                                className="table-menu-toggle"
                                                disabled={isOrderActionInProgress}
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => {
                                                    const shouldOpen = !isMenuPickerOpen
                                                    menuPickerRef.current?.querySelector('input')?.focus()
                                                    setMenuSearch('')
                                                    setIsMenuPickerOpen(shouldOpen)
                                                }}
                                                tabIndex={-1}
                                                type="button"
                                            ><span aria-hidden="true">&#9662;</span></button>
                                            <div aria-label="Menu items" className="table-menu-options" hidden={!isMenuPickerOpen} id="table-menu-options" role="dialog">
                                                {groupedMenuItems.map(({ section, subsection, items }) => (
                                                    <div aria-label={subsection ? `${section} / ${subsection}` : section} key={`${section}-${subsection || 'items'}`} role="group">
                                                        <div className="table-menu-option-heading">{subsection ? `${section} / ${subsection}` : section}</div>
                                                        {items.map((menuItem) => {
                                                            const line = selectedOrderLines.find((item) => item.menuItemId === menuItem.id)
                                                            return <div
                                                                className={activeMenuItemId === menuItem.id ? 'table-menu-check-row table-menu-option-active' : 'table-menu-check-row'}
                                                                id={`table-menu-option-${menuItem.id}`}
                                                                key={menuItem.id}
                                                                onMouseDown={(event) => {
                                                                    if (event.target instanceof Element && !event.target.closest('input, button, select, textarea')) {
                                                                        event.preventDefault()
                                                                    }
                                                                }}
                                                                onClick={(event) => {
                                                                    if (event.target instanceof Element && !event.target.closest('label, input, button, fieldset, .table-quantity-control')) {
                                                                        toggleMenuItem(menuItem, line === undefined)
                                                                    }
                                                                }}
                                                            >
                                                                <div className="table-menu-check-main">
                                                                    <label>
                                                                        <input
                                                                            aria-label={`Select ${menuItem.name}`}
                                                                            checked={line !== undefined}
                                                                            disabled={isOrderActionInProgress}
                                                                            onChange={(event) => toggleMenuItem(menuItem, event.target.checked)}
                                                                            onKeyDown={(event) => {
                                                                                if (event.key === 'Enter') {
                                                                                    event.preventDefault()
                                                                                    toggleMenuItem(menuItem, line === undefined)
                                                                                }
                                                                            }}
                                                                            type="checkbox"
                                                                        />
                                                                        <span>{menuItem.name}<small>{currencyFormatter.format(getUnitPrice(menuItem))}</small></span>
                                                                    </label>
                                                                    {line && <div aria-label={`Quantity for ${menuItem.name}`} className="table-quantity-control" role="group">
                                                                        <button aria-label={`Decrease selected ${menuItem.name} quantity`} className="table-quantity-step" disabled={isOrderActionInProgress || line.quantity <= 1} onClick={() => adjustOrderLineQuantity(line, -1)} type="button">-</button>
                                                                        <output>{line.quantity}</output>
                                                                        <button aria-label={`Increase selected ${menuItem.name} quantity`} className="table-quantity-step" disabled={isOrderActionInProgress || line.quantity >= 10_000} onClick={() => adjustOrderLineQuantity(line, 1)} type="button">+</button>
                                                                    </div>}
                                                                </div>
                                                                {line && menuItem.addOns.length > 0 && <div className="table-menu-addons-dropdown">
                                                                    <button
                                                                        aria-expanded={expandedAddOnMenuItemId === menuItem.id}
                                                                        aria-label={`Add-ons for ${menuItem.name}`}
                                                                        className="table-menu-addons-toggle"
                                                                        disabled={isOrderActionInProgress}
                                                                        onClick={() => toggleAddOnDropdown(menuItem)}
                                                                        type="button"
                                                                    >
                                                                        {expandedAddOnMenuItemId === menuItem.id ? 'Hide add-ons' : `Add-ons (${menuItem.addOns.length})`}
                                                                        <span aria-hidden="true">{expandedAddOnMenuItemId === menuItem.id ? '−' : '+'}</span>
                                                                    </button>
                                                                    {expandedAddOnMenuItemId === menuItem.id && <fieldset className="table-menu-inline-addons" disabled={isOrderActionInProgress}>
                                                                        <legend>Add-ons for {menuItem.name}</legend>
                                                                        {menuItem.addOns.map((addOn) => <label key={addOn.id}>
                                                                            <input aria-label={`Add ${addOn.name}`} checked={line.addOns.some((item) => item.id === addOn.id)} onChange={(event) => toggleOrderAddOn(menuItem, line, addOn, event.target.checked)} type="checkbox" />
                                                                            <span>{addOn.name} (+{currencyFormatter.format(addOn.price)})</span>
                                                                        </label>)}
                                                                    </fieldset>}
                                                                </div>}
                                                            </div>
                                                        })}
                                                    </div>
                                                ))}
                                                {matchingMenuItems.length === 0 && <p role="status">No matching menu items.</p>}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="table-order-actions">
                                        {isOrderSaving && <p role="status">Saving order...</p>}
                                        <button
                                            className="table-order-complete"
                                            disabled={isOrderActionInProgress || selectedOrderLines.length === 0 || hasFailedOrderSave}
                                            onClick={() => void completeOrder()}
                                            type="button"
                                        >
                                            Complete order
                                        </button>
                                    </div>
                                </form>
                            )}

                            {isOrderCompleted && (
                                <section aria-label={`Completed ${selectedSeatingName} order`} className="completed-order-panel">
                                    <p>Final price</p>
                                    <strong>{currencyFormatter.format(selectedOrderTotal)}</strong>
                                    <div className="completed-order-actions">
                                        <button
                                            className="invoice-create"
                                            disabled={isOrderActionInProgress || isOrderDetailsDirty || hasInvalidCustomerDetails}
                                            onClick={createInvoice}
                                            type="button"
                                        >
                                            Create invoice
                                        </button>
                                        <button className="table-open" disabled={isOrderActionInProgress} onClick={() => void openTable()} type="button">
                                            Open table
                                        </button>
                                    </div>

                                    {invoiceUrl && (
                                        <section aria-labelledby="invoice-preview-heading" className="invoice-preview">
                                            <header className="invoice-preview-heading">
                                                <h3 id="invoice-preview-heading">Invoice preview</h3>
                                                <div className="invoice-preview-actions">
                                                    <a className="invoice-download" download={getInvoiceFileName(selectedSeatingName)} href={invoiceUrl}>
                                                        Download invoice
                                                    </a>
                                                    {!selectedOpenOrder?.customerPhone && (
                                                        <label className="invoice-whatsapp-number" htmlFor="invoice-whatsapp-number">
                                                            <span>WhatsApp number</span>
                                                            <input
                                                                autoComplete="tel"
                                                                id="invoice-whatsapp-number"
                                                                inputMode="tel"
                                                                onChange={(event) => setInvoiceWhatsAppPhone(event.target.value)}
                                                                placeholder="98765 43210"
                                                                type="tel"
                                                                value={invoiceWhatsAppPhone}
                                                            />
                                                        </label>
                                                    )}
                                                    <button
                                                        aria-describedby="invoice-whatsapp-help"
                                                        className="invoice-whatsapp-button"
                                                        disabled={!selectedOpenOrder?.customerPhone
                                                            && normalizeCustomerPhoneNumber(invoiceWhatsAppPhone) === null}
                                                        onClick={openInvoiceInWhatsApp}
                                                        type="button"
                                                    >
                                                        Send in WhatsApp
                                                    </button>
                                                </div>
                                            </header>
                                            <p id="invoice-whatsapp-help" className="invoice-whatsapp-help">
                                                WhatsApp opens with the invoice details. Attach the downloaded PDF and tap Send.
                                            </p>
                                            <iframe src={invoiceUrl} title="Invoice preview" />
                                        </section>
                                    )}
                                </section>
                            )}

                            {message && (
                                <p
                                    aria-live="polite"
                                    className={`table-order-message table-order-message-${message.tone}`}
                                    role={message.tone === 'error' ? 'alert' : 'status'}
                                >
                                    {message.text}
                                </p>
                            )}
                            {hasRecentOrderSave && (
                                <p className="table-order-save-status" role="status">
                                    Last saved at {formatTime(lastOrderSave.savedAt.toISOString())}
                                </p>
                            )}
                            {hasFailedOrderSave && (
                                <button className="table-order-retry" disabled={isOrderSaving} onClick={retryOrderSave} type="button">
                                    Retry save
                                </button>
                            )}
                        </section>

                        <section aria-labelledby="table-order-summary-heading" className="table-order-summary">
                            <header className="table-order-summary-heading">
                                <div>
                                    <p className="eyebrow">Current order</p>
                                    <h2 id="table-order-summary-heading">{selectedSeatingName} order</h2>
                                </div>
                                <span>{selectedOrderLines.length} {selectedOrderLines.length === 1 ? 'item' : 'items'}</span>
                            </header>

                            {selectedOrderLines.length > 0 && (
                                <p className="table-order-customer-label">
                                    Ordering name: <strong>{formatCustomerName(customerNameForSave)}</strong>
                                </p>
                            )}
                            {selectedOpenOrder?.orderDescription && <p className="table-order-description-summary">
                                <strong>Description:</strong> {selectedOpenOrder.orderDescription}
                            </p>}

                            {selectedOrderLines.length === 0 ? (
                                <>
                                    <p className="table-order-empty">No items selected for {selectedSeatingName}.</p>
                                    {hasJustPaid && (
                                        <button className="table-restart" onClick={restartTable} type="button">Restart table</button>
                                    )}
                                    {hasJustPaid && lastPaidOrder && (
                                        <section aria-labelledby="paid-receipt-heading" className="paid-receipt-panel">
                                            <header className="paid-receipt-heading">
                                                <div>
                                                    <p className="eyebrow">Payment complete</p>
                                                    <h3 id="paid-receipt-heading">Receipt {lastPaidOrder.billNumber}</h3>
                                                </div>
                                                <strong>{currencyFormatter.format(lastPaidOrder.total)}</strong>
                                            </header>
                                            <p>
                                                {getPaymentMethodLabel(lastPaidOrder.paymentMethod)} payment recorded {formatDateTime(lastPaidOrder.paidAt)}.
                                            </p>
                                            {lastPaidOrder.paymentMethod === 'SPLIT' && <p>Cash: {currencyFormatter.format(lastPaidOrder.cashAmount ?? 0)} · Online: {currencyFormatter.format(lastPaidOrder.onlineAmount ?? 0)}</p>}
                                            <p className="table-order-customer-label">
                                                Ordering name: <strong>{formatCustomerName(lastPaidOrder.customerName)}</strong>
                                            </p>
                                            <button className="invoice-create" onClick={createPaidReceipt} type="button">
                                                {paidReceiptUrl ? 'Refresh paid receipt' : 'Create paid receipt'}
                                            </button>

                                            {paidReceiptUrl && (
                                                <section aria-labelledby="paid-receipt-preview-heading" className="invoice-preview paid-receipt-preview">
                                                    <header className="invoice-preview-heading">
                                                        <h3 id="paid-receipt-preview-heading">Paid receipt preview</h3>
                                                        <div className="paid-receipt-actions">
                                                            <a className="invoice-download" download={getReceiptFileName(lastPaidOrder.billNumber)} href={paidReceiptUrl}>
                                                                Download receipt
                                                            </a>
                                                            <button className="invoice-print" disabled={!isPaidReceiptReadyToPrint} onClick={printPaidReceipt} type="button">
                                                                Print receipt
                                                            </button>
                                                        </div>
                                                    </header>
                                                    <iframe
                                                        onLoad={() => setIsPaidReceiptReadyToPrint(true)}
                                                        ref={paidReceiptFrameRef}
                                                        src={paidReceiptUrl}
                                                        title="Paid receipt preview"
                                                    />
                                                </section>
                                            )}
                                        </section>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="table-order-table-wrap">
                                        <table aria-label={`Order for ${selectedSeatingName}`} className="table-order-table">
                                            <thead>
                                                <tr>
                                                    <th scope="col">Item</th>
                                                    <th scope="col">Quantity</th>
                                                    <th scope="col">Unit price</th>
                                                    <th scope="col">Price</th>
                                                    <th scope="col">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {orderLineGroups.map((group) => (
                                                    <Fragment key={group.section}>
                                                        {!isCommitteeOrder && <tr className="table-order-section-row">
                                                            <th colSpan={5} scope="rowgroup">
                                                                {group.section}{group.section === 'Others' ? ' (no bill discount)' : ''}
                                                            </th>
                                                        </tr>}
                                                        {group.lines.map((orderLine) => (
                                                            <tr key={getOrderLineKey(orderLine)}>
                                                                <td>{getOrderLineDisplayName(orderLine)}</td>
                                                                <td>
                                                                    <div
                                                                        aria-label={`Quantity for ${getOrderLineDisplayName(orderLine)}`}
                                                                        className="table-quantity-control"
                                                                        role="group"
                                                                    >
                                                                        <button
                                                                            aria-label={`Decrease ${getOrderLineDisplayName(orderLine)} quantity`}
                                                                            className="table-quantity-step"
                                                                            disabled={isOrderActionInProgress || orderLine.quantity <= 1}
                                                                            onClick={() => adjustOrderLineQuantity(orderLine, -1)}
                                                                            type="button"
                                                                        >
                                                                            -
                                                                        </button>
                                                                        <output>{orderLine.quantity}</output>
                                                                        <button
                                                                            aria-label={`Increase ${getOrderLineDisplayName(orderLine)} quantity`}
                                                                            className="table-quantity-step"
                                                                            disabled={isOrderActionInProgress}
                                                                            onClick={() => adjustOrderLineQuantity(orderLine, 1)}
                                                                            type="button"
                                                                        >
                                                                            +
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                                <td>{currencyFormatter.format(orderLine.unitPrice)}</td>
                                                                <td>{currencyFormatter.format(getLineTotal(orderLine))}</td>
                                                                <td>
                                                                    <button
                                                                        aria-label={`Remove ${getOrderLineDisplayName(orderLine)} from ${selectedSeatingName}`}
                                                                        className="table-order-remove"
                                                                        disabled={isOrderActionInProgress}
                                                                        onClick={() => removeOrderLine(orderLine)}
                                                                        type="button"
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                        {!isCommitteeOrder && <tr className="table-order-section-subtotal-row">
                                                            <th colSpan={3} scope="row">
                                                                {group.section === 'General' ? 'General total' : 'Others total'}
                                                            </th>
                                                            <td>{currencyFormatter.format(group.section === 'General' ? generalSubtotal : othersSubtotal)}</td>
                                                            <td></td>
                                                        </tr>}
                                                    </Fragment>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <th colSpan={3} scope="row">{isCommitteeOrder ? 'Total price' : 'Combined subtotal'}</th>
                                                    <td>{currencyFormatter.format(selectedOrderSubtotal)}</td>
                                                    <td></td>
                                                </tr>
                                                <tr>
                                                    <th colSpan={3} scope="row">{isCommitteeOrder ? 'Discount' : `Bill discount (${selectedDiscountPercent.toFixed(2)}% of General)`}</th>
                                                    <td>-{currencyFormatter.format(selectedDiscountAmount)}</td>
                                                    <td></td>
                                                </tr>
                                                <tr>
                                                    <th colSpan={3} scope="row">{isCommitteeOrder ? 'Final price' : 'Final bill'}</th>
                                                    <td>{currencyFormatter.format(selectedOrderTotal)}</td>
                                                    <td></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>

                                    {isOrderCompleted && (
                                        <div className="table-payment-actions">
                                            <p>Settle this order</p>
                                            <label className="table-split-toggle">
                                                <input checked={isSplitPayment} disabled={isOrderActionInProgress || isOrderDetailsDirty || hasInvalidCustomerDetails} onChange={(event) => {
                                                    setIsSplitPayment(event.target.checked)
                                                    setSplitCashAmount('')
                                                    setSplitOnlineAmount('')
                                                    setUpiQrSeatingId(null)
                                                    setUpiQrProvider('primary')
                                                    setMessage(null)
                                                }} type="checkbox" />
                                                Split payment
                                            </label>
                                            {isSplitPayment && <fieldset className="table-split-fields" disabled={isOrderActionInProgress}>
                                                <legend>Cash + Online</legend>
                                                <label htmlFor="split-cash-amount">Cash amount (INR)
                                                    <input id="split-cash-amount" inputMode="decimal" min="0.01" onChange={(event) => setSplitCashAmount(event.target.value)} step="0.01" type="number" value={splitCashAmount} />
                                                </label>
                                                <label htmlFor="split-online-amount">Online amount (INR)
                                                    <input id="split-online-amount" inputMode="decimal" min="0.01" onChange={(event) => setSplitOnlineAmount(event.target.value)} step="0.01" type="number" value={splitOnlineAmount} />
                                                </label>
                                                {(splitCashAmount !== '' || splitOnlineAmount !== '') && !isValidSplit && <p className="table-split-validation" role="alert">Cash and online amounts must be positive and add up to {currencyFormatter.format(selectedOrderTotal)}.</p>}
                                            </fieldset>}
                                            <div className="table-payment-buttons">
                                                {!isSplitPayment && upiVpa.trim() !== '' && (
                                                    <button
                                                        className="table-payment-upi"
                                                        disabled={isOrderActionInProgress || isOrderDetailsDirty || hasInvalidCustomerDetails}
                                                        onClick={() => {
                                                            const isQrVisible = upiQrSeatingId === selectedSeating.id
                                                            setUpiQrSeatingId(isQrVisible ? null : selectedSeating.id)
                                                            setUpiQrProvider('primary')
                                                        }}
                                                        type="button"
                                                    >
                                                        {upiQrSeatingId === selectedSeating.id ? 'Hide UPI QR' : 'Show UPI QR'}
                                                    </button>
                                                )}
                                                {!isSplitPayment && <button
                                                    className="table-payment-cash"
                                                    disabled={isOrderActionInProgress || isOrderDetailsDirty || hasInvalidCustomerDetails}
                                                    onClick={() => requestPayment('CASH')}
                                                    type="button"
                                                >
                                                    {paymentMethodInProgress === 'CASH' ? 'Recording cash payment...' : 'Paid by cash'}
                                                </button>}
                                                {!isSplitPayment && <button
                                                    className="table-payment-online"
                                                    disabled={isOrderActionInProgress || isOrderDetailsDirty || hasInvalidCustomerDetails}
                                                    onClick={() => requestPayment('ONLINE')}
                                                    type="button"
                                                >
                                                    {paymentMethodInProgress === 'ONLINE' ? 'Recording online payment...' : 'Paid online'}
                                                </button>}
                                                {isSplitPayment && <button className="table-payment-online" disabled={isOrderActionInProgress || isOrderDetailsDirty || hasInvalidCustomerDetails || !isValidSplit} onClick={() => requestPayment('SPLIT')} type="button">
                                                    {paymentMethodInProgress === 'SPLIT' ? 'Recording split payment...' : 'Record split payment'}
                                                </button>}
                                            </div>
                                            {selectedUpiVpa.trim() !== '' && (isSplitPayment ? isValidSplit : upiQrSeatingId === selectedSeating.id) && (
                                                <section aria-labelledby="table-upi-qr-heading" className="table-upi-qr">
                                                    <QRCodeSVG
                                                        includeMargin
                                                        size={208}
                                                        title="UPI payment QR"
                                                        value={createUpiPaymentUri(qrPaymentAmount, selectedSeatingName, restaurantName, selectedUpiVpa)}
                                                    />
                                                    <div>
                                                        <p className="eyebrow">UPI payment</p>
                                                        <h3 id="table-upi-qr-heading">Scan to pay {currencyFormatter.format(qrPaymentAmount)}</h3>
                                                        <p>Pay to {selectedUpiVpa}</p>
                                                        {secondaryUpiVpa.trim() !== '' && <fieldset className="table-upi-account-choice">
                                                            <legend>QR account</legend>
                                                            <label>
                                                                <input
                                                                    checked={upiQrProvider === 'primary'}
                                                                    name="upi-qr-provider"
                                                                    onChange={() => setUpiQrProvider('primary')}
                                                                    type="radio"
                                                                />
                                                                Primary
                                                            </label>
                                                            <label>
                                                                <input
                                                                    checked={upiQrProvider === 'secondary'}
                                                                    name="upi-qr-provider"
                                                                    onChange={() => setUpiQrProvider('secondary')}
                                                                    type="radio"
                                                                />
                                                                Show secondary
                                                            </label>
                                                        </fieldset>}
                                                        {!isSplitPayment && <p>After the payer confirms in their UPI app, select “Paid online” to record payment.</p>}
                                                    </div>
                                                </section>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </section>
                    </div>
                )}
            </section>

            {committeeMemberPendingDeletion && <ConfirmationDialog
                title={`Delete ${committeeMemberPendingDeletion.name}?`}
                message="Remove this member from the active Committee list? Paid order history will be kept."
                confirmLabel="Delete member"
                isConfirming={isSavingCommitteeMember}
                onCancel={() => setCommitteeMemberPendingDeletion(null)}
                onConfirm={() => void deleteCommitteeMember()}
                tone="danger"
            />}

            {pendingPaymentMethod && selectedSeating && (
                <ConfirmationDialog
                    confirmLabel={`Confirm ${getPaymentMethodLabel(pendingPaymentMethod).toLowerCase()} payment`}
                    isConfirming={paymentMethodInProgress !== null}
                    message={`Record a ${getPaymentMethodLabel(pendingPaymentMethod).toLowerCase()} payment for ${selectedSeatingName}? This will settle the completed order.`}
                    onCancel={() => setPendingPaymentMethod(null)}
                    onConfirm={() => void settleOrder(pendingPaymentMethod)}
                    title="Confirm payment"
                >
                    <strong>{currencyFormatter.format(selectedOrderTotal)}</strong>
                    {pendingPaymentMethod === 'SPLIT' && <p>Cash: {currencyFormatter.format((splitCashPaise ?? 0) / 100)} · Online: {currencyFormatter.format((splitOnlinePaise ?? 0) / 100)}</p>}
                </ConfirmationDialog>
            )}
        </div>
    )
}

export default TableManager