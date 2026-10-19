import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CustomerDetailsManager from './CustomerDetailsManager'

function jsonResponse(body: unknown) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
    })
}

describe('CustomerDetailsManager', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('lists saved profiles and searches by name, phone, and date of birth', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([
            { dateOfBirth: '1990-05-12', name: 'Aarav Mehta', phoneNumber: '+919876543210' },
            { dateOfBirth: null, name: null, phoneNumber: '+14155550123' },
        ]))
        const user = userEvent.setup()

        render(<CustomerDetailsManager />)

        const customerTable = await screen.findByRole('table', { name: 'Customer details' })
        expect(within(customerTable).getByText('Aarav Mehta')).toBeInTheDocument()
        expect(within(customerTable).getByText('+919876543210')).toBeInTheDocument()
        expect(within(customerTable).getByText('1990-05-12')).toBeInTheDocument()
        expect(within(customerTable).getAllByText('NA')).toHaveLength(2)
        expect(fetchMock).toHaveBeenCalledWith('/api/customers', expect.objectContaining({ credentials: 'include' }))

        await user.type(screen.getByLabelText('Search customers'), '4155550123')
        expect(within(customerTable).getByText('+14155550123')).toBeInTheDocument()
        expect(within(customerTable).queryByText('Aarav Mehta')).not.toBeInTheDocument()

        await user.clear(screen.getByLabelText('Search customers'))
        await user.type(screen.getByLabelText('Search customers'), '1990-05-12')
        expect(within(customerTable).getByText('Aarav Mehta')).toBeInTheDocument()
        expect(within(customerTable).queryByText('+14155550123')).not.toBeInTheDocument()
    })

    it('manually adds, edits the phone key, and removes a customer', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse({
                dateOfBirth: '1990-05-12',
                name: 'Aarav Mehta',
                phoneNumber: '+919876543210',
            }))
            .mockResolvedValueOnce(jsonResponse({
                dateOfBirth: '1991-06-13',
                name: 'Aarav Singh',
                phoneNumber: '+919876543211',
            }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
        const user = userEvent.setup()

        render(<CustomerDetailsManager />)

        await screen.findByText('No customer details have been saved yet.')
        await user.click(screen.getAllByRole('button', { name: 'Add customer' })[0])
        const addForm = screen.getByRole('form', { name: 'Add customer' })
        await user.type(within(addForm).getByLabelText('Name (optional)'), 'Aarav Mehta')
        await user.type(within(addForm).getByLabelText('Phone number'), '98765 43210')
        await user.type(within(addForm).getByLabelText('Date of birth (optional)'), '1990-05-12')
        await user.click(within(addForm).getByRole('button', { name: 'Add customer' }))

        const customerTable = await screen.findByRole('table', { name: 'Customer details' })
        expect(within(customerTable).getByText('+919876543210')).toBeInTheDocument()
        await user.click(within(customerTable).getByRole('button', { name: 'Edit +919876543210' }))
        const editForm = screen.getByRole('form', { name: 'Edit customer' })
        await user.clear(within(editForm).getByLabelText('Name (optional)'))
        await user.type(within(editForm).getByLabelText('Name (optional)'), 'Aarav Singh')
        await user.clear(within(editForm).getByLabelText('Phone number'))
        await user.type(within(editForm).getByLabelText('Phone number'), '98765 43211')
        await user.clear(within(editForm).getByLabelText('Date of birth (optional)'))
        await user.type(within(editForm).getByLabelText('Date of birth (optional)'), '1991-06-13')
        await user.click(within(editForm).getByRole('button', { name: 'Save changes' }))

        expect(await within(customerTable).findByText('Aarav Singh')).toBeInTheDocument()
        expect(within(customerTable).getByText('+919876543211')).toBeInTheDocument()
        expect(within(customerTable).queryByText('+919876543210')).not.toBeInTheDocument()
        await user.click(within(customerTable).getByRole('button', { name: 'Remove +919876543211' }))
        expect(screen.getByRole('alertdialog', { name: 'Remove customer' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Remove customer' }))

        expect(await screen.findByText('Customer removed. Saved order names remain in History.')).toBeInTheDocument()
        expect(screen.queryByRole('table', { name: 'Customer details' })).not.toBeInTheDocument()
        expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/customers', expect.objectContaining({
            body: JSON.stringify({ dateOfBirth: '1990-05-12', name: 'Aarav Mehta', phoneNumber: '+919876543210' }),
            method: 'POST',
        }))
        expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/customers/%2B919876543210', expect.objectContaining({
            body: JSON.stringify({ dateOfBirth: '1991-06-13', name: 'Aarav Singh', phoneNumber: '+919876543211' }),
            method: 'PUT',
        }))
        expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/customers/%2B919876543211', expect.objectContaining({
            method: 'DELETE',
        }))
    })
})