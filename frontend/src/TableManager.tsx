import { type FormEvent, useEffect, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import { QRCodeSVG } from 'qrcode.react'
import ConfirmationDialog from './ConfirmationDialog'
import { createOrderDocument } from './orderDocument'
import { useRestaurantConfiguration } from './RestaurantConfiguration'
import { createUpiPaymentUri } from './upiPayment'
import {
    apiBaseUrl,
    currencyFormatter,
    formatDateTime,
    getPaymentMethodLabel,
    isOpenOrder,
    isOpenOrders,
    isPaidOrder,
    type OpenOrder,
    type PaidOrder,
    type PaymentMethod,
} from './financial'

type MenuItem = {
    id: number
    name: string
    description: string | null
    discountApplied: number
    price: number
}

type OrderLine = {
    menuItemId: number
    name: string
    quantity: number
    unitPrice: number
}

type OpenOrderState = {
    completed: boolean
    lines: OrderLine[]
}

type TableMessage = {
    tone: 'error' | 'success'
    text: string
}

type OrderSaveIntent = {
    completed: boolean
    orderLines: OrderLine[]
    resetInvoice?: boolean
    resetOrderDraft?: boolean
    seatingId: string
    successMessage: string
    tableName: string
}

type OrderSaveStatus = {
    savedAt: Date
    seatingId: string
}

type SeatingSpot = {
    id: string
    kind: 'table' | 'outdoor'
    name: string
    number: number
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
        && 'discountApplied' in value
        && typeof value.discountApplied === 'number'
        && 'price' in value
        && typeof value.price === 'number'
}

function isMenuItems(value: unknown): value is MenuItem[] {
    return Array.isArray(value) && value.every(isMenuItem)
}

function roundCurrency(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100
}

function getUnitPrice(menuItem: MenuItem) {
    return roundCurrency(menuItem.price * (1 - menuItem.discountApplied / 100))
}

function getLineTotal(orderLine: OrderLine) {
    return roundCurrency(orderLine.unitPrice * orderLine.quantity)
}

function getOrderTotal(orderLines: OrderLine[]) {
    return roundCurrency(orderLines.reduce((total, orderLine) => total + getLineTotal(orderLine), 0))
}

function getSeatingStatus(order: OpenOrderState | undefined): SeatingStatus {
    if (order === undefined) {
        return { detail: 'Start an order', label: 'Available', tone: 'available' }
    }

    const total = currencyFormatter.format(getOrderTotal(order.lines))
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
        quantity: line.quantity,
        unitPrice: line.unitPrice,
    }))
}

function toOpenOrderState(openOrder: OpenOrder): OpenOrderState {
    return {
        completed: openOrder.completed,
        lines: toOrderLines(openOrder),
    }
}

function getInvoiceFileName(seatingName: string) {
    return `${seatingName.toLowerCase().replaceAll(' ', '-')}-invoice.pdf`
}

function getReceiptFileName(billNumber: string) {
    return `${billNumber.toLowerCase()}-receipt.pdf`
}

function getInvoiceReference(createdAt: Date, seatingName: string) {
    const datePart = `${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, '0')}${String(createdAt.getDate()).padStart(2, '0')}`
    const timePart = `${String(createdAt.getHours()).padStart(2, '0')}${String(createdAt.getMinutes()).padStart(2, '0')}${String(createdAt.getSeconds()).padStart(2, '0')}`
    const seatingPart = seatingName.toUpperCase().replaceAll(' ', '-')

    return `PP-${datePart}-${timePart}-${seatingPart}`
}

type TableManagerProps = {
    isActive?: boolean
}

