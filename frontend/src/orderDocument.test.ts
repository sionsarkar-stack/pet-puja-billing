import { describe, expect, it, vi } from 'vitest'

const pdf = vi.hoisted(() => {
    const document = {
        addPage: vi.fn(),
        line: vi.fn(),
        output: vi.fn(() => new Blob(['receipt'], { type: 'application/pdf' })),
        rect: vi.fn(),
        setDrawColor: vi.fn(),
        setFillColor: vi.fn(),
        setFontSize: vi.fn(),
        setTextColor: vi.fn(),
        splitTextToSize: vi.fn((value: string) => [value]),
        text: vi.fn(),
    }

    return {
        document,
        jsPDF: vi.fn(function MockJsPDF() {
            return document
        }),
    }
})

vi.mock('jspdf', () => ({ jsPDF: pdf.jsPDF }))

import { createOrderDocument } from './orderDocument'

describe('createOrderDocument', () => {
    it('prints a member bill as one item list and three price totals', () => {
        pdf.document.text.mockClear()
        createOrderDocument({
            documentTitle: 'PAYMENT RECEIPT', issuedAt: new Date('2026-10-16T10:00:00Z'),
            lines: [{ itemName: 'Meal', section: 'Quick Bites', quantity: 1, unitPrice: 200, lineTotal: 200 },
            { itemName: 'Extra item', section: 'Other', quantity: 1, unitPrice: 100, lineTotal: 100 }],
            isCommitteeOrder: true, paymentMethod: 'CASH', paymentStatus: 'PAID', reference: 'PP-MEMBER',
            restaurantName: 'Pet Puja', seatingName: 'Rimo', subtotal: 300, discountPercent: 25, discountAmount: 75, total: 225,
        })
        const text = pdf.document.text.mock.calls.flat().join(' ')
        expect(text).not.toMatch(/GENERAL|OTHERS|General subtotal|Others subtotal/)
        expect(text).toContain('Total price')
        expect(text).toContain('Discount')
        expect(text).toContain('Final price')
        expect(text).toContain('INR 75.00')
        expect(text).toContain('INR 225.00')
    })

    it('uses a custom table name on the receipt and falls back when the name is blank', () => {
        const order = {
            documentTitle: 'PAYMENT RECEIPT' as const, issuedAt: new Date('2026-10-15T10:00:00Z'),
            lines: [{ itemName: 'Tea', lineTotal: 30, quantity: 1, unitPrice: 30 }], paymentMethod: 'CASH' as const,
            paymentStatus: 'PAID' as const, reference: 'PP-FAMILY', restaurantName: 'Pet Puja', seatingName: 'Table 1', total: 30
        }
        createOrderDocument({ ...order, tableLabel: 'Family' })
        expect(pdf.document.splitTextToSize).toHaveBeenCalledWith('Seating: Family', 230)
        createOrderDocument({ ...order, tableLabel: '   ' })
        expect(pdf.document.splitTextToSize).toHaveBeenCalledWith('Seating: Table 1', 230)
    })

    it('includes both split allocations below the payment method on a receipt', () => {
        createOrderDocument({
            documentTitle: 'PAYMENT RECEIPT', issuedAt: new Date('2026-10-15T10:00:00Z'),
            lines: [{ itemName: 'Meal', lineTotal: 302, quantity: 1, unitPrice: 302 }],
            paymentMethod: 'SPLIT', cashAmount: 102, onlineAmount: 200,
            paymentStatus: 'PAID', reference: 'PP-SPLIT', restaurantName: 'Pet Puja', seatingName: 'Table 1', total: 302,
        })
        const text = pdf.document.text.mock.calls.flat().join(' ')
        expect(text).toContain('Payment method: Split')
        expect(text).toContain('Cash: INR 102.00 | Online: INR 200.00')
        expect(pdf.document.line).toHaveBeenCalledWith(48, 224, 548, 224)
    })

    it('renders final payment information in a formal receipt', () => {
        createOrderDocument({
            documentTitle: 'PAYMENT RECEIPT',
            issuedAt: new Date('2026-09-16T12:00:00Z'),
            lines: [{ itemName: 'Paneer Tikka', lineTotal: 400, quantity: 2, section: 'Mains', unitPrice: 200 }],
            paymentMethod: 'CASH',
            paymentStatus: 'PAID',
            reference: 'PP-123',
            restaurantName: 'The Third Break',
            seatingName: 'Table 3',
            orderDescription: 'No onions, extra crisp',
            customerName: 'Aarav Mehta',
            subtotal: 500,
            discountPercent: 20,
            discountAmount: 100,
            total: 400,
        })

        const receiptText = pdf.document.text.mock.calls.flat().join(' ')
        expect(receiptText).toContain('PAYMENT RECEIPT')
        expect(receiptText).toContain('PAID')
        expect(receiptText).toContain('Receipt no. PP-123')
        expect(receiptText).toContain('Ordering name: Aarav Mehta')
        expect(receiptText).toContain('Description: No onions, extra crisp')
        expect(receiptText).toContain('Payment method: Cash')
        expect(receiptText).toContain('Payment received. Thank you.')
        expect(receiptText).toContain('THE THIRD BREAK')
        expect(receiptText).toContain('Thank you for dining with The Third Break.')
        expect(receiptText).toContain('Subtotal')
        expect(receiptText).toContain('GENERAL')
        expect(receiptText).toContain('Bill discount (20.00% of General)')
        expect(receiptText).toContain('- INR 100.00')
        expect(receiptText).toContain('Final bill')
        expect(receiptText).toContain('INR 400.00')
    })

    it('separates General and Others invoice lines and discounts General only', () => {
        createOrderDocument({
            documentTitle: 'INVOICE',
            issuedAt: new Date('2026-10-14T12:00:00Z'),
            lines: [
                { itemName: 'Main dish', lineTotal: 300, quantity: 1, section: 'Mains', unitPrice: 300 },
                { itemName: 'Water', lineTotal: 100, quantity: 1, section: 'Others', unitPrice: 100 },
            ],
            paymentMethod: 'CASH',
            paymentStatus: 'PAID',
            reference: 'PP-MIXED',
            restaurantName: 'The Third Break',
            seatingName: 'Table 3',
            subtotal: 400,
            discountPercent: 20,
            discountAmount: 60,
            total: 340,
        })

        const invoiceText = pdf.document.text.mock.calls.flat().join(' ')
        expect(invoiceText).toContain('GENERAL')
        expect(invoiceText).toContain('Ordering name: NA')
        expect(invoiceText).toContain('OTHERS (NO BILL DISCOUNT)')
        expect(invoiceText).toContain('General subtotal')
        expect(invoiceText).toContain('Others subtotal (no discount)')
        expect(invoiceText).toContain('Bill discount (20.00% of General)')
        expect(invoiceText).toContain('INR 340.00')
    })
})