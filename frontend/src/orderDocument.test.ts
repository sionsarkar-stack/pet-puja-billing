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
    it('renders final payment information in a formal receipt', () => {
        createOrderDocument({
            documentTitle: 'PAYMENT RECEIPT',
            issuedAt: new Date('2026-09-16T12:00:00Z'),
            lines: [{ itemName: 'Paneer Tikka', lineTotal: 400, quantity: 2, unitPrice: 200 }],
            paymentMethod: 'CASH',
            paymentStatus: 'PAID',
            reference: 'PP-123',
            restaurantName: 'The Third Break',
            seatingName: 'Table 3',
            total: 400,
        })

        const receiptText = pdf.document.text.mock.calls.flat().join(' ')
        expect(receiptText).toContain('PAYMENT RECEIPT')
        expect(receiptText).toContain('PAID')
        expect(receiptText).toContain('Receipt no. PP-123')
        expect(receiptText).toContain('Payment method: Cash')
        expect(receiptText).toContain('Payment received. Thank you.')
        expect(receiptText).toContain('THE THIRD BREAK')
        expect(receiptText).toContain('Thank you for dining with The Third Break.')
        expect(receiptText).toContain('INR 400.00')
    })
})