function TableManager({ isActive = true }: TableManagerProps) {
    const { restaurantName, upiVpa } = useRestaurantConfiguration()
    const paidReceiptFrameRef = useRef<HTMLIFrameElement>(null)
    const [menuItems, setMenuItems] = useState<MenuItem[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [tableCount, setTableCount] = useState(initialTableCount)
    const [outdoorCount, setOutdoorCount] = useState(initialOutdoorCount)
    const [selectedSeatingId, setSelectedSeatingId] = useState<string | null>(null)
    const [selectedMenuItemId, setSelectedMenuItemId] = useState('')
    const [quantity, setQuantity] = useState('1')
    const [ordersBySeating, setOrdersBySeating] = useState<Partial<Record<string, OpenOrderState>>>({})
    const [isOrderSaving, setIsOrderSaving] = useState(false)
    const [failedOrderSave, setFailedOrderSave] = useState<OrderSaveIntent | null>(null)
    const [lastOrderSave, setLastOrderSave] = useState<OrderSaveStatus | null>(null)
    const [paymentMethodInProgress, setPaymentMethodInProgress] = useState<PaymentMethod | null>(null)
    const [pendingPaymentMethod, setPendingPaymentMethod] = useState<PaymentMethod | null>(null)
    const [upiQrSeatingId, setUpiQrSeatingId] = useState<string | null>(null)
    const [lastPaidSeatingId, setLastPaidSeatingId] = useState<string | null>(null)
    const [lastPaidOrder, setLastPaidOrder] = useState<PaidOrder | null>(null)
    const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null)
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

                    setMenuItems(items)
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
                        } else {
                            restoredOutdoorCount = Math.max(restoredOutdoorCount, seatingSpot.number)
                        }
                    }

                    setOrdersBySeating(restoredOrders)
                    setTableCount((currentCount) => Math.max(currentCount, restoredTableCount))
                    setOutdoorCount((currentCount) => Math.max(currentCount, restoredOutdoorCount))
                })

            const [menuResult, openOrdersResult] = await Promise.allSettled([menuLoad, openOrdersLoad])
            if (controller.signal.aborted) return

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

    const tableSpots = createSeatingSpots('table', 'Table', tableCount)
    const outdoorSpots = createSeatingSpots('outdoor', 'Outdoor', outdoorCount)
    const selectedSeating = [...tableSpots, ...outdoorSpots].find((spot) => spot.id === selectedSeatingId) ?? null
    const selectedMenuItem = menuItems.find((menuItem) => String(menuItem.id) === selectedMenuItemId)
    const parsedQuantity = Number(quantity)
    const hasValidQuantity = Number.isInteger(parsedQuantity) && parsedQuantity >= 1
    const selectedOpenOrder = selectedSeating === null ? null : ordersBySeating[selectedSeating.id] ?? null
    const selectedOrderLines = selectedOpenOrder?.lines ?? []
    const isOrderCompleted = selectedOpenOrder?.completed ?? false
    const hasJustPaid = selectedSeating !== null && lastPaidSeatingId === selectedSeating.id
    const hasFailedOrderSave = selectedSeating !== null && failedOrderSave?.seatingId === selectedSeating.id
    const hasRecentOrderSave = selectedSeating !== null && lastOrderSave?.seatingId === selectedSeating.id
    const selectedOrderTotal = getOrderTotal(selectedOrderLines)
    const draftLineTotal = selectedMenuItem && hasValidQuantity
        ? roundCurrency(getUnitPrice(selectedMenuItem) * parsedQuantity)
        : null
    const isOrderActionInProgress = isOrderSaving || paymentMethodInProgress !== null || pendingPaymentMethod !== null

    function selectSeating(seatingId: string) {
        setInvoiceUrl(null)
        setSelectedSeatingId(seatingId)
        setMessage(null)
    }

    async function saveOpenOrder(tableName: string, orderLines: OrderLine[], completed: boolean) {
        const response = await fetch(`${apiBaseUrl}/api/open-orders`, {
            body: JSON.stringify({
                completed,
                lines: orderLines.map((orderLine) => ({
                    menuItemId: orderLine.menuItemId,
                    quantity: orderLine.quantity,
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
        setOrdersBySeating((currentOrders) => {
            const nextOrders = { ...currentOrders }
            if (savedOpenOrder === null) {
                delete nextOrders[intent.seatingId]
            } else {
                nextOrders[intent.seatingId] = savedOpenOrder
            }

            return nextOrders
        })
        if (intent.resetOrderDraft) {
            setSelectedMenuItemId('')
            setQuantity('1')
        }
        if (intent.resetInvoice) {
            setInvoiceUrl(null)
        }
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
            const savedOpenOrder = await saveOpenOrder(intent.tableName, intent.orderLines, intent.completed)
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

    async function addMenuItemToOrder(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        if (selectedSeating === null || selectedMenuItem === undefined) {
            setMessage({ tone: 'error', text: 'Choose a menu item.' })
            return
        }

        if (!hasValidQuantity) {
            setMessage({ tone: 'error', text: 'Quantity must be a whole number of at least 1.' })
            return
        }

        const unitPrice = getUnitPrice(selectedMenuItem)
        const matchingOrderLine = selectedOrderLines.find(
            (orderLine) => orderLine.menuItemId === selectedMenuItem.id,
        )
        const nextOrderLines = matchingOrderLine
            ? selectedOrderLines.map((orderLine) => orderLine.menuItemId === selectedMenuItem.id
                ? { ...orderLine, quantity: orderLine.quantity + parsedQuantity }
                : orderLine)
            : [...selectedOrderLines, {
                menuItemId: selectedMenuItem.id,
                name: selectedMenuItem.name,
                quantity: parsedQuantity,
                unitPrice,
            }]

        void persistOrder({
            completed: false,
            orderLines: nextOrderLines,
            resetOrderDraft: true,
            seatingId: selectedSeating.id,
            successMessage: `${selectedMenuItem.name} added to ${selectedSeating.name}.`,
            tableName: selectedSeating.name,
        })
    }

    async function removeOrderLine(orderLine: OrderLine) {
        if (selectedSeating === null) return

        const nextOrderLines = selectedOrderLines.filter(
            (currentOrderLine) => currentOrderLine.menuItemId !== orderLine.menuItemId,
        )
        void persistOrder({
            completed: false,
            orderLines: nextOrderLines,
            seatingId: selectedSeating.id,
            successMessage: `${orderLine.name} removed from ${selectedSeating.name}.`,
            tableName: selectedSeating.name,
        })
    }

    async function completeOrder() {
        if (selectedSeating === null || selectedOrderLines.length === 0 || isOrderCompleted) return

        void persistOrder({
            completed: true,
            orderLines: selectedOrderLines,
            resetInvoice: true,
            seatingId: selectedSeating.id,
            successMessage: `${selectedSeating.name} completed. Final price: ${currencyFormatter.format(selectedOrderTotal)}.`,
            tableName: selectedSeating.name,
        })
    }

    async function openTable() {
        if (selectedSeating === null || selectedOrderLines.length === 0 || !isOrderCompleted) return

        void persistOrder({
            completed: false,
            orderLines: selectedOrderLines,
            resetInvoice: true,
            seatingId: selectedSeating.id,
            successMessage: `${selectedSeating.name} is open for more items.`,
            tableName: selectedSeating.name,
        })
    }

    function createInvoice() {
        if (selectedSeating === null || selectedOrderLines.length === 0 || !isOrderCompleted) return

        const invoice = new jsPDF({ format: 'a4', unit: 'pt' })
        const createdAt = new Date()
        const invoiceReference = getInvoiceReference(createdAt, selectedSeating.name)
        const pageLeft = 48
        const pageRight = 548
        const footerY = 782

        function addInvoiceFooter() {
            invoice.setDrawColor(205, 210, 204)
            invoice.line(pageLeft, footerY - 12, pageRight, footerY - 12)
            invoice.setFontSize(8)
            invoice.setTextColor(91, 102, 92)
            invoice.text(`Thank you for dining with ${restaurantName}.`, pageLeft, footerY)
            invoice.text('Computer-generated invoice', pageRight, footerY, { align: 'right' })
        }

        function addTableHeader(top: number) {
            invoice.setFillColor(42, 58, 46)
            invoice.rect(pageLeft, top, pageRight - pageLeft, 26, 'F')
            invoice.setFontSize(8)
            invoice.setTextColor(255, 255, 255)
            invoice.text('NO.', 58, top + 17)
            invoice.text('ITEM', 88, top + 17)
            invoice.text('QTY', 368, top + 17, { align: 'right' })
            invoice.text('RATE', 442, top + 17, { align: 'right' })
            invoice.text('AMOUNT', 538, top + 17, { align: 'right' })
        }

        invoice.setFillColor(42, 58, 46)
        invoice.rect(pageLeft, 48, pageRight - pageLeft, 74, 'F')
        invoice.setTextColor(255, 255, 255)
        invoice.setFontSize(22)
        invoice.text(restaurantName.toLocaleUpperCase('en-IN'), 64, 80)
        invoice.setFontSize(9)
        invoice.text('RESTAURANT BILLING', 64, 98)
        invoice.setFontSize(18)
        invoice.text('INVOICE', 532, 80, { align: 'right' })
        invoice.setFontSize(9)
        invoice.text('PAYMENT PENDING', 532, 98, { align: 'right' })

        invoice.setTextColor(42, 48, 43)
        invoice.setFontSize(10)
        invoice.text(`Invoice no. ${invoiceReference}`, pageLeft, 152)
        invoice.text(`Issued: ${createdAt.toLocaleString('en-IN')}`, pageLeft, 170)
        invoice.text(`Seating: ${selectedSeating.name}`, pageRight, 152, { align: 'right' })
        invoice.text('Payment status: Pending', pageRight, 170, { align: 'right' })
        invoice.setDrawColor(205, 210, 204)
        invoice.line(pageLeft, 188, pageRight, 188)

        let cursorY = 210
        addTableHeader(cursorY)
        cursorY += 26

        for (const [index, orderLine] of selectedOrderLines.entries()) {
            const itemLines = invoice.splitTextToSize(orderLine.name, 244)
            const rowHeight = Math.max(32, itemLines.length * 12 + 16)

            if (cursorY + rowHeight > 700) {
                addInvoiceFooter()
                invoice.addPage()
                invoice.setFontSize(10)
                invoice.setTextColor(42, 48, 43)
                invoice.text(`${restaurantName.toLocaleUpperCase('en-IN')} | Order invoice continued`, pageLeft, 56)
                invoice.text(invoiceReference, pageRight, 56, { align: 'right' })
                cursorY = 76
                addTableHeader(cursorY)
                cursorY += 26
            }

            invoice.setFontSize(10)
            invoice.setTextColor(42, 48, 43)
            invoice.text(String(index + 1), 58, cursorY + 18)
            invoice.text(itemLines, 88, cursorY + 18)
            invoice.text(String(orderLine.quantity), 368, cursorY + 18, { align: 'right' })
            invoice.text(`INR ${orderLine.unitPrice.toFixed(2)}`, 442, cursorY + 18, { align: 'right' })
            invoice.text(`INR ${getLineTotal(orderLine).toFixed(2)}`, 538, cursorY + 18, { align: 'right' })
            invoice.setDrawColor(225, 228, 224)
            invoice.line(pageLeft, cursorY + rowHeight, pageRight, cursorY + rowHeight)
            cursorY += rowHeight
        }

        if (cursorY > 652) {
            addInvoiceFooter()
            invoice.addPage()
            invoice.setFontSize(10)
            invoice.setTextColor(42, 48, 43)
            invoice.text(`${restaurantName.toLocaleUpperCase('en-IN')} | Invoice summary`, pageLeft, 56)
            invoice.text(invoiceReference, pageRight, 56, { align: 'right' })
            cursorY = 82
        }

        const totalTop = cursorY + 16
        invoice.setDrawColor(42, 58, 46)
        invoice.line(330, totalTop, pageRight, totalTop)
        invoice.setFontSize(10)
        invoice.setTextColor(42, 48, 43)
        invoice.text('Order total', 442, totalTop + 24, { align: 'right' })
        invoice.setFontSize(16)
        invoice.text(`INR ${selectedOrderTotal.toFixed(2)}`, pageRight, totalTop + 24, { align: 'right' })
        invoice.setFontSize(9)
        invoice.setTextColor(91, 102, 92)
        invoice.text('Please settle the bill at the counter.', pageLeft, totalTop + 24)
        addInvoiceFooter()
        setInvoiceUrl(URL.createObjectURL(invoice.output('blob')))
    }

    function createPaidReceipt() {
        if (lastPaidOrder === null) return

        setIsPaidReceiptReadyToPrint(false)
        setPaidReceiptUrl(URL.createObjectURL(createOrderDocument({
            documentTitle: 'PAYMENT RECEIPT',
            issuedAt: new Date(lastPaidOrder.paidAt),
            lines: lastPaidOrder.lines,
            paymentMethod: lastPaidOrder.paymentMethod,
            paymentStatus: 'PAID',
            reference: lastPaidOrder.billNumber,
            restaurantName,
            seatingName: lastPaidOrder.tableName,
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
        if (selectedSeating === null || !hasJustPaid) return

        setOrdersBySeating((currentOrders) => {
            const nextOrders = { ...currentOrders }
            delete nextOrders[selectedSeating.id]
            return nextOrders
        })
        setInvoiceUrl(null)
        setPaidReceiptUrl(null)
        setIsPaidReceiptReadyToPrint(false)
        setLastPaidSeatingId(null)
        setLastPaidOrder(null)
        setMessage(null)
        setQuantity('1')
        setSelectedMenuItemId('')
        setSelectedSeatingId(null)
    }

    async function settleOrder(paymentMethod: PaymentMethod) {
        if (selectedSeating === null || selectedOrderLines.length === 0 || isOrderSaving || !isOrderCompleted) return

        setPaymentMethodInProgress(paymentMethod)
        setMessage(null)

        try {
            const response = await fetch(`${apiBaseUrl}/api/payments`, {
                body: JSON.stringify({
                    paymentMethod,
                    tableName: selectedSeating.name,
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
            setInvoiceUrl(null)
            setPaidReceiptUrl(null)
            setIsPaidReceiptReadyToPrint(false)
            setLastPaidSeatingId(selectedSeating.id)
            setLastPaidOrder(paidOrder)
            setUpiQrSeatingId(null)
            setMessage({
                tone: 'success',
                text: `${selectedSeating.name} paid by ${getPaymentMethodLabel(paymentMethod).toLowerCase()}: ${currencyFormatter.format(paidOrder.total)}.`,
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

                            return (
                                <button
                                    aria-describedby={`seat-status-${tableSpot.id}`}
                                    aria-label={tableSpot.name}
                                    aria-pressed={selectedSeating?.id === tableSpot.id}
                                    className={`table-selector table-selector-${seatingStatus.tone}`}
                                    disabled={isOrderActionInProgress}
                                    key={tableSpot.id}
                                    onClick={() => selectSeating(tableSpot.id)}
                                    title={`${seatingStatus.label}: ${seatingStatus.detail}`}
                                    type="button"
                                >
                                    <span aria-hidden="true" className="seating-selector-name">{tableSpot.name}</span>
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

                            return (
                                <button
                                    aria-describedby={`seat-status-${outdoorSpot.id}`}
                                    aria-label={outdoorSpot.name}
                                    aria-pressed={selectedSeating?.id === outdoorSpot.id}
                                    className={`outdoor-selector outdoor-selector-${seatingStatus.tone}`}
                                    disabled={isOrderActionInProgress}
                                    key={outdoorSpot.id}
                                    onClick={() => selectSeating(outdoorSpot.id)}
                                    title={`${seatingStatus.label}: ${seatingStatus.detail}`}
                                    type="button"
                                >
                                    <span aria-hidden="true" className="seating-selector-name">Outdoor</span>
                                    <strong aria-hidden="true">{outdoorSpot.name.replace('Outdoor ', '')}</strong>
                                    <span aria-hidden="true" className="seating-selector-status">{seatingStatus.label}</span>
                                    <span className="screen-reader-only" id={`seat-status-${outdoorSpot.id}`}>
                                        {seatingStatus.label}. {seatingStatus.detail}
                                    </span>
                                </button>
                            )
                        })}
                    </div>
                </section>
                {selectedSeating !== null && (
                    <div className="table-order-area">
                        <section aria-labelledby="table-order-builder-heading" className="table-order-builder">
                            <header className="table-order-heading">
                                <p className="eyebrow">Selected seating</p>
                                <h2 id="table-order-builder-heading">{selectedSeating.name}</h2>
                            </header>

                            {isLoading && <p className="table-order-empty">Loading menu...</p>}
                            {!isLoading && menuItems.length === 0 && (
                                <p className="table-order-empty">No menu items are available yet.</p>
                            )}

                            {!isLoading && menuItems.length > 0 && !isOrderCompleted && !hasJustPaid && (
                                <form className="table-order-form" noValidate onSubmit={addMenuItemToOrder}>
                                    <div className="field-group">
                                        <label htmlFor="table-menu-item">Menu item</label>
                                        <select
                                            disabled={isOrderActionInProgress}
                                            id="table-menu-item"
                                            onChange={(event) => setSelectedMenuItemId(event.target.value)}
                                            value={selectedMenuItemId}
                                        >
                                            <option value="">Select a dish</option>
                                            {menuItems.map((menuItem) => (
                                                <option key={menuItem.id} value={menuItem.id}>
                                                    {menuItem.name} - {currencyFormatter.format(getUnitPrice(menuItem))}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="field-group table-order-quantity">
                                        <label htmlFor="table-order-quantity">Quantity</label>
                                        <input
                                            disabled={isOrderActionInProgress}
                                            id="table-order-quantity"
                                            inputMode="numeric"
                                            min="1"
                                            onChange={(event) => setQuantity(event.target.value)}
                                            step="1"
                                            type="number"
                                            value={quantity}
                                        />
                                    </div>

                                    {draftLineTotal !== null && (
                                        <p className="table-order-price-preview">
                                            Line price: <strong>{currencyFormatter.format(draftLineTotal)}</strong>
                                        </p>
                                    )}

                                    <div className="table-order-actions">
                                        <button className="table-order-add" disabled={isOrderActionInProgress} type="submit">
                                            {isOrderSaving ? 'Saving order...' : `Add to ${selectedSeating.name}`}
                                        </button>
                                        <button
                                            className="table-order-complete"
                                            disabled={isOrderActionInProgress || selectedOrderLines.length === 0}
                                            onClick={() => void completeOrder()}
                                            type="button"
                                        >
                                            Complete order
                                        </button>
                                    </div>
                                </form>
                            )}

                            {isOrderCompleted && (
                                <section aria-label={`Completed ${selectedSeating.name} order`} className="completed-order-panel">
                                    <p>Final price</p>
                                    <strong>{currencyFormatter.format(selectedOrderTotal)}</strong>
                                    <div className="completed-order-actions">
                                        <button className="invoice-create" onClick={createInvoice} type="button">Create invoice</button>
                                        <button className="table-open" disabled={isOrderActionInProgress} onClick={() => void openTable()} type="button">
                                            Open table
                                        </button>
                                    </div>

                                    {invoiceUrl && (
                                        <section aria-labelledby="invoice-preview-heading" className="invoice-preview">
                                            <header className="invoice-preview-heading">
                                                <h3 id="invoice-preview-heading">Invoice preview</h3>
                                                <a className="invoice-download" download={getInvoiceFileName(selectedSeating.name)} href={invoiceUrl}>
                                                    Download invoice
                                                </a>
                                            </header>
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
                                    Last saved at {lastOrderSave.savedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
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
                                    <h2 id="table-order-summary-heading">{selectedSeating.name} order</h2>
                                </div>
                                <span>{selectedOrderLines.length} {selectedOrderLines.length === 1 ? 'item' : 'items'}</span>
                            </header>

                            {selectedOrderLines.length === 0 ? (
                                <>
                                    <p className="table-order-empty">No items selected for {selectedSeating.name}.</p>
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
                                        <table aria-label={`Order for ${selectedSeating.name}`} className="table-order-table">
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
                                                {selectedOrderLines.map((orderLine) => (
                                                    <tr key={orderLine.menuItemId}>
                                                        <td>{orderLine.name}</td>
                                                        <td>{orderLine.quantity}</td>
                                                        <td>{currencyFormatter.format(orderLine.unitPrice)}</td>
                                                        <td>{currencyFormatter.format(getLineTotal(orderLine))}</td>
                                                        <td>
                                                            <button
                                                                aria-label={`Remove ${orderLine.name} from ${selectedSeating.name}`}
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
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <th colSpan={3} scope="row">Total price</th>
                                                    <td>{currencyFormatter.format(selectedOrderTotal)}</td>
                                                    <td></td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>

                                    {isOrderCompleted && (
                                        <div className="table-payment-actions">
                                            <p>Settle this order</p>
                                            <div className="table-payment-buttons">
                                                {upiVpa.trim() !== '' && (
                                                    <button
                                                        className="table-payment-upi"
                                                        disabled={isOrderActionInProgress}
                                                        onClick={() => setUpiQrSeatingId((currentId) => (
                                                            currentId === selectedSeating.id ? null : selectedSeating.id
                                                        ))}
                                                        type="button"
                                                    >
                                                        {upiQrSeatingId === selectedSeating.id ? 'Hide UPI QR' : 'Show UPI QR'}
                                                    </button>
                                                )}
                                                <button
                                                    className="table-payment-cash"
                                                    disabled={isOrderActionInProgress}
                                                    onClick={() => requestPayment('CASH')}
                                                    type="button"
                                                >
                                                    {paymentMethodInProgress === 'CASH' ? 'Recording cash payment...' : 'Paid by cash'}
                                                </button>
                                                <button
                                                    className="table-payment-online"
                                                    disabled={isOrderActionInProgress}
                                                    onClick={() => requestPayment('ONLINE')}
                                                    type="button"
                                                >
                                                    {paymentMethodInProgress === 'ONLINE' ? 'Recording online payment...' : 'Paid online'}
                                                </button>
                                            </div>
                                            {upiVpa.trim() !== '' && upiQrSeatingId === selectedSeating.id && (
                                                <section aria-labelledby="table-upi-qr-heading" className="table-upi-qr">
                                                    <QRCodeSVG
                                                        includeMargin
                                                        size={208}
                                                        title="UPI payment QR"
                                                        value={createUpiPaymentUri(selectedOrderTotal, selectedSeating.name, restaurantName, upiVpa)}
                                                    />
                                                    <div>
                                                        <p className="eyebrow">UPI payment</p>
                                                        <h3 id="table-upi-qr-heading">Scan to pay {currencyFormatter.format(selectedOrderTotal)}</h3>
                                                        <p>Pay to {upiVpa}</p>
                                                        <p>After the payer confirms in their UPI app, select “Paid online” to record payment.</p>
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

            {pendingPaymentMethod && selectedSeating && (
                <ConfirmationDialog
                    confirmLabel={`Confirm ${getPaymentMethodLabel(pendingPaymentMethod).toLowerCase()} payment`}
                    isConfirming={paymentMethodInProgress !== null}
                    message={`Record a ${getPaymentMethodLabel(pendingPaymentMethod).toLowerCase()} payment for ${selectedSeating.name}? This will settle the completed order.`}
                    onCancel={() => setPendingPaymentMethod(null)}
                    onConfirm={() => void settleOrder(pendingPaymentMethod)}
                    title="Confirm payment"
                >
                    <strong>{currencyFormatter.format(selectedOrderTotal)}</strong>
                </ConfirmationDialog>
            )}
        </div>
    )
}

export default TableManager