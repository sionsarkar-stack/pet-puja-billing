import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RestaurantConfigurationContext } from './RestaurantConfiguration'
import TableManager from './TableManager'
import { createUpiPaymentUri } from './upiPayment'

const pdf = vi.hoisted(() => {
    const document = {
        addPage: vi.fn(),
        line: vi.fn(),
        output: vi.fn(() => new Blob(['invoice'], { type: 'application/pdf' })),
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

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status,
    })
}

describe('TableManager', () => {
    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('creates a UPI payment URI with the exact amount and seating reference', () => {
        const paymentUri = new URL(createUpiPaymentUri(302, 'Table 4', 'The Third Break', 'sionsarkar@okicici'))

        expect(paymentUri.protocol).toBe('upi:')
        expect(paymentUri.hostname).toBe('pay')
        expect(paymentUri.searchParams.get('pa')).toBe('sionsarkar@okicici')
        expect(paymentUri.searchParams.get('am')).toBe('302.00')
        expect(paymentUri.searchParams.get('cu')).toBe('INR')
        expect(paymentUri.searchParams.get('pn')).toBe('The Third Break')
        expect(paymentUri.searchParams.get('tn')).toBe('The Third Break - Table 4')
    })

    it('shows a UPI QR for the completed order without recording payment', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([{
                completed: true,
                lines: [{ itemName: 'Paneer Tikka', lineTotal: 302, menuItemId: 1, quantity: 1, unitPrice: 302 }],
                tableName: 'Table 1',
                total: 302,
            }]))
        const user = userEvent.setup()

        render(
            <RestaurantConfigurationContext.Provider value={{ restaurantName: 'The Third Break', upiVpa: 'sionsarkar@okicici' }}>
                <TableManager />
            </RestaurantConfigurationContext.Provider>,
        )

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.click(screen.getByRole('button', { name: 'Show UPI QR' }))

        expect(screen.getByTitle('UPI payment QR')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Scan to pay ₹302.00' })).toBeInTheDocument()
        expect(screen.getByText(/Pay to sionsarkar@okicici/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Paid online' })).toBeInTheDocument()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('adds discounted menu items to the selected table and totals their price', async () => {
        const menuItem = {
            description: 'Potato patty with chutney',
            discountApplied: 10,
            id: 1,
            name: 'Aloo Tikki',
            price: 100,
        }
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                lines: [{ itemName: 'Aloo Tikki', lineTotal: 270, menuItemId: 1, quantity: 3, unitPrice: 90 }],
                tableName: 'Table 2',
                total: 270,
            }))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                lines: [{ itemName: 'Aloo Tikki', lineTotal: 90, menuItemId: 1, quantity: 1, unitPrice: 90 }],
                tableName: 'Outdoor 1',
                total: 90,
            }))
        const user = userEvent.setup()

        render(<TableManager />)

        expect(await screen.findByRole('button', { name: 'Table 7' })).toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: /^Table [1-7]$/ })).toHaveLength(7)
        expect(screen.getAllByRole('button', { name: /^Outdoor (?:[1-9]|10)$/ })).toHaveLength(10)
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/menu',
            expect.objectContaining({ credentials: 'include' }),
        )
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/open-orders',
            expect.objectContaining({ credentials: 'include' }),
        )
        const tableOneButton = screen.getByRole('button', { name: 'Table 1' })
        const tableTwoButton = screen.getByRole('button', { name: 'Table 2' })
        expect(within(tableOneButton).getByText('Available')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Add table' }))
        await user.click(screen.getByRole('button', { name: 'Add outdoor table' }))
        expect(screen.getByRole('button', { name: 'Table 8' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Outdoor 11' })).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Table 2' }))
        await user.selectOptions(screen.getByLabelText('Menu item'), '1')
        await user.clear(screen.getByLabelText('Quantity'))
        await user.type(screen.getByLabelText('Quantity'), '3')

        expect(screen.getByText('₹270.00')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Add to Table 2' }))

        const orderTable = await screen.findByRole('table', { name: 'Order for Table 2' })
        expect(within(orderTable).getByText('Aloo Tikki')).toBeInTheDocument()
        expect(within(orderTable).getByText('3')).toBeInTheDocument()
        expect(within(orderTable).getByText('₹90.00')).toBeInTheDocument()
        expect(within(orderTable).getAllByText('₹270.00')).toHaveLength(3)
        expect(within(tableTwoButton).getByText('Open')).toBeInTheDocument()
        expect(within(tableTwoButton).getByText('3 items · ₹270.00')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Table 1' }))
        expect(screen.getByText('No items selected for Table 1.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Outdoor 1' }))
        expect(screen.getByText('No items selected for Outdoor 1.')).toBeInTheDocument()
        await user.selectOptions(screen.getByLabelText('Menu item'), '1')
        await user.click(screen.getByRole('button', { name: 'Add to Outdoor 1' }))
        expect(within(await screen.findByRole('table', { name: 'Order for Outdoor 1' })).getByText('Aloo Tikki')).toBeInTheDocument()
    })

    it('shows add-ons only for the selected item and saves their price with the order', async () => {
        const menuItems = [
            {
                id: 1,
                name: 'Veg Sandwich',
                description: 'Vegetable sandwich',
                section: 'Continental',
                subsection: 'Sandwiches',
                discountApplied: 0,
                price: 65,
                addOns: [],
            },
            {
                id: 2,
                name: 'Chicken Sandwich',
                description: 'Chicken sandwich',
                section: 'Continental',
                subsection: 'Sandwiches',
                discountApplied: 0,
                price: 90,
                addOns: [{ id: 12, name: 'Extra cheese', price: 20 }],
            },
        ]
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse(menuItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                lines: [{
                    addOns: [{ id: 12, name: 'Extra cheese', price: 20 }],
                    itemName: 'Chicken Sandwich',
                    lineTotal: 110,
                    menuItemId: 2,
                    quantity: 1,
                    unitPrice: 110,
                }],
                tableName: 'Table 1',
                total: 110,
            }))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        const menuSelect = screen.getByLabelText('Menu item')
        expect(within(screen.getByRole('group', { name: 'Continental / Sandwiches' })).getByRole('option', { name: 'Veg Sandwich - ₹65.00' })).toBeInTheDocument()
        await user.selectOptions(menuSelect, '1')
        expect(screen.queryByRole('group', { name: 'Add-ons for Veg Sandwich' })).not.toBeInTheDocument()

        await user.selectOptions(menuSelect, '2')
        await user.click(screen.getByRole('checkbox', { name: 'Add Extra cheese' }))
        expect(screen.getByText('Line price:')).toBeInTheDocument()
        expect(screen.getByText('₹110.00')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Add to Table 1' }))

        const orderTable = await screen.findByRole('table', { name: 'Order for Table 1' })
        expect(within(orderTable).getByText('Chicken Sandwich + Extra cheese')).toBeInTheDocument()
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            '/api/open-orders',
            expect.objectContaining({
                body: JSON.stringify({
                    completed: false,
                    lines: [{ menuItemId: 2, quantity: 1, addOnIds: [12] }],
                    tableName: 'Table 1',
                }),
                method: 'PUT',
            }),
        )
    })

    it('restores a completed unpaid order and opens it for more items', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([
                {
                    description: 'Potato patty with chutney',
                    discountApplied: 10,
                    id: 1,
                    name: 'Aloo Tikki',
                    price: 100,
                },
            ]))
            .mockResolvedValueOnce(jsonResponse([{
                completed: true,
                lines: [{ itemName: 'Aloo Tikki', lineTotal: 270, menuItemId: 1, quantity: 3, unitPrice: 90 }],
                tableName: 'Outdoor 11',
                total: 270,
            }]))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                lines: [{ itemName: 'Aloo Tikki', lineTotal: 270, menuItemId: 1, quantity: 3, unitPrice: 90 }],
                tableName: 'Outdoor 11',
                total: 270,
            }))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Outdoor 11' }))

        const orderTable = screen.getByRole('table', { name: 'Order for Outdoor 11' })
        expect(within(orderTable).getByText('Aloo Tikki')).toBeInTheDocument()
        expect(within(orderTable).getByText('3')).toBeInTheDocument()
        expect(within(orderTable).getAllByText('₹270.00')).toHaveLength(3)
        expect(screen.getByText('Final price')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Create invoice' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Open table' }))
        expect(await screen.findByRole('button', { name: 'Add to Outdoor 11' })).toBeInTheDocument()
        expect(fetchMock).toHaveBeenCalledWith(
            '/api/open-orders',
            expect.objectContaining({ credentials: 'include' }),
        )
    })

    it('keeps the menu available when current open orders cannot be restored', async () => {
        const menuItem = {
            description: 'Freshly grilled paneer',
            discountApplied: 0,
            id: 1,
            name: 'Paneer Tikka',
            price: 200,
        }
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(new Response(null, { status: 409 }))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))

        expect(await screen.findByLabelText('Menu item')).toBeInTheDocument()
        expect(screen.getByRole('option', { name: 'Paneer Tikka - ₹200.00' })).toBeInTheDocument()
    })

    it('refreshes menu items when the Table tab becomes active again', async () => {
        const menuItem = {
            description: 'Freshly grilled paneer',
            discountApplied: 0,
            id: 1,
            name: 'Paneer Tikka',
            price: 200,
        }
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([]))
        const user = userEvent.setup()
        const view = render(<TableManager isActive={false} />)

        view.rerender(<TableManager isActive />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        expect(screen.getByText('No menu items are available yet.')).toBeInTheDocument()

        fetchMock
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([]))
        view.rerender(<TableManager isActive={false} />)
        view.rerender(<TableManager isActive />)

        expect(await screen.findByRole('option', { name: 'Paneer Tikka - ₹200.00' })).toBeInTheDocument()
    })

    it('creates a formal pending invoice for a completed unpaid order', async () => {
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:formal-invoice'),
            revokeObjectURL: vi.fn(),
        })
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([
                {
                    description: 'Freshly grilled paneer with a rich tomato sauce',
                    discountApplied: 0,
                    id: 1,
                    name: 'Paneer Tikka Masala',
                    price: 270,
                },
            ]))
            .mockResolvedValueOnce(jsonResponse([{
                completed: true,
                lines: [{ itemName: 'Paneer Tikka Masala', lineTotal: 270, menuItemId: 1, quantity: 1, unitPrice: 270 }],
                subtotal: 300,
                discountPercent: 10,
                discountAmount: 30,
                tableName: 'Table 2',
                total: 270,
            }]))
        const user = userEvent.setup()

        render(
            <RestaurantConfigurationContext.Provider value={{ restaurantName: 'The Third Break', upiVpa: '' }}>
                <TableManager />
            </RestaurantConfigurationContext.Provider>,
        )

        await user.click(await screen.findByRole('button', { name: 'Table 2' }))
        await user.click(screen.getByRole('button', { name: 'Create invoice' }))

        const invoiceText = pdf.document.text.mock.calls.flat().join(' ')
        expect(invoiceText).toContain('THE THIRD BREAK')
        expect(invoiceText).toContain('INVOICE')
        expect(invoiceText).toContain('Invoice no.')
        expect(invoiceText).toContain('Seating: Table 2')
        expect(invoiceText).toContain('Payment status: Pending')
        expect(invoiceText).toContain('Subtotal')
        expect(invoiceText).toContain('Bill discount (10.00%)')
        expect(invoiceText).toContain('- INR 30.00')
        expect(invoiceText).toContain('Final bill')
        expect(invoiceText).toContain('INR 270.00')
        expect(screen.getByTitle('Invoice preview')).toHaveAttribute('src', 'blob:formal-invoice')
        expect(screen.getByRole('link', { name: 'Download invoice' })).toHaveAttribute('download', 'table-2-invoice.pdf')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('retains a failed order change and retries it on request', async () => {
        const menuItem = {
            description: 'Crisp potato patty',
            discountApplied: 0,
            id: 1,
            name: 'Aloo Tikki',
            price: 100,
        }
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(new Response(null, { status: 500 }))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                lines: [{ itemName: 'Aloo Tikki', lineTotal: 100, menuItemId: 1, quantity: 1, unitPrice: 100 }],
                tableName: 'Table 1',
                total: 100,
            }))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.selectOptions(screen.getByLabelText('Menu item'), '1')
        await user.click(screen.getByRole('button', { name: 'Add to Table 1' }))

        expect(await screen.findByText('We could not save this order. Your last confirmed order is unchanged.')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Retry save' })).toBeInTheDocument()
        expect(screen.queryByRole('table', { name: 'Order for Table 1' })).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Retry save' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            '/api/open-orders',
            expect.objectContaining({
                body: JSON.stringify({
                    completed: false,
                    lines: [{ menuItemId: 1, quantity: 1, addOnIds: [] }],
                    tableName: 'Table 1',
                }),
                method: 'PUT',
            }),
        )
        expect(await screen.findByRole('table', { name: 'Order for Table 1' })).toBeInTheDocument()
        expect(screen.getByText(/Last saved at/)).toBeInTheDocument()
    })

    it('records a cash payment and clears only the settled seating order', async () => {
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:paid-receipt'),
            revokeObjectURL: vi.fn(),
        })
        const menuItem = {
            description: 'Char-grilled paneer',
            discountApplied: 0,
            id: 1,
            name: 'Paneer Tikka',
            price: 200,
        }
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                lines: [{ itemName: 'Paneer Tikka', lineTotal: 400, menuItemId: 1, quantity: 2, unitPrice: 200 }],
                tableName: 'Outdoor 3',
                total: 400,
            }))
            .mockResolvedValueOnce(jsonResponse({
                completed: true,
                lines: [{ itemName: 'Paneer Tikka', lineTotal: 400, menuItemId: 1, quantity: 2, unitPrice: 200 }],
                tableName: 'Outdoor 3',
                total: 400,
            }))
            .mockResolvedValueOnce(jsonResponse({
                billNumber: 'PP-123',
                id: 10,
                lines: [{ itemName: 'Paneer Tikka', lineTotal: 400, quantity: 2, unitPrice: 200 }],
                paidAt: '2026-09-15T12:00:00Z',
                paymentMethod: 'CASH',
                refund: null,
                tableName: 'Outdoor 3',
                total: 400,
            }, 201))
        const user = userEvent.setup()

        render(<TableManager />)

        await screen.findByRole('button', { name: 'Outdoor 3' })
        await user.click(screen.getByRole('button', { name: 'Outdoor 3' }))
        await user.selectOptions(screen.getByLabelText('Menu item'), '1')
        await user.clear(screen.getByLabelText('Quantity'))
        await user.type(screen.getByLabelText('Quantity'), '2')
        await user.click(screen.getByRole('button', { name: 'Add to Outdoor 3' }))

        await user.click(await screen.findByRole('button', { name: 'Complete order' }))
        expect(screen.queryByRole('button', { name: 'Add to Outdoor 3' })).not.toBeInTheDocument()
        expect(await screen.findByRole('button', { name: 'Paid online' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Paid by cash' }))
        expect(fetchMock).toHaveBeenCalledTimes(4)
        expect(screen.getByRole('alertdialog', { name: 'Confirm payment' })).toHaveTextContent('₹400.00')
        await user.click(screen.getByRole('button', { name: 'Confirm cash payment' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            5,
            '/api/payments',
            expect.objectContaining({
                body: JSON.stringify({
                    paymentMethod: 'CASH',
                    tableName: 'Outdoor 3',
                }),
                credentials: 'include',
                method: 'POST',
            }),
        )
        expect(await screen.findByText('Outdoor 3 paid by cash: ₹400.00.')).toBeInTheDocument()
        expect(screen.getByText('No items selected for Outdoor 3.')).toBeInTheDocument()
        expect(screen.getByRole('heading', { name: 'Receipt PP-123' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Create paid receipt' }))
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('PAYMENT RECEIPT')
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('Receipt no. PP-123')
        expect(pdf.document.text.mock.calls.flat().join(' ')).toContain('Payment method: Cash')
        const paidReceiptFrame = screen.getByTitle('Paid receipt preview')
        expect(paidReceiptFrame).toHaveAttribute('src', 'blob:paid-receipt')
        expect(screen.getByRole('link', { name: 'Download receipt' })).toHaveAttribute('download', 'pp-123-receipt.pdf')
        expect(screen.getByRole('button', { name: 'Print receipt' })).toBeDisabled()
        fireEvent.load(paidReceiptFrame)
        expect(screen.getByRole('button', { name: 'Print receipt' })).toBeEnabled()
        await user.click(screen.getByRole('button', { name: 'Restart table' }))
        expect(screen.queryByRole('heading', { name: /^Outdoor 3$/ })).not.toBeInTheDocument()
    })
})