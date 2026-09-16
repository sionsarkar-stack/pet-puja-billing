import { jsPDF } from 'jspdf'
import { getPaymentMethodLabel, type PaymentMethod } from './financial'

export type OrderDocument = {
    documentTitle: 'INVOICE' | 'PAYMENT RECEIPT'
    issuedAt: Date
    lines: OrderDocumentLine[]
    paymentMethod: PaymentMethod | null
    paymentStatus: 'PAID' | 'PENDING'
    reference: string
    seatingName: string
    total: number
}

export type OrderDocumentLine = {
    itemName: string
    lineTotal: number
    quantity: number
    unitPrice: number
}

export function createOrderDocument(order: OrderDocument) {
    const document = new jsPDF({ format: 'a4', unit: 'pt' })
    const pageLeft = 48
    const pageRight = 548
    const footerY = 782
    const isPaid = order.paymentStatus === 'PAID'
    const referenceLabel = order.documentTitle === 'PAYMENT RECEIPT' ? 'Receipt no.' : 'Invoice no.'

    function addFooter() {
        document.setDrawColor(205, 210, 204)
        document.line(pageLeft, footerY - 12, pageRight, footerY - 12)
        document.setFontSize(8)
        document.setTextColor(91, 102, 92)
        document.text('Thank you for dining with Pet Puja.', pageLeft, footerY)
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
    document.text('PET PUJA', 64, 80)
    document.setFontSize(9)
    document.text('RESTAURANT BILLING', 64, 98)
    document.setFontSize(18)
    document.text(order.documentTitle, 532, 80, { align: 'right' })
    document.setFontSize(9)
    document.text(isPaid ? 'PAID' : 'PAYMENT PENDING', 532, 98, { align: 'right' })

    document.setTextColor(42, 48, 43)
    document.setFontSize(10)
    document.text(`${referenceLabel} ${order.reference}`, pageLeft, 152)
    document.text(`Issued: ${order.issuedAt.toLocaleString('en-IN')}`, pageLeft, 170)
    document.text(`Seating: ${order.seatingName}`, pageRight, 152, { align: 'right' })
    document.text(`Payment status: ${isPaid ? 'Paid' : 'Pending'}`, pageRight, 170, { align: 'right' })

    const metadataBottom = order.paymentMethod === null ? 188 : 206
    if (order.paymentMethod !== null) {
        document.text(`Payment method: ${getPaymentMethodLabel(order.paymentMethod)}`, pageRight, 188, { align: 'right' })
    }
    document.setDrawColor(205, 210, 204)
    document.line(pageLeft, metadataBottom, pageRight, metadataBottom)

    let cursorY = metadataBottom + 22
    addTableHeader(cursorY)
    cursorY += 26

    for (const [index, orderLine] of order.lines.entries()) {
        const itemLines = document.splitTextToSize(orderLine.itemName, 244)
        const rowHeight = Math.max(32, itemLines.length * 12 + 16)

        if (cursorY + rowHeight > 700) {
            addFooter()
            document.addPage()
            document.setFontSize(10)
            document.setTextColor(42, 48, 43)
            document.text(`PET PUJA | ${order.documentTitle} CONTINUED`, pageLeft, 56)
            document.text(order.reference, pageRight, 56, { align: 'right' })
            cursorY = 76
            addTableHeader(cursorY)
            cursorY += 26
        }

        document.setFontSize(10)
        document.setTextColor(42, 48, 43)
        document.text(String(index + 1), 58, cursorY + 18)
        document.text(itemLines, 88, cursorY + 18)
        document.text(String(orderLine.quantity), 368, cursorY + 18, { align: 'right' })
        document.text(`INR ${orderLine.unitPrice.toFixed(2)}`, 442, cursorY + 18, { align: 'right' })
        document.text(`INR ${orderLine.lineTotal.toFixed(2)}`, 538, cursorY + 18, { align: 'right' })
        document.setDrawColor(225, 228, 224)
        document.line(pageLeft, cursorY + rowHeight, pageRight, cursorY + rowHeight)
        cursorY += rowHeight
    }

    if (cursorY > 652) {
        addFooter()
        document.addPage()
        document.setFontSize(10)
        document.setTextColor(42, 48, 43)
        document.text(`PET PUJA | ${order.documentTitle} SUMMARY`, pageLeft, 56)
        document.text(order.reference, pageRight, 56, { align: 'right' })
        cursorY = 82
    }

    const totalTop = cursorY + 16
    document.setDrawColor(42, 58, 46)
    document.line(330, totalTop, pageRight, totalTop)
    document.setFontSize(10)
    document.setTextColor(42, 48, 43)
    document.text('Order total', 442, totalTop + 24, { align: 'right' })
    document.setFontSize(16)
    document.text(`INR ${order.total.toFixed(2)}`, pageRight, totalTop + 24, { align: 'right' })
    document.setFontSize(9)
    document.setTextColor(91, 102, 92)
    document.text(isPaid ? 'Payment received. Thank you.' : 'Please settle the bill at the counter.', pageLeft, totalTop + 24)
    addFooter()

    return document.output('blob')
}