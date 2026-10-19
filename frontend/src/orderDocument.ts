import { jsPDF } from 'jspdf'
import { formatCustomerName, formatDateTime, getPaymentMethodLabel, type PaymentMethod } from './financial'
import { groupOrderLines } from './orderSections'

export type OrderDocument = {
    documentTitle: 'INVOICE' | 'PAYMENT RECEIPT'
    issuedAt: Date
    lines: OrderDocumentLine[]
    paymentMethod: PaymentMethod | null
    cashAmount?: number
    onlineAmount?: number
    paymentStatus: 'PAID' | 'PENDING'
    reference: string
    restaurantName: string
    seatingName: string
    isCommitteeOrder?: boolean
    tableLabel?: string | null
    orderDescription?: string | null
    customerName?: string | null
    subtotal?: number
    discountPercent?: number
    discountAmount?: number
    total: number
}

export type OrderDocumentLine = {
    itemName: string
    lineTotal: number
    quantity: number
    section?: string
    unitPrice: number
}

export function createOrderDocument(order: OrderDocument) {
    const document = new jsPDF({ format: 'a4', unit: 'pt' })
    const pageLeft = 48
    const pageRight = 548
    const footerY = 782
    const isPaid = order.paymentStatus === 'PAID'
    const referenceLabel = order.documentTitle === 'PAYMENT RECEIPT' ? 'Receipt no.' : 'Invoice no.'
    const restaurantNameUppercase = order.restaurantName.toLocaleUpperCase('en-IN')

    function addFooter() {
        document.setDrawColor(205, 210, 204)
        document.line(pageLeft, footerY - 12, pageRight, footerY - 12)
        document.setFontSize(8)
        document.setTextColor(91, 102, 92)
        document.text(`Thank you for dining with ${order.restaurantName}.`, pageLeft, footerY)
        document.text(
            isPaid ? 'Computer-generated payment receipt' : 'Computer-generated invoice',
            pageRight,
            footerY,
            { align: 'right' },
        )
    }

    function addTableHeader(top: number) {
        document.setFillColor(42, 58, 46)
        document.rect(pageLeft, top, pageRight - pageLeft, 26, 'F')
        document.setFontSize(8)
        document.setTextColor(255, 255, 255)
        document.text('NO.', 58, top + 17)
        document.text('ITEM', 88, top + 17)
        document.text('QTY', 368, top + 17, { align: 'right' })
        document.text('RATE', 442, top + 17, { align: 'right' })
        document.text('AMOUNT', 538, top + 17, { align: 'right' })
    }

    document.setFillColor(42, 58, 46)
    document.rect(pageLeft, 48, pageRight - pageLeft, 74, 'F')
    document.setTextColor(255, 255, 255)
    document.setFontSize(22)
    document.text(restaurantNameUppercase, 64, 80)
    document.setFontSize(9)
    document.text('RESTAURANT BILLING', 64, 98)
    document.setFontSize(18)
    document.text(order.documentTitle, 532, 80, { align: 'right' })
    document.setFontSize(9)
    document.text(isPaid ? 'PAID' : 'PAYMENT PENDING', 532, 98, { align: 'right' })

    document.setTextColor(42, 48, 43)
    document.setFontSize(10)
    const seatingLines = document.splitTextToSize(`Seating: ${order.tableLabel?.trim() || order.seatingName}`, 230)
    const metadataOffset = Math.max(0, seatingLines.length - 1) * 12
    document.text(`${referenceLabel} ${order.reference}`, pageLeft, 152)
    document.text(`Issued: ${formatDateTime(order.issuedAt.toISOString())}`, pageLeft, 170 + metadataOffset)
    document.text(seatingLines, pageRight, 152, { align: 'right' })
    document.text(`Payment status: ${isPaid ? 'Paid' : 'Pending'}`, pageRight, 170 + metadataOffset, { align: 'right' })
    document.text(`Ordering name: ${formatCustomerName(order.customerName)}`, pageLeft, 188 + metadataOffset)

    let metadataBottom = 206 + metadataOffset
    if (order.paymentMethod !== null) {
        document.text(`Payment method: ${getPaymentMethodLabel(order.paymentMethod)}`, pageRight, 188 + metadataOffset, { align: 'right' })
    }
    if (order.paymentMethod === 'SPLIT' && order.cashAmount !== undefined && order.onlineAmount !== undefined) {
        document.text(`Cash: INR ${order.cashAmount.toFixed(2)} | Online: INR ${order.onlineAmount.toFixed(2)}`, pageRight, 206 + metadataOffset, { align: 'right' })
        metadataBottom = 224 + metadataOffset
    }
    const orderDescription = order.orderDescription?.trim()
    if (orderDescription) {
        const descriptionLines = document.splitTextToSize(`Description: ${orderDescription}`, pageRight - pageLeft)
        const descriptionTop = metadataBottom + 16
        document.text(descriptionLines, pageLeft, descriptionTop)
        metadataBottom = descriptionTop + descriptionLines.length * 12
    }
    document.setDrawColor(205, 210, 204)
    document.line(pageLeft, metadataBottom, pageRight, metadataBottom)

    let cursorY = metadataBottom + 22
    addTableHeader(cursorY)
    cursorY += 26

    const groupedLines = order.isCommitteeOrder ? [{ section: 'Committee', lines: order.lines }] : groupOrderLines(order.lines)
    let lineNumber = 0
    for (const group of groupedLines) {
        if (cursorY + 32 > 700) {
            addFooter()
            document.addPage()
            document.setFontSize(10)
            document.setTextColor(42, 48, 43)
            document.text(`${restaurantNameUppercase} | ${order.documentTitle} CONTINUED`, pageLeft, 56)
            document.text(order.reference, pageRight, 56, { align: 'right' })
            cursorY = 76
            addTableHeader(cursorY)
            cursorY += 26
        }

        if (!order.isCommitteeOrder) {
            document.setFontSize(9)
            document.setTextColor(91, 102, 92)
            document.text(group.section === 'Others' ? 'OTHERS (NO BILL DISCOUNT)' : 'GENERAL', 88, cursorY + 16)
            cursorY += 22
        }

        for (const orderLine of group.lines) {
            const itemLines = document.splitTextToSize(orderLine.itemName, 244)
            const rowHeight = Math.max(32, itemLines.length * 12 + 16)

            if (cursorY + rowHeight > 700) {
                addFooter()
                document.addPage()
                document.setFontSize(10)
                document.setTextColor(42, 48, 43)
                document.text(`${restaurantNameUppercase} | ${order.documentTitle} CONTINUED`, pageLeft, 56)
                document.text(order.reference, pageRight, 56, { align: 'right' })
                cursorY = 76
                addTableHeader(cursorY)
                cursorY += 26
                if (!order.isCommitteeOrder) {
                    document.setFontSize(9)
                    document.setTextColor(91, 102, 92)
                    document.text(group.section === 'Others' ? 'OTHERS (NO BILL DISCOUNT)' : 'GENERAL', 88, cursorY + 16)
                    cursorY += 22
                }
            }

            document.setFontSize(10)
            document.setTextColor(42, 48, 43)
            document.text(String(++lineNumber), 58, cursorY + 18)
            document.text(itemLines, 88, cursorY + 18)
            document.text(String(orderLine.quantity), 368, cursorY + 18, { align: 'right' })
            document.text(`INR ${orderLine.unitPrice.toFixed(2)}`, 442, cursorY + 18, { align: 'right' })
            document.text(`INR ${orderLine.lineTotal.toFixed(2)}`, 538, cursorY + 18, { align: 'right' })
            document.setDrawColor(225, 228, 224)
            document.line(pageLeft, cursorY + rowHeight, pageRight, cursorY + rowHeight)
            cursorY += rowHeight
        }
    }

    if (cursorY > 652) {
        addFooter()
        document.addPage()
        document.setFontSize(10)
        document.setTextColor(42, 48, 43)
        document.text(`${restaurantNameUppercase} | ${order.documentTitle} SUMMARY`, pageLeft, 56)
        document.text(order.reference, pageRight, 56, { align: 'right' })
        cursorY = 82
    }

    const generalSubtotal = groupedLines.find((group) => group.section === 'General')
        ?.lines.reduce((sum, line) => sum + line.lineTotal, 0) ?? 0
    const othersGroup = groupedLines.find((group) => group.section === 'Others')
    const othersSubtotal = othersGroup?.lines.reduce((sum, line) => sum + line.lineTotal, 0) ?? 0
    const hasOthers = othersGroup !== undefined
    const totalTop = cursorY + 16
    document.setDrawColor(42, 58, 46)
    document.line(330, totalTop, pageRight, totalTop)
    document.setFontSize(10)
    document.setTextColor(42, 48, 43)
    const subtotal = order.subtotal ?? order.total + (order.discountAmount ?? 0)
    let summaryY = totalTop + 18
    if (!order.isCommitteeOrder) {
        document.text('General subtotal', 442, summaryY, { align: 'right' })
        document.text(`INR ${generalSubtotal.toFixed(2)}`, pageRight, summaryY, { align: 'right' })
    }
    if (!order.isCommitteeOrder && hasOthers) {
        summaryY += 18
        document.text('Others subtotal (no discount)', 442, summaryY, { align: 'right' })
        document.text(`INR ${othersSubtotal.toFixed(2)}`, pageRight, summaryY, { align: 'right' })
    }
    if (!order.isCommitteeOrder) summaryY += 18
    document.text(order.isCommitteeOrder ? 'Total price' : 'Subtotal', 442, summaryY, { align: 'right' })
    document.text(`INR ${subtotal.toFixed(2)}`, pageRight, summaryY, { align: 'right' })
    const hasBillDiscount = order.isCommitteeOrder || (order.discountAmount ?? 0) > 0
    if (hasBillDiscount) {
        summaryY += 18
        document.text(order.isCommitteeOrder ? 'Discount' : `Bill discount (${(order.discountPercent ?? 0).toFixed(2)}% of General)`, 442, summaryY, { align: 'right' })
        document.text(`- INR ${(order.discountAmount ?? 0).toFixed(2)}`, pageRight, summaryY, { align: 'right' })
    }
    const totalY = summaryY + (hasBillDiscount ? 26 : 24)
    document.text(order.isCommitteeOrder ? 'Final price' : 'Final bill', 442, totalY, { align: 'right' })
    document.setFontSize(16)
    document.text(`INR ${order.total.toFixed(2)}`, pageRight, totalY, { align: 'right' })
    document.setFontSize(9)
    document.setTextColor(91, 102, 92)
    document.text(isPaid ? 'Payment received. Thank you.' : 'Please settle the bill at the counter.', pageLeft, totalY)
    addFooter()

    return document.output('blob')
}