import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RestaurantConfigurationContext } from './RestaurantConfiguration'
import TableManager from './TableManager'
import { createUpiPaymentUri } from './upiPayment'
import { isPaidOrder, parsePaymentAmountInPaise } from './financial'

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

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

vi.mock('qrcode.react', () => ({
    QRCodeSVG: ({ title, value }: { title: string; value: string }) => <svg><title>{title}</title><desc>{value}</desc></svg>,
}))

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status,
    })
}

const defaultCommitteeMembers = ['Rimo', 'Rjoe', 'Rishi', 'Dinda'].map((name, index) => ({
    id: index + 1, name, protectedMember: name === 'Dinda', fixedDiscountPercent: name === 'Dinda' ? 20 : null,
}))

function mockOrderFetch() {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', (...args: Parameters<typeof fetch>) => {
        if (args[0] === '/api/committee-members' && (args[1]?.method ?? 'GET') === 'GET') {
            return Promise.resolve(jsonResponse(defaultCommitteeMembers))
        }
        return fetchMock(...args)
    })
    return fetchMock
}

async function selectMenuItem(user: ReturnType<typeof userEvent.setup>, menuItemId: string) {
    const picker = screen.getByRole('combobox', { name: 'Menu item' })
    await user.click(picker)
    await user.clear(picker)
    const row = document.getElementById(`table-menu-option-${menuItemId}`)
    expect(row).not.toBeNull()
    const checkbox = within(row!).getByRole('checkbox', { name: /^Select / })
    if (!(checkbox as HTMLInputElement).checked) await user.click(checkbox)
}

async function setSelectedQuantity(user: ReturnType<typeof userEvent.setup>, quantity: number) {
    const picker = screen.getByRole('dialog', { name: 'Menu items' })
    const control = within(picker).getAllByRole('group', { name: /^Quantity for / })[0]
    const current = Number(within(control).getByRole('status').textContent)
    for (let change = current; change < quantity; change += 1) {
        await user.click(within(control).getByRole('button', { name: /^Increase selected / }))
    }
    for (let change = current; change > quantity; change -= 1) {
        await user.click(within(control).getByRole('button', { name: /^Decrease selected / }))
    }
}

describe('TableManager', () => {
    it('toggles member billing open and closed while preserving the saved order', async () => {
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Tea', description: null, discountApplied: 0, price: 30 }]))
            .mockResolvedValueOnce(jsonResponse([{
                tableName: 'Committee Rimo', committeeDiscountPercent: 10,
                completed: false, total: 27, lines: [{ menuItemId: 1, itemName: 'Tea', quantity: 1, unitPrice: 30, lineTotal: 30 }]
            }]))
        const user = userEvent.setup()
        render(<TableManager />)
        const row = await screen.findByRole('row', { name: /^Rimo / })
        await user.click(within(row).getByRole('rowheader', { name: 'Rimo' }))
        expect(row).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('table', { name: 'Order for Rimo' })).toHaveTextContent('Tea')
        await user.click(screen.getByLabelText('Discount for Rimo (%)'))
        expect(row).toHaveAttribute('aria-expanded', 'true')
        await user.click(within(row).getByRole('rowheader', { name: 'Rimo' }))
        expect(row).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('table', { name: 'Order for Rimo' })).not.toBeInTheDocument()
        row.focus()
        await user.keyboard('{Enter}')
        expect(row).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('table', { name: 'Order for Rimo' })).toHaveTextContent('Tea')
        row.focus()
        await user.keyboard(' ')
        expect(row).toHaveAttribute('aria-expanded', 'false')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('shows member items together with only total price discount and final price', async () => {
        mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([{
                tableName: 'Committee Rimo', committeeDiscountPercent: 25, completed: false,
                subtotal: 300, discountPercent: 25, discountAmount: 75, total: 225,
                lines: [{ menuItemId: 1, itemName: 'Meal', section: 'Quick Bites', quantity: 1, unitPrice: 200, lineTotal: 200 },
                { menuItemId: 2, itemName: 'Extra item', section: 'Other', quantity: 1, unitPrice: 100, lineTotal: 100 }]
            }]))
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('row', { name: /^Rimo / }))
        const order = screen.getByRole('table', { name: 'Order for Rimo' })
        expect(within(order).getByText('Meal')).toBeInTheDocument()
        expect(within(order).getByText('Extra item')).toBeInTheDocument()
        expect(within(order).queryByText(/General|Others/i)).not.toBeInTheDocument()
        for (const [label, amount] of [['Total price', '₹300.00'], ['Discount', '-₹75.00'], ['Final price', '₹225.00']]) {
            expect(within(order).getByRole('rowheader', { name: label }).parentElement).toHaveTextContent(amount)
        }
    })

    it('locks menu controls while an immediate checkbox save is in flight', async () => {
        let finishSave: (response: Response) => void = () => { throw new Error('Save not started') }
        const pending = new Promise<Response>((resolve) => { finishSave = resolve })
        mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Tea', description: null, discountApplied: 0, price: 30 }]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockReturnValueOnce(pending)
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.click(screen.getByRole('combobox', { name: 'Menu item' }))
        const checkbox = screen.getByRole('checkbox', { name: 'Select Tea' })
        await user.click(checkbox)
        expect(screen.getByText('Saving order...')).toBeInTheDocument()
        expect(checkbox).toBeDisabled()
        expect(screen.getByRole('combobox', { name: 'Menu item' })).toBeDisabled()
        finishSave(jsonResponse({
            tableName: 'Table 1', completed: false, total: 30,
            lines: [{ menuItemId: 1, itemName: 'Tea', quantity: 1, unitPrice: 30, lineTotal: 30 }]
        }))
        await screen.findByText('Tea added to Table 1.')
        expect(checkbox).toBeChecked()
        expect(checkbox).toBeEnabled()
    })

    it('saves checkbox selections immediately without an Add to Table button', async () => {
        const saved = (quantity: number) => ({
            tableName: 'Table 1', completed: false, total: quantity * 30,
            lines: [{ menuItemId: 1, itemName: 'Tea', quantity, unitPrice: 30, lineTotal: quantity * 30 }]
        })
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Tea', description: null, discountApplied: 0, price: 30 }]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(saved(1)))
            .mockResolvedValueOnce(jsonResponse(saved(2)))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.click(screen.getByRole('combobox', { name: 'Menu item' }))
        const checkbox = screen.getByRole('checkbox', { name: 'Select Tea' })
        expect(screen.queryByRole('button', { name: 'Add to Table 1' })).not.toBeInTheDocument()
        await user.click(checkbox)
        await screen.findByText('Tea added to Table 1.')
        expect(screen.getByRole('table', { name: 'Order for Table 1' })).toHaveTextContent('Tea')
        expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string).lines).toEqual([{ menuItemId: 1, quantity: 1, addOnIds: [] }])
        await user.click(screen.getByRole('button', { name: 'Increase selected Tea quantity' }))
        await screen.findByText('Tea quantity updated to 2.')
        expect(JSON.parse(fetchMock.mock.calls[3][1]?.body as string).lines).toEqual([{ menuItemId: 1, quantity: 2, addOnIds: [] }])
        await user.click(checkbox)
        await screen.findByText('Tea removed from Table 1.')
        expect(checkbox).not.toBeChecked()
        expect(JSON.parse(fetchMock.mock.calls[4][1]?.body as string).lines).toEqual([])
    })

    it('saves an optional order description and shows it in the current order', async () => {
        const order = {
            tableName: 'Table 1', completed: false, total: 30,
            lines: [{ menuItemId: 1, itemName: 'Tea', quantity: 1, unitPrice: 30, lineTotal: 30 }],
        }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Tea', description: null, discountApplied: 0, price: 30 }]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(order))
            .mockResolvedValueOnce(jsonResponse({ ...order, orderDescription: 'No sugar, serve hot' }))
        const user = userEvent.setup()
        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.click(screen.getByRole('combobox', { name: 'Menu item' }))
        await user.click(screen.getByRole('checkbox', { name: 'Select Tea' }))
        await screen.findByText('Tea added to Table 1.')
        await user.type(screen.getByRole('textbox', { name: 'Order description (optional)' }), 'No sugar, serve hot')
        await user.click(screen.getByRole('button', { name: 'Save description' }))

        expect(await screen.findByText('Order description saved.')).toBeInTheDocument()
        expect(screen.getByText('Description:').parentElement).toHaveTextContent('No sugar, serve hot')
        expect(JSON.parse(fetchMock.mock.calls[3][1]?.body as string)).toMatchObject({
            orderDescription: 'No sugar, serve hot',
            lines: [{ menuItemId: 1, quantity: 1, addOnIds: [] }],
        })
    })

    it('shows all members in clickable rows and only menu controls for a member order', async () => {
        mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Tea', description: null, discountApplied: 0, price: 30 }]))
            .mockResolvedValueOnce(jsonResponse([{
                tableName: 'Committee Rimo', committeeDiscountPercent: 10, completed: false, total: 27,
                lines: [{ menuItemId: 1, itemName: 'Tea', quantity: 1, unitPrice: 30, lineTotal: 30 }]
            }]))
        const user = userEvent.setup()
        render(<TableManager />)
        const members = await screen.findByRole('table', { name: 'Committee members' })
        const rimo = await within(members).findByRole('row', { name: /^Rimo / })
        expect(within(members).getAllByRole('row')).toHaveLength(5)
        expect(within(members).queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument()
        expect(rimo).not.toHaveTextContent('Open')
        expect(rimo).toHaveTextContent('₹27.00')
        expect(screen.queryByLabelText('Committee member')).not.toBeInTheDocument()
        await user.click(rimo)
        expect(rimo).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('combobox', { name: 'Menu item' })).toBeInTheDocument()
        expect(screen.queryByLabelText('Table name')).not.toBeInTheDocument()
        expect(screen.queryByRole('group', { name: 'Customer details' })).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Search by name or mobile')).not.toBeInTheDocument()
        expect(screen.getByLabelText('Discount for Dinda (%)')).toHaveValue(20)
        expect(screen.getByLabelText('Discount for Dinda (%)')).toBeDisabled()
        const rjoe = within(members).getByRole('row', { name: /^Rjoe / })
        rjoe.focus()
        await user.keyboard('{Enter}')
        expect(rjoe).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('heading', { name: 'Rjoe' })).toBeInTheDocument()
    })

    it('hides member administration for a captain but keeps Dinda at twenty percent', async () => {
        mockOrderFetch().mockResolvedValueOnce(jsonResponse([])).mockResolvedValueOnce(jsonResponse([]))
        const user = userEvent.setup()
        render(<TableManager canManageCommitteeMembers={false} />)
        await user.click(await screen.findByRole('row', { name: /^Dinda / }))
        expect(screen.getByLabelText('Discount for Dinda (%)')).toHaveValue(20)
        expect(screen.getByLabelText('Discount for Dinda (%)')).toBeDisabled()
        expect(screen.queryByRole('button', { name: /^Delete / })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Add member' })).not.toBeInTheDocument()
    })

    it('adds and deletes members while keeping Dinda locked at twenty percent', async () => {
        const alex = { id: 5, name: 'Alex', protectedMember: false, fixedDiscountPercent: null }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(alex, 201))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('row', { name: /^Dinda / }))
        expect(screen.getByLabelText('Discount for Dinda (%)')).toHaveValue(20)
        expect(screen.getByLabelText('Discount for Dinda (%)')).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Delete Dinda' })).toBeDisabled()
        await user.type(screen.getByLabelText('New committee member'), 'Alex')
        await user.click(screen.getByRole('button', { name: 'Add member' }))
        await screen.findByRole('row', { name: /^Alex / })
        expect(screen.getByRole('heading', { name: 'Alex' })).toBeInTheDocument()
        expect(screen.getByLabelText('Discount for Alex (%)')).toBeEnabled()
        await user.click(screen.getByRole('button', { name: 'Delete Alex' }))
        const dialog = screen.getByRole('alertdialog', { name: 'Delete Alex?' })
        await user.click(within(dialog).getByRole('button', { name: 'Delete member' }))
        await screen.findByText('Committee member deleted.')
        expect(screen.queryByRole('row', { name: /^Alex / })).not.toBeInTheDocument()
        expect(fetchMock).toHaveBeenLastCalledWith('/api/committee-members/5', expect.objectContaining({ method: 'DELETE' }))
    })

    it('validates payment amounts to exact paise without rounding invalid input', () => {
        expect(parsePaymentAmountInPaise('0.10')).toBe(10)
        expect(parsePaymentAmountInPaise('0.20')).toBe(20)
        for (const value of ['', '-1', '1.001', 'Infinity', 'NaN', '1e2', '10000000000']) {
            expect(parsePaymentAmountInPaise(value)).toBeNull()
        }
        const payment = {
            id: 1, billNumber: 'PP-SPLIT', tableName: 'Table 1', paymentMethod: 'SPLIT',
            paidAt: '2026-10-15T10:00:00Z', cashAmount: 0.1, onlineAmount: 0.2, total: 0.3, lines: [], refund: null
        }
        expect(isPaidOrder(payment)).toBe(true)
        expect(isPaidOrder({ ...payment, onlineAmount: 0.19 })).toBe(false)
        expect(isPaidOrder({ ...payment, cashAmount: undefined })).toBe(false)
    })

    afterEach(() => {
        cleanup()
        vi.clearAllMocks()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
        if (originalScrollIntoView === undefined) Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
        else Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
    })

    it('uses a custom table name and restores the table number when it is cleared', async () => {
        const initial = {
            tableName: 'Table 1', tableLabel: 'Friends', completed: false, total: 30,
            lines: [{ menuItemId: 1, itemName: 'Tea', quantity: 1, unitPrice: 30, lineTotal: 30 }]
        }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([initial]))
            .mockResolvedValueOnce(jsonResponse({ ...initial, tableLabel: null }))
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Friends' }))
        expect(screen.getByLabelText('Table name')).toHaveValue('Friends')
        expect(screen.getByRole('heading', { name: 'Friends' })).toBeInTheDocument()
        await user.clear(screen.getByLabelText('Table name'))
        expect(screen.getByRole('heading', { name: 'Table 1' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Save table name' }))
        await screen.findByText('Table name cleared.')
        expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string)).toMatchObject({ tableName: 'Table 1', tableLabel: '' })
        expect(screen.getByRole('button', { name: 'Table 1' })).toBeInTheDocument()
    })

    it('keeps a custom table name through save and payment but resets it for the next order', async () => {
        const order = {
            tableName: 'Table 1', tableLabel: 'Family', completed: false, total: 30,
            lines: [{ menuItemId: 1, itemName: 'Tea', quantity: 1, unitPrice: 30, lineTotal: 30 }]
        }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Tea', description: null, discountApplied: 0, price: 30 }]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(order))
            .mockResolvedValueOnce(jsonResponse({ ...order, completed: true }))
            .mockResolvedValueOnce(jsonResponse({
                id: 1, billNumber: 'PP-FAMILY', tableName: 'Table 1', tableLabel: 'Family',
                paymentMethod: 'CASH', paidAt: '2026-10-15T10:00:00Z', total: 30,
                lines: [{ itemName: 'Tea', quantity: 1, unitPrice: 30, lineTotal: 30 }], refund: null
            }, 201))
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.type(screen.getByLabelText('Table name'), '  Family  ')
        await selectMenuItem(user, '1')
        await screen.findByRole('table', { name: 'Order for Family' })
        expect(screen.getByRole('button', { name: 'Family' })).toBeInTheDocument()
        expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string)).toMatchObject({ tableName: 'Table 1', tableLabel: 'Family' })
        await user.click(screen.getByRole('button', { name: 'Complete order' }))
        await user.click(await screen.findByRole('button', { name: 'Paid by cash' }))
        await user.click(screen.getByRole('button', { name: 'Confirm cash payment' }))
        await screen.findByText('Family paid by cash: ₹30.00.')
        expect(JSON.parse(fetchMock.mock.calls[4][1]?.body as string).tableName).toBe('Table 1')
        await user.click(screen.getByRole('button', { name: 'Restart table' }))
        await user.click(screen.getByRole('button', { name: 'Table 1' }))
        expect(screen.getByLabelText('Table name')).toHaveValue('')
        expect(screen.getByRole('heading', { name: 'Table 1' })).toBeInTheDocument()
    })

    it('creates independent committee orders and applies the entered member discount', async () => {
        const order = {
            tableName: 'Committee Rimo', committeeDiscountPercent: 25, completed: false, subtotal: 200,
            discountPercent: 25, discountAmount: 50, total: 150,
            lines: [{ menuItemId: 1, itemName: 'Meal', quantity: 1, unitPrice: 200, lineTotal: 200 }]
        }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Meal', description: null, discountApplied: 0, price: 200 }]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(order))
            .mockResolvedValueOnce(jsonResponse({ ...order, committeeDiscountPercent: 50, discountPercent: 50, discountAmount: 100, total: 100 }))
        const user = userEvent.setup()
        render(<TableManager />)
        await screen.findByRole('button', { name: 'Table 1' })
        expect(screen.getByRole('heading', { name: 'Committee' })).toBeInTheDocument()
        await user.click(screen.getByRole('row', { name: /^Rimo / }))
        expect(screen.getByRole('heading', { name: 'Rimo' })).toBeInTheDocument()
        await user.clear(screen.getByLabelText('Discount for Rimo (%)'))
        await user.type(screen.getByLabelText('Discount for Rimo (%)'), '25')
        await selectMenuItem(user, '1')
        await screen.findByRole('table', { name: 'Order for Rimo' })
        expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string)).toMatchObject({ tableName: 'Committee Rimo', committeeDiscountPercent: 25 })
        await user.click(screen.getByRole('row', { name: /^Rjoe / }))
        expect(screen.getByLabelText('Discount for Rjoe (%)')).toHaveValue(0)
        expect(screen.getByText('No items selected for Rjoe.')).toBeInTheDocument()
        await user.click(screen.getByRole('row', { name: /^Rimo / }))
        expect(screen.getByLabelText('Discount for Rimo (%)')).toHaveValue(25)
        await user.clear(screen.getByLabelText('Discount for Rimo (%)'))
        await user.type(screen.getByLabelText('Discount for Rimo (%)'), '50')
        await user.click(screen.getByRole('button', { name: 'Apply discount for Rimo' }))
        await screen.findByText('Rimo discount updated to 50%.')
        expect(JSON.parse(fetchMock.mock.calls[3][1]?.body as string).committeeDiscountPercent).toBe(50)
        await user.clear(screen.getByLabelText('Discount for Rimo (%)'))
        await user.type(screen.getByLabelText('Discount for Rimo (%)'), '101')
        expect(screen.getByRole('button', { name: 'Apply discount for Rimo' })).toBeDisabled()
        await selectMenuItem(user, '1')
        await user.click(screen.getByRole('button', { name: 'Increase selected Meal quantity' }))
        expect(await screen.findByText('Committee discount must be between 0 and 100 with at most two decimal places.')).toBeInTheDocument()
        expect(fetchMock).toHaveBeenCalledTimes(4)
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
        const fetchMock = mockOrderFetch()
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

    it('defaults to the primary UPI QR and switches to the secondary payee on request', async () => {
        mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([{
                completed: true,
                lines: [{ itemName: 'Paneer Tikka', lineTotal: 302, menuItemId: 1, quantity: 1, unitPrice: 302 }],
                tableName: 'Table 1',
                total: 302,
            }]))
        const user = userEvent.setup()

        render(<RestaurantConfigurationContext.Provider value={{
            restaurantName: 'The Third Break',
            upiVpa: 'primary@upi',
            secondaryUpiVpa: 'secondary@upi',
        }}><TableManager /></RestaurantConfigurationContext.Provider>)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.click(screen.getByRole('button', { name: 'Show UPI QR' }))

        const primaryOption = screen.getByRole('radio', { name: 'Primary' })
        const secondaryOption = screen.getByRole('radio', { name: 'Show secondary' })
        const qrValue = () => screen.getByTitle('UPI payment QR').parentElement!.querySelector('desc')!.textContent!
        expect(primaryOption).toBeChecked()
        expect(new URL(qrValue()).searchParams.get('pa')).toBe('primary@upi')

        await user.click(secondaryOption)
        expect(primaryOption).not.toBeChecked()
        expect(secondaryOption).toBeChecked()
        expect(screen.getByText('Pay to secondary@upi')).toBeInTheDocument()
        expect(new URL(qrValue()).searchParams.get('pa')).toBe('secondary@upi')

        await user.click(screen.getByRole('button', { name: 'Hide UPI QR' }))
        await user.click(screen.getByRole('button', { name: 'Show UPI QR' }))
        expect(screen.getByRole('radio', { name: 'Primary' })).toBeChecked()
        expect(new URL(qrValue()).searchParams.get('pa')).toBe('primary@upi')
    })

    it('validates split amounts and shows a QR for only the online portion before confirmation', async () => {
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([{
                tableName: 'Table 1', completed: true, total: 302,
                lines: [{ menuItemId: 1, itemName: 'Meal', quantity: 1, unitPrice: 302, lineTotal: 302 }]
            }]))
            .mockResolvedValueOnce(jsonResponse({
                id: 9, billNumber: 'PP-SPLIT', tableName: 'Table 1',
                paymentMethod: 'SPLIT', cashAmount: 102, onlineAmount: 200, paidAt: '2026-10-15T10:00:00Z', total: 302,
                lines: [{ itemName: 'Meal', quantity: 1, unitPrice: 302, lineTotal: 302 }], refund: null
            }, 201))
        const user = userEvent.setup()
        render(<RestaurantConfigurationContext.Provider value={{ restaurantName: 'Pet Puja', upiVpa: 'restaurant@upi' }}><TableManager /></RestaurantConfigurationContext.Provider>)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.click(screen.getByRole('checkbox', { name: 'Split payment' }))
        expect(screen.getByRole('button', { name: 'Record split payment' })).toBeDisabled()
        await user.type(screen.getByLabelText('Cash amount (INR)'), '100')
        await user.type(screen.getByLabelText('Online amount (INR)'), '200')
        expect(screen.getByRole('alert')).toHaveTextContent('add up to ₹302.00')
        expect(screen.queryByTitle('UPI payment QR')).not.toBeInTheDocument()
        await user.clear(screen.getByLabelText('Cash amount (INR)'))
        await user.type(screen.getByLabelText('Cash amount (INR)'), '102')
        expect(screen.getByRole('heading', { name: 'Scan to pay ₹200.00' })).toBeInTheDocument()
        const qrValue = screen.getByTitle('UPI payment QR').parentElement!.querySelector('desc')!.textContent!
        expect(new URL(qrValue).searchParams.get('am')).toBe('200.00')
        await user.clear(screen.getByLabelText('Online amount (INR)'))
        await user.type(screen.getByLabelText('Online amount (INR)'), '150')
        expect(screen.getByRole('button', { name: 'Record split payment' })).toBeDisabled()
        await user.clear(screen.getByLabelText('Cash amount (INR)'))
        await user.type(screen.getByLabelText('Cash amount (INR)'), '152')
        expect(screen.getByRole('heading', { name: 'Scan to pay ₹150.00' })).toBeInTheDocument()
        expect(new URL(screen.getByTitle('UPI payment QR').parentElement!.querySelector('desc')!.textContent!).searchParams.get('am')).toBe('150.00')
        await user.clear(screen.getByLabelText('Cash amount (INR)'))
        await user.type(screen.getByLabelText('Cash amount (INR)'), '102')
        await user.clear(screen.getByLabelText('Online amount (INR)'))
        await user.type(screen.getByLabelText('Online amount (INR)'), '200')
        await user.click(screen.getByRole('button', { name: 'Record split payment' }))
        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(screen.getByRole('alertdialog', { name: 'Confirm payment' })).toHaveTextContent('Cash: ₹102.00')
        await user.click(screen.getByRole('button', { name: 'Confirm split payment' }))
        await screen.findByText('Table 1 paid by split: ₹302.00.')
        expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string)).toEqual({ paymentMethod: 'SPLIT', tableName: 'Table 1', cashAmount: 102, onlineAmount: 200 })
    })

    it('adds discounted menu items to the selected table and totals their price', async () => {
        const menuItem = {
            description: 'Potato patty with chutney',
            discountApplied: 10,
            id: 1,
            name: 'Aloo Tikki',
            price: 100,
        }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                tableName: 'Table 2', completed: false, total: 90,
                lines: [{ menuItemId: 1, itemName: 'Aloo Tikki', quantity: 1, unitPrice: 90, lineTotal: 90 }]
            }))
            .mockResolvedValueOnce(jsonResponse({
                tableName: 'Table 2', completed: false, total: 180,
                lines: [{ menuItemId: 1, itemName: 'Aloo Tikki', quantity: 2, unitPrice: 90, lineTotal: 180 }]
            }))
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
        await selectMenuItem(user, '1')
        await setSelectedQuantity(user, 3)

        expect(screen.getByRole('table', { name: 'Order for Table 2' })).toHaveTextContent('₹270.00')


        const orderTable = await screen.findByRole('table', { name: 'Order for Table 2' })
        expect(within(orderTable).getByText('Aloo Tikki')).toBeInTheDocument()
        expect(within(orderTable).getByText('3')).toBeInTheDocument()
        expect(within(orderTable).getByText('₹90.00')).toBeInTheDocument()
        expect(within(orderTable).getAllByText('₹270.00')).toHaveLength(4)
        expect(within(tableTwoButton).getByText('Open')).toBeInTheDocument()
        expect(within(tableTwoButton).getByText('3 items · ₹270.00')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Table 1' }))
        expect(screen.getByText('No items selected for Table 1.')).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Outdoor 1' }))
        expect(screen.getByText('No items selected for Outdoor 1.')).toBeInTheDocument()
        await selectMenuItem(user, '1')
        expect(within(await screen.findByRole('table', { name: 'Order for Outdoor 1' })).getByText('Aloo Tikki')).toBeInTheDocument()
    })

    it('toggles dishes from the whole row without toggling quantity or add-on controls', async () => {
        const saved = (quantity: number, cheese = false) => ({
            tableName: 'Table 1', completed: false,
            total: quantity * (cheese ? 110 : 90), lines: [{
                menuItemId: 1, itemName: 'Sandwich', quantity,
                unitPrice: cheese ? 110 : 90, lineTotal: quantity * (cheese ? 110 : 90),
                addOns: cheese ? [{ id: 12, name: 'Extra cheese', price: 20 }] : []
            }]
        })
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([{
                id: 1, name: 'Sandwich', description: null, discountApplied: 0, price: 90,
                addOns: [{ id: 12, name: 'Extra cheese', price: 20 }],
            }]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(saved(1)))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(jsonResponse(saved(1)))
            .mockResolvedValueOnce(jsonResponse(saved(2)))
            .mockResolvedValueOnce(jsonResponse(saved(2, true)))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.click(screen.getByRole('combobox', { name: 'Menu item' }))
        const checkbox = screen.getByRole('checkbox', { name: 'Select Sandwich' })
        const row = checkbox.closest('.table-menu-check-row') as HTMLElement
        await user.click(row)
        expect(checkbox).toBeChecked()
        await user.click(within(row).getByText('Sandwich'))
        expect(checkbox).not.toBeChecked()
        await user.click(checkbox)
        expect(checkbox).toBeChecked()
        await user.click(within(row).getByRole('button', { name: 'Increase selected Sandwich quantity' }))
        expect(checkbox).toBeChecked()
        expect(within(row).getByRole('status')).toHaveTextContent('2')
        await user.click(within(row).getByRole('checkbox', { name: 'Add Extra cheese' }))
        expect(checkbox).toBeChecked()
        expect(within(row).getByRole('checkbox', { name: 'Add Extra cheese' })).toBeChecked()
        await user.click(within(row).getByRole('group', { name: 'Add-ons for Sandwich' }))
        expect(checkbox).toBeChecked()
        await user.click(row)
        expect(checkbox).not.toBeChecked()
        expect(fetchMock).toHaveBeenCalledTimes(8)
    })

    it('saves checked dishes and removes only the unchecked dish', async () => {
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([
                { id: 1, name: 'Tea', description: null, discountApplied: 0, price: 30 },
                { id: 2, name: 'Dosa', description: null, discountApplied: 0, price: 120 },
            ]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                tableName: 'Table 1', completed: false, total: 30,
                lines: [{ menuItemId: 1, itemName: 'Tea', quantity: 1, unitPrice: 30, lineTotal: 30 }]
            }))
            .mockResolvedValueOnce(jsonResponse({
                tableName: 'Table 1', completed: false, total: 60,
                lines: [{ menuItemId: 1, itemName: 'Tea', quantity: 2, unitPrice: 30, lineTotal: 60 }]
            }))
            .mockResolvedValueOnce(jsonResponse({
                tableName: 'Table 1', completed: false, total: 180,
                lines: [{ menuItemId: 1, itemName: 'Tea', quantity: 2, unitPrice: 30, lineTotal: 60 },
                { menuItemId: 2, itemName: 'Dosa', quantity: 1, unitPrice: 120, lineTotal: 120 }]
            }))
            .mockResolvedValueOnce(jsonResponse({
                tableName: 'Table 1', completed: false, total: 120,
                lines: [{ menuItemId: 2, itemName: 'Dosa', quantity: 1, unitPrice: 120, lineTotal: 120 }]
            }))
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.click(screen.getByRole('combobox', { name: 'Menu item' }))
        expect(screen.queryByRole('button', { name: 'Queue item' })).not.toBeInTheDocument()
        expect(screen.queryByRole('group', { name: 'Quantity for Tea' })).not.toBeInTheDocument()
        await user.click(screen.getByRole('checkbox', { name: 'Select Tea' }))
        expect(within(within(screen.getByRole('dialog', { name: 'Menu items' })).getByRole('group', { name: 'Quantity for Tea' })).getByText('1')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Increase selected Tea quantity' }))
        expect(within(within(screen.getByRole('dialog', { name: 'Menu items' })).getByRole('group', { name: 'Quantity for Tea' })).getByText('2')).toBeInTheDocument()
        await user.click(screen.getByRole('checkbox', { name: 'Select Dosa' }))
        await user.click(screen.getByRole('checkbox', { name: 'Select Tea' }))
        expect(screen.queryByRole('group', { name: 'Quantity for Tea' })).not.toBeInTheDocument()
        expect(screen.getByRole('checkbox', { name: 'Select Tea' })).not.toBeChecked()
        expect(fetchMock).toHaveBeenCalledTimes(6)
        await screen.findByRole('table', { name: 'Order for Table 1' })
        expect(JSON.parse(fetchMock.mock.calls[5][1]?.body as string).lines).toEqual([{ menuItemId: 2, quantity: 1, addOnIds: [] }])
    })

    it('filters the menu by keywords without submitting the order from search', async () => {
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([
                { id: 1, name: 'Aloo Tikki', description: 'Potato patty with chutney', section: 'Quick Bites', subsection: '', discountApplied: 10, price: 100 },
                { id: 2, name: 'Tea', description: 'Hot tea', section: 'Beverages', subsection: 'Hot Beverages', discountApplied: 0, price: 30 },
            ]))
            .mockResolvedValueOnce(jsonResponse([]))
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        expect(screen.queryByLabelText('Search menu')).not.toBeInTheDocument()
        expect(screen.getAllByRole('combobox', { name: 'Menu item' })).toHaveLength(1)
        await user.type(screen.getByLabelText('Menu item'), 'CHUTNEY quick')
        expect(screen.getByRole('checkbox', { name: 'Select Aloo Tikki' })).toBeInTheDocument()
        expect(screen.queryByRole('checkbox', { name: 'Select Tea' })).not.toBeInTheDocument()
        expect(fetchMock).toHaveBeenCalledTimes(2)
        await user.keyboard('{ArrowDown}')
        expect(screen.getByRole('checkbox', { name: 'Select Aloo Tikki' })).not.toBeChecked()
        expect(screen.getByRole('combobox', { name: 'Menu item' })).toHaveAttribute('aria-expanded', 'true')
        expect(fetchMock).toHaveBeenCalledTimes(2)
        await user.clear(screen.getByLabelText('Menu item'))
        await user.type(screen.getByLabelText('Menu item'), 'unavailable dish')
        expect(screen.getByText('No matching menu items.')).toBeInTheDocument()
        await user.clear(screen.getByLabelText('Menu item'))
        expect(screen.getByRole('checkbox', { name: 'Select Tea' })).toBeInTheDocument()
        await user.keyboard('{ArrowUp}{Escape}')
        expect(screen.getByRole('combobox', { name: 'Menu item' })).toHaveAttribute('aria-expanded', 'false')
        await user.click(screen.getByRole('button', { name: 'Show menu items' }))
        expect(screen.getByRole('checkbox', { name: 'Select Tea' })).not.toBeChecked()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('saves selections immediately without mixing different table orders', async () => {
        const tikki = (quantity: number) => ({ menuItemId: 1, itemName: 'Aloo Tikki', quantity, unitPrice: 90, lineTotal: quantity * 90 })
        const tea = { menuItemId: 2, itemName: 'Tea', quantity: 1, unitPrice: 30, lineTotal: 30 }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([
                { id: 1, name: 'Aloo Tikki', description: null, discountApplied: 10, price: 100 },
                { id: 2, name: 'Tea', description: null, discountApplied: 0, price: 30 },
            ]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({ tableName: 'Table 1', completed: false, total: 90, lines: [tikki(1)] }))
            .mockResolvedValueOnce(jsonResponse({ tableName: 'Table 1', completed: false, total: 180, lines: [tikki(2)] }))
            .mockResolvedValueOnce(jsonResponse({ tableName: 'Table 1', completed: false, total: 270, lines: [tikki(3)] }))
            .mockResolvedValueOnce(jsonResponse({ tableName: 'Table 2', completed: false, total: 30, lines: [tea] }))
            .mockResolvedValueOnce(jsonResponse({
                tableName: 'Table 1', completed: false, total: 300, lines: [
                    { menuItemId: 1, itemName: 'Aloo Tikki', quantity: 3, unitPrice: 90, lineTotal: 270 },
                    { menuItemId: 2, itemName: 'Tea', quantity: 1, unitPrice: 30, lineTotal: 30 },
                ]
            }))
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await selectMenuItem(user, '1')
        await setSelectedQuantity(user, 2)
        await user.click(screen.getByRole('button', { name: 'Increase selected Aloo Tikki quantity' }))
        expect(within(within(screen.getByRole('dialog', { name: 'Menu items' })).getByRole('group', { name: 'Quantity for Aloo Tikki' })).getByText('3')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Table 2' }))
        expect(screen.queryByRole('table', { name: 'Order for Table 2' })).not.toBeInTheDocument()
        await selectMenuItem(user, '2')
        await user.click(screen.getByRole('button', { name: 'Table 1' }))
        expect(screen.getByRole('table', { name: 'Order for Table 1' })).toHaveTextContent('Aloo Tikki')
        expect(screen.getByRole('table', { name: 'Order for Table 1' })).not.toHaveTextContent('Tea')
        expect(fetchMock).toHaveBeenCalledTimes(6)
        await selectMenuItem(user, '2')
        await screen.findByRole('table', { name: 'Order for Table 1' })
        expect(JSON.parse(fetchMock.mock.calls[6][1]?.body as string).lines).toEqual([
            { menuItemId: 1, quantity: 3, addOnIds: [] }, { menuItemId: 2, quantity: 1, addOnIds: [] },
        ])
        expect(screen.queryByRole('region', { name: 'Pending items for Table 1' })).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Table 2' }))
        expect(screen.getByRole('table', { name: 'Order for Table 2' })).toHaveTextContent('Tea')
    })

    it('resets add-ons and quantity when a selected dish is unchecked', async () => {
        const saved = (quantity: number, cheese = false) => ({
            tableName: 'Table 1', completed: false,
            total: quantity * (cheese ? 110 : 90), lines: [{
                menuItemId: 1, itemName: 'Sandwich', quantity,
                unitPrice: cheese ? 110 : 90, lineTotal: quantity * (cheese ? 110 : 90),
                addOns: cheese ? [{ id: 12, name: 'Extra cheese', price: 20 }] : []
            }]
        })
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([{
                id: 1, name: 'Sandwich', description: null, discountApplied: 0, price: 90,
                addOns: [{ id: 12, name: 'Extra cheese', price: 20 }],
            }]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(saved(1)))
            .mockResolvedValueOnce(jsonResponse(saved(2)))
            .mockResolvedValueOnce(jsonResponse(saved(2, true)))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(jsonResponse(saved(1)))
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await selectMenuItem(user, '1')
        await setSelectedQuantity(user, 2)
        await user.click(screen.getByRole('checkbox', { name: 'Add Extra cheese' }))
        expect(within(within(screen.getByRole('dialog', { name: 'Menu items' })).getByRole('group', { name: 'Quantity for Sandwich' })).getByText('2')).toBeInTheDocument()
        expect(screen.getByRole('table', { name: 'Order for Table 1' })).toHaveTextContent('Sandwich + Extra cheese')
        expect(screen.getByRole('table', { name: 'Order for Table 1' })).toHaveTextContent('₹220.00')
        await user.click(screen.getByRole('checkbox', { name: 'Select Sandwich' }))
        expect(screen.queryByRole('group', { name: 'Quantity for Sandwich' })).not.toBeInTheDocument()
        expect(screen.queryByRole('region', { name: 'Pending items for Table 1' })).not.toBeInTheDocument()
        await selectMenuItem(user, '1')
        expect(within(within(screen.getByRole('dialog', { name: 'Menu items' })).getByRole('group', { name: 'Quantity for Sandwich' })).getByText('1')).toBeInTheDocument()
        expect(screen.getByRole('checkbox', { name: 'Add Extra cheese' })).not.toBeChecked()
        expect(fetchMock).toHaveBeenCalledTimes(7)
    })

    it('preserves the confirmed quantity after a failed save and retries the exact change', async () => {
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Tea', description: null, discountApplied: 0, price: 30 }]))
            .mockResolvedValueOnce(jsonResponse([{
                tableName: 'Table 1', completed: false, total: 30,
                lines: [{ menuItemId: 1, itemName: 'Tea', quantity: 1, unitPrice: 30, lineTotal: 30 }]
            }]))
            .mockResolvedValueOnce(new Response(null, { status: 500 }))
            .mockResolvedValueOnce(jsonResponse({
                tableName: 'Table 1', completed: false, total: 60,
                lines: [{ menuItemId: 1, itemName: 'Tea', quantity: 2, unitPrice: 30, lineTotal: 60 }]
            }))
        const user = userEvent.setup()
        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await selectMenuItem(user, '1')
        await setSelectedQuantity(user, 2)
        expect(screen.getByRole('button', { name: 'Complete order' })).toBeDisabled()
        await screen.findByText('We could not save this order. Your last confirmed order is unchanged.')
        expect(within(within(screen.getByRole('dialog', { name: 'Menu items' })).getByRole('group', { name: 'Quantity for Tea' })).getByText('1')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Retry save' }))
        await screen.findByText('Tea quantity updated to 2.')
        expect(fetchMock.mock.calls[3][1]?.body).toBe(fetchMock.mock.calls[2][1]?.body)
        expect(JSON.parse(fetchMock.mock.calls[3][1]?.body as string).lines).toEqual([{ menuItemId: 1, quantity: 2, addOnIds: [] }])
        expect(screen.queryByRole('region', { name: 'Pending items for Table 1' })).not.toBeInTheDocument()
    })

    it('searches by mobile and fills a saved customer profile into the order', async () => {
        const menuItem = {
            addOns: [],
            description: 'Freshly grilled paneer',
            discountApplied: 0,
            id: 1,
            name: 'Paneer Tikka',
            price: 120,
        }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([{
                dateOfBirth: '1990-05-12',
                name: 'Aarav Mehta',
                phoneNumber: '+919876543210',
            }]))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                customerName: 'Aarav Mehta',
                customerPhone: '+919876543210',
                customerDateOfBirth: '1990-05-12',
                lines: [{ itemName: 'Paneer Tikka', lineTotal: 120, menuItemId: 1, quantity: 1, unitPrice: 120 }],
                tableName: 'Table 1',
                total: 120,
            }))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.type(screen.getByLabelText('Search by name or mobile'), '98765 43210')
        await user.click(screen.getByRole('button', { name: 'Search' }))
        expect(await screen.findByText(/Saved profile filled/)).toBeInTheDocument()
        const customerSummary = screen.getByRole('group', { name: 'Selected customer' })
        expect(within(customerSummary).getByText('Aarav Mehta')).toBeInTheDocument()
        expect(within(customerSummary).getByText('+919876543210')).toBeInTheDocument()
        expect(within(customerSummary).getByText('1990-05-12')).toBeInTheDocument()
        expect(screen.queryByRole('radio', { name: 'Add name' })).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Date of birth')).not.toBeInTheDocument()
        await selectMenuItem(user, '1')

        const orderTable = await screen.findByRole('table', { name: 'Order for Table 1' })
        expect(within(customerSummary).getByText('Aarav Mehta')).toBeInTheDocument()
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            '/api/customers/search?query=%2B919876543210',
            expect.objectContaining({ credentials: 'include' }),
        )
        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            '/api/open-orders',
            expect.objectContaining({
                body: JSON.stringify({
                    completed: false,
                    customerName: 'Aarav Mehta',
                    customerPhone: '+919876543210',
                    customerDateOfBirth: '1990-05-12',
                    lines: [{ menuItemId: 1, quantity: 1, addOnIds: [] }],
                    tableName: 'Table 1',
                }),
                method: 'PUT',
            }),
        )
        expect(within(orderTable).getByText('Paneer Tikka')).toBeInTheDocument()
    })

    it('lets the user choose between same-name customer matches', async () => {
        mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([
                { dateOfBirth: null, name: 'Aarav Mehta', phoneNumber: '+919876543210' },
                { dateOfBirth: '1991-06-13', name: 'Aarav Singh', phoneNumber: '+919876543211' },
            ]))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.type(screen.getByLabelText('Search by name or mobile'), 'Aarav')
        await user.click(screen.getByRole('button', { name: 'Search' }))

        const matches = await screen.findByLabelText('Matching customers')
        await user.click(within(matches).getByRole('button', { name: 'Use Aarav Singh, +919876543211' }))
        const customerSummary = screen.getByRole('group', { name: 'Selected customer' })
        expect(within(customerSummary).getByText('Aarav Singh')).toBeInTheDocument()
        expect(within(customerSummary).getByText('+919876543211')).toBeInTheDocument()
        expect(within(customerSummary).getByText('1991-06-13')).toBeInTheDocument()
    })

    it('continues an order without phone when a no-match contact is not created', async () => {
        const menuItem = {
            addOns: [],
            description: 'Freshly grilled paneer',
            discountApplied: 0,
            id: 1,
            name: 'Paneer Tikka',
            price: 120,
        }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                customerName: null,
                customerPhone: null,
                customerDateOfBirth: null,
                lines: [{ itemName: 'Paneer Tikka', lineTotal: 120, menuItemId: 1, quantity: 1, unitPrice: 120 }],
                tableName: 'Table 1',
                total: 120,
            }))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.type(screen.getByLabelText('Search by name or mobile'), '98765 43210')
        await user.click(screen.getByRole('button', { name: 'Search' }))
        expect(await screen.findByText(/No saved profile found/)).toBeInTheDocument()
        expect(screen.queryByRole('radio', { name: /^(Add|Skip) (name|phone|DOB)$/ })).not.toBeInTheDocument()
        expect(screen.queryByRole('group', { name: 'Selected customer' })).not.toBeInTheDocument()
        expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument()

        await selectMenuItem(user, '1')

        expect(await screen.findByRole('table', { name: 'Order for Table 1' })).toBeInTheDocument()
        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            '/api/open-orders',
            expect.objectContaining({
                body: JSON.stringify({
                    completed: false,
                    customerName: null,
                    customerPhone: null,
                    customerDateOfBirth: null,
                    lines: [{ menuItemId: 1, quantity: 1, addOnIds: [] }],
                    tableName: 'Table 1',
                }),
                method: 'PUT',
            }),
        )
    })

    it('prefills a name search and continues without saving a phone contact', async () => {
        const menuItem = {
            addOns: [],
            description: 'Freshly grilled paneer',
            discountApplied: 0,
            id: 1,
            name: 'Paneer Tikka',
            price: 120,
        }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                customerName: 'Mira Patel',
                customerPhone: null,
                customerDateOfBirth: null,
                lines: [{ itemName: 'Paneer Tikka', lineTotal: 120, menuItemId: 1, quantity: 1, unitPrice: 120 }],
                tableName: 'Table 1',
                total: 120,
            }))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.type(screen.getByLabelText('Search by name or mobile'), 'Mira Patel')
        await user.click(screen.getByRole('button', { name: 'Search' }))
        await user.click(await screen.findByRole('button', { name: 'Create new contact' }))

        expect(screen.getByLabelText('Name (optional)')).toHaveValue('Mira Patel')
        expect(screen.getByLabelText('Phone number (optional)')).toHaveValue('')
        await user.click(screen.getByRole('button', { name: 'Save contact' }))
        expect(await screen.findByText(/Details added to this order/)).toBeInTheDocument()

        await selectMenuItem(user, '1')

        expect(await screen.findByRole('table', { name: 'Order for Table 1' })).toBeInTheDocument()
        expect(fetchMock.mock.calls.some(([url, options]) => url === '/api/customers' && options?.method === 'POST')).toBe(false)
        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            '/api/open-orders',
            expect.objectContaining({
                body: JSON.stringify({
                    completed: false,
                    customerName: 'Mira Patel',
                    customerPhone: null,
                    customerDateOfBirth: null,
                    lines: [{ menuItemId: 1, quantity: 1, addOnIds: [] }],
                    tableName: 'Table 1',
                }),
                method: 'PUT',
            }),
        )
    })

    it('requires a ten-digit mobile number before searching', async () => {
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([]))
        const user = userEvent.setup()

        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.type(screen.getByLabelText('Search by name or mobile'), '12345')
        await user.click(screen.getByRole('button', { name: 'Search' }))

        expect(await screen.findByText('Enter a valid 10-digit mobile number.')).toBeInTheDocument()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('rejects a malformed optional phone when saving a new contact', async () => {
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([]))
        const user = userEvent.setup()

        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.type(screen.getByLabelText('Search by name or mobile'), 'Mira Patel')
        await user.click(screen.getByRole('button', { name: 'Search' }))
        await user.click(await screen.findByRole('button', { name: 'Create new contact' }))
        await user.type(screen.getByLabelText('Phone number (optional)'), '12345')
        await user.click(screen.getByRole('button', { name: 'Save contact' }))

        expect(await screen.findByText('Enter a valid phone number for the new contact.')).toBeInTheDocument()
        expect(screen.getByLabelText('Name (optional)')).toHaveValue('Mira Patel')
        expect(screen.getByLabelText('Phone number (optional)')).toHaveValue('12345')
        expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('creates a new contact from the no-match order dialog before adding dishes', async () => {
        const menuItem = {
            addOns: [],
            description: 'Freshly grilled paneer',
            discountApplied: 0,
            id: 1,
            name: 'Paneer Tikka',
            price: 120,
        }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                dateOfBirth: '1990-05-12',
                name: 'Aarav Mehta',
                phoneNumber: '+919876543210',
            }))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                customerName: 'Aarav Mehta',
                customerPhone: '+919876543210',
                customerDateOfBirth: '1990-05-12',
                lines: [{ itemName: 'Paneer Tikka', lineTotal: 120, menuItemId: 1, quantity: 1, unitPrice: 120 }],
                tableName: 'Table 1',
                total: 120,
            }))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.type(screen.getByLabelText('Search by name or mobile'), '98765 43210')
        await user.click(screen.getByRole('button', { name: 'Search' }))
        await user.click(await screen.findByRole('button', { name: 'Create new contact' }))

        expect(screen.getByLabelText('Phone number (optional)')).toHaveValue('+919876543210')
        await user.type(screen.getByLabelText('Name (optional)'), 'Aarav Mehta')
        await user.type(screen.getByLabelText('Date of birth (optional)'), '1990-05-12')
        await user.click(screen.getByRole('button', { name: 'Save contact' }))

        expect(await screen.findByText(/Contact saved and filled into this order/)).toBeInTheDocument()
        expect(screen.getByText('No items selected for Table 1.')).toBeInTheDocument()
        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            '/api/customers',
            expect.objectContaining({
                body: JSON.stringify({
                    dateOfBirth: '1990-05-12',
                    name: 'Aarav Mehta',
                    phoneNumber: '+919876543210',
                }),
                method: 'POST',
            }),
        )
        await selectMenuItem(user, '1')
        expect(await screen.findByRole('table', { name: 'Order for Table 1' })).toBeInTheDocument()
        expect(fetchMock).toHaveBeenNthCalledWith(
            5,
            '/api/open-orders',
            expect.objectContaining({
                body: JSON.stringify({
                    completed: false,
                    customerName: 'Aarav Mehta',
                    customerPhone: '+919876543210',
                    customerDateOfBirth: '1990-05-12',
                    lines: [{ menuItemId: 1, quantity: 1, addOnIds: [] }],
                    tableName: 'Table 1',
                }),
                method: 'PUT',
            }),
        )
    })

    it('removes customer details from an existing order without changing its items', async () => {
        const menuItem = {
            addOns: [],
            description: 'Freshly grilled paneer',
            discountApplied: 0,
            id: 1,
            name: 'Paneer Tikka',
            price: 120,
        }
        const existingOrder = {
            completed: true,
            customerName: 'Aarav Mehta',
            customerPhone: null,
            customerDateOfBirth: null,
            lines: [{ itemName: 'Paneer Tikka', lineTotal: 120, menuItemId: 1, quantity: 1, unitPrice: 120 }],
            tableName: 'Table 1',
            total: 120,
        }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([existingOrder]))
            .mockResolvedValueOnce(jsonResponse({ ...existingOrder, customerName: null }))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        expect(within(screen.getByRole('group', { name: 'Selected customer' })).getByText('Aarav Mehta')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Remove customer' }))
        expect(screen.queryByRole('group', { name: 'Selected customer' })).not.toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Save details' }))

        expect(await screen.findByText('Customer details cleared for Table 1.')).toBeInTheDocument()
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            '/api/open-orders',
            expect.objectContaining({
                body: JSON.stringify({
                    completed: true,
                    customerName: null,
                    customerPhone: null,
                    customerDateOfBirth: null,
                    lines: [{ menuItemId: 1, quantity: 1, addOnIds: [] }],
                    tableName: 'Table 1',
                }),
                method: 'PUT',
            }),
        )
        expect(screen.getByText('Ordering name:')).toHaveTextContent('Ordering name: NA')
        expect(within(screen.getByRole('table', { name: 'Order for Table 1' })).getByText('Paneer Tikka')).toBeInTheDocument()
    })

    it('increments an existing order line and saves the recalculated total', async () => {
        const menuItem = {
            description: 'Potato patty with chutney',
            discountApplied: 10,
            id: 1,
            name: 'Aloo Tikki',
            price: 100,
        }
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                lines: [{ itemName: 'Aloo Tikki', lineTotal: 90, menuItemId: 1, quantity: 1, unitPrice: 90 }],
                subtotal: 90,
                tableName: 'Table 1',
                total: 90,
            }))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                lines: [{ itemName: 'Aloo Tikki', lineTotal: 180, menuItemId: 1, quantity: 2, unitPrice: 90 }],
                subtotal: 180,
                tableName: 'Table 1',
                total: 180,
            }))
            .mockResolvedValueOnce(jsonResponse({
                completed: false,
                lines: [{ itemName: 'Aloo Tikki', lineTotal: 90, menuItemId: 1, quantity: 1, unitPrice: 90 }],
                subtotal: 90,
                tableName: 'Table 1',
                total: 90,
            }))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await selectMenuItem(user, '1')
        const orderTable = await screen.findByRole('table', { name: 'Order for Table 1' })
        await user.click(within(orderTable).getByRole('button', { name: 'Increase Aloo Tikki quantity' }))

        await within(orderTable).findByText('2')
        expect(within(orderTable).getAllByText('₹180.00')).toHaveLength(4)
        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            '/api/open-orders',
            expect.objectContaining({
                body: JSON.stringify({
                    completed: false,
                    customerName: null,
                    customerPhone: null,
                    customerDateOfBirth: null,
                    lines: [{ menuItemId: 1, quantity: 2, addOnIds: [] }],
                    tableName: 'Table 1',
                }),
                method: 'PUT',
            }),
        )

        await user.click(within(orderTable).getByRole('button', { name: 'Decrease Aloo Tikki quantity' }))
        await within(orderTable).findByText('1')
        const updatedLine = within(orderTable).getAllByRole('row')[2]
        expect(within(updatedLine).getAllByRole('cell')[2]).toHaveTextContent('₹90.00')
        expect(within(updatedLine).getAllByRole('cell')[3]).toHaveTextContent('₹90.00')
        expect(within(orderTable).getByRole('button', { name: 'Decrease Aloo Tikki quantity' })).toBeDisabled()
        expect(fetchMock).toHaveBeenNthCalledWith(
            5,
            '/api/open-orders',
            expect.objectContaining({
                body: JSON.stringify({
                    completed: false,
                    customerName: null,
                    customerPhone: null,
                    customerDateOfBirth: null,
                    lines: [{ menuItemId: 1, quantity: 1, addOnIds: [] }],
                    tableName: 'Table 1',
                }),
                method: 'PUT',
            }),
        )
    })

    it('groups General and Others lines and shows Others outside the bill discount', async () => {
        mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([{
                completed: false,
                lines: [
                    { itemName: 'Main dish', section: 'Mains', lineTotal: 100, menuItemId: 1, quantity: 1, unitPrice: 100 },
                    { itemName: 'Bottled water', section: 'Others', lineTotal: 50, menuItemId: 2, quantity: 1, unitPrice: 50 },
                ],
                subtotal: 150,
                discountPercent: 10,
                discountAmount: 10,
                tableName: 'Table 1',
                total: 140,
            }]))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: /Table 1/ }))
        const orderTable = screen.getByRole('table', { name: 'Order for Table 1' })
        expect(within(orderTable).getByRole('rowheader', { name: 'General' })).toBeInTheDocument()
        expect(within(orderTable).getByRole('rowheader', { name: 'Others (no bill discount)' })).toBeInTheDocument()
        expect(within(orderTable).getByText('General total')).toBeInTheDocument()
        expect(within(orderTable).getByText('Others total')).toBeInTheDocument()
        expect(within(orderTable).getByText('Bill discount (10.00% of General)')).toBeInTheDocument()
        expect(within(orderTable).getByText('₹140.00')).toBeInTheDocument()
    })

    it('always shows the bill discount row when the discount amount is zero', async () => {
        mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([{
                completed: false,
                lines: [{ itemName: 'Main dish', section: 'Mains', lineTotal: 100, menuItemId: 1, quantity: 1, unitPrice: 100 }],
                subtotal: 100,
                discountPercent: 0,
                discountAmount: 0,
                tableName: 'Table 1',
                total: 100,
            }]))
        const user = userEvent.setup()

        render(<TableManager />)
        await user.click(await screen.findByRole('button', { name: /Table 1/ }))

        const orderTable = screen.getByRole('table', { name: 'Order for Table 1' })
        expect(within(orderTable).getByText('Bill discount (0.00% of General)')).toBeInTheDocument()
        expect(within(orderTable).getByText('-₹0.00')).toBeInTheDocument()
    })

    it('shows add-ons only for the selected item and saves their price with the order', async () => {
        const scrollIntoView = vi.fn()
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
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
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse(menuItems))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                tableName: 'Table 1', completed: false, total: 65,
                lines: [{ menuItemId: 1, itemName: 'Veg Sandwich', quantity: 1, unitPrice: 65, lineTotal: 65 }]
            }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
            .mockResolvedValueOnce(jsonResponse({
                tableName: 'Table 1', completed: false, total: 90,
                lines: [{ menuItemId: 2, itemName: 'Chicken Sandwich', quantity: 1, unitPrice: 90, lineTotal: 90 }]
            }))
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
        await user.click(menuSelect)
        expect(within(screen.getByRole('group', { name: 'Continental / Sandwiches' })).getByRole('checkbox', { name: 'Select Veg Sandwich' })).toBeInTheDocument()
        await selectMenuItem(user, '1')
        expect(screen.queryByRole('group', { name: 'Add-ons for Veg Sandwich' })).not.toBeInTheDocument()
        await user.click(screen.getByRole('checkbox', { name: 'Select Veg Sandwich' }))

        await selectMenuItem(user, '2')
        expect(menuSelect).toHaveAttribute('aria-expanded', 'true')
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
        const addOnDropdown = screen.getByRole('button', { name: 'Add-ons for Chicken Sandwich' })
        expect(addOnDropdown).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('group', { name: 'Add-ons for Chicken Sandwich' })).toBeInTheDocument()
        await user.click(addOnDropdown)
        expect(addOnDropdown).toHaveAttribute('aria-expanded', 'false')
        expect(screen.queryByRole('group', { name: 'Add-ons for Chicken Sandwich' })).not.toBeInTheDocument()
        await user.click(addOnDropdown)
        expect(addOnDropdown).toHaveAttribute('aria-expanded', 'true')
        await user.click(screen.getByRole('checkbox', { name: 'Add Extra cheese' }))
        await screen.findByText('Chicken Sandwich add-ons updated.')
        expect(menuSelect).toHaveAttribute('aria-expanded', 'true')
        expect(screen.getByRole('table', { name: 'Order for Table 1' })).toHaveTextContent('₹110.00')

        await user.click(screen.getByRole('heading', { name: 'Table orders' }))
        expect(menuSelect).toHaveAttribute('aria-expanded', 'false')

        const orderTable = await screen.findByRole('table', { name: 'Order for Table 1' })
        expect(within(orderTable).getByText('Chicken Sandwich + Extra cheese')).toBeInTheDocument()
        expect(fetchMock).toHaveBeenNthCalledWith(
            6,
            '/api/open-orders',
            expect.objectContaining({
                body: JSON.stringify({
                    completed: false,
                    customerName: null,
                    customerPhone: null,
                    customerDateOfBirth: null,
                    lines: [{ menuItemId: 2, quantity: 1, addOnIds: [12] }],
                    tableName: 'Table 1',
                }),
                method: 'PUT',
            }),
        )
    })

    it('restores a completed unpaid order and opens it for more items', async () => {
        const fetchMock = mockOrderFetch()
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
        expect(within(orderTable).getAllByText('₹270.00')).toHaveLength(4)
        expect(screen.getByText('Final price')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Create invoice' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Open table' }))
        expect(await screen.findByRole('combobox', { name: 'Menu item' })).toBeInTheDocument()
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
        mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(new Response(null, { status: 409 }))
        const user = userEvent.setup()

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))

        expect(await screen.findByLabelText('Menu item')).toBeInTheDocument()
        await user.click(screen.getByLabelText('Menu item'))
        expect(screen.getByRole('checkbox', { name: 'Select Paneer Tikka' })).toBeInTheDocument()
    })

    it('refreshes menu items when the Table tab becomes active again', async () => {
        const menuItem = {
            description: 'Freshly grilled paneer',
            discountApplied: 0,
            id: 1,
            name: 'Paneer Tikka',
            price: 200,
        }
        const fetchMock = mockOrderFetch()
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

        await user.click(await screen.findByLabelText('Menu item'))
        expect(screen.getByRole('checkbox', { name: 'Select Paneer Tikka' })).toBeInTheDocument()
    })

    it('creates a formal pending invoice for a completed unpaid order', async () => {
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:formal-invoice'),
            revokeObjectURL: vi.fn(),
        })
        const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null)
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([
                {
                    description: 'Freshly grilled paneer with a rich tomato sauce',
                    discountApplied: 0,
                    id: 1,
                    name: 'Paneer Tikka Masala',
                    section: 'Mains',
                    price: 270,
                },
            ]))
            .mockResolvedValueOnce(jsonResponse([{
                completed: true,
                customerPhone: '+919876543210',
                orderDescription: 'No onions, extra crisp',
                lines: [{ itemName: 'Paneer Tikka Masala', section: 'Mains', lineTotal: 270, menuItemId: 1, quantity: 1, unitPrice: 270 }],
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
        expect(screen.getByText('Description:').parentElement).toHaveTextContent('No onions, extra crisp')
        await user.click(screen.getByRole('button', { name: 'Create invoice' }))

        const invoiceText = pdf.document.text.mock.calls.flat().join(' ')
        expect(invoiceText).toContain('THE THIRD BREAK')
        expect(invoiceText).toContain('INVOICE')
        expect(invoiceText).toContain('Invoice no.')
        expect(invoiceText).toContain('Seating: Table 2')
        expect(invoiceText).toContain('Ordering name: NA')
        expect(invoiceText).toContain('Description: No onions, extra crisp')
        expect(invoiceText).toContain('Payment status: Pending')
        expect(invoiceText).toContain('GENERAL')
        expect(invoiceText).toContain('Subtotal')
        expect(invoiceText).toContain('Bill discount (10.00% of General)')
        expect(invoiceText).toContain('- INR 30.00')
        expect(invoiceText).toContain('Final bill')
        expect(invoiceText).toContain('INR 270.00')
        expect(screen.getByTitle('Invoice preview')).toHaveAttribute('src', 'blob:formal-invoice')
        expect(screen.getByRole('link', { name: 'Download invoice' })).toHaveAttribute('download', 'table-2-invoice.pdf')
        expect(screen.getByText(/Attach the downloaded PDF and tap Send/)).toBeInTheDocument()
        const sendInWhatsApp = screen.getByRole('button', { name: 'Send in WhatsApp' })
        expect(sendInWhatsApp).toBeEnabled()
        await user.click(sendInWhatsApp)

        const whatsappUrl = String(openWindow.mock.calls[0][0])
        expect(whatsappUrl).toContain('https://wa.me/919876543210?text=')
        const whatsappMessage = decodeURIComponent(whatsappUrl.split('?text=')[1] ?? '')
        expect(whatsappMessage).toContain('Invoice: PP-')
        expect(whatsappMessage).toContain('Seating: Table 2')
        expect(whatsappMessage).toContain('Amount due: ₹270.00.')
        expect(whatsappMessage).toContain('Please attach the downloaded invoice PDF before sending.')
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('disables WhatsApp invoice sending when the order has no saved phone', async () => {
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn(() => 'blob:invoice-without-phone'),
            revokeObjectURL: vi.fn(),
        })
        mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse([{
                completed: true,
                customerName: 'Aarav Mehta',
                customerPhone: null,
                customerDateOfBirth: null,
                lines: [{ itemName: 'Paneer Tikka', lineTotal: 120, menuItemId: 1, quantity: 1, unitPrice: 120 }],
                tableName: 'Table 1',
                total: 120,
            }]))
        const user = userEvent.setup()
        const openWindow = vi.spyOn(window, 'open').mockImplementation(() => null)

        render(<TableManager />)

        await user.click(await screen.findByRole('button', { name: 'Table 1' }))
        await user.click(screen.getByRole('button', { name: 'Create invoice' }))

        const sendInWhatsApp = screen.getByRole('button', { name: 'Send in WhatsApp' })
        expect(sendInWhatsApp).toBeDisabled()
        await user.type(screen.getByLabelText('WhatsApp number'), '12345')
        expect(sendInWhatsApp).toBeDisabled()
        await user.clear(screen.getByLabelText('WhatsApp number'))
        await user.type(screen.getByLabelText('WhatsApp number'), '98765 43210')
        expect(sendInWhatsApp).toBeEnabled()
        await user.click(sendInWhatsApp)
        expect(String(openWindow.mock.calls[0][0])).toContain('https://wa.me/919876543210?text=')
    })

    it('retains a failed order change and retries it on request', async () => {
        const menuItem = {
            description: 'Crisp potato patty',
            discountApplied: 0,
            id: 1,
            name: 'Aloo Tikki',
            price: 100,
        }
        const fetchMock = mockOrderFetch()
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
        await selectMenuItem(user, '1')

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
                    customerName: null,
                    customerPhone: null,
                    customerDateOfBirth: null,
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
        const fetchMock = mockOrderFetch()
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                tableName: 'Outdoor 3', completed: false, total: 200,
                lines: [{ menuItemId: 1, itemName: 'Paneer Tikka', quantity: 1, unitPrice: 200, lineTotal: 200 }]
            }))
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
        await selectMenuItem(user, '1')
        await setSelectedQuantity(user, 2)

        await user.click(await screen.findByRole('button', { name: 'Complete order' }))
        expect(screen.queryByRole('button', { name: 'Add to Outdoor 3' })).not.toBeInTheDocument()
        expect(await screen.findByRole('button', { name: 'Paid online' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Paid by cash' }))
        expect(fetchMock).toHaveBeenCalledTimes(5)
        expect(screen.getByRole('alertdialog', { name: 'Confirm payment' })).toHaveTextContent('₹400.00')
        await user.click(screen.getByRole('button', { name: 'Confirm cash payment' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            6,
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