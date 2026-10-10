import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MenuManager from './MenuManager'

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status,
    })
}

describe('MenuManager', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('shows the four editable menu fields', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([]))

        render(<MenuManager />)

        expect(await screen.findByRole('heading', { name: 'Current menu' })).toBeInTheDocument()
        expect(screen.getByLabelText('Name')).toBeInTheDocument()
        expect(screen.getByLabelText('Description')).toBeInTheDocument()
        expect(screen.getByLabelText('Discount applied (%)')).toBeInTheDocument()
        expect(screen.getByLabelText('Price (INR)')).toBeInTheDocument()
    })

    it('creates an item and saves later edits', async () => {
        const menuItem = {
            id: 1,
            name: 'Masala Dosa',
            description: 'Crisp dosa',
            discountApplied: 10,
            price: 180,
        }
        const updatedMenuItem = { ...menuItem, discountApplied: 15, price: 195 }
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(menuItem, 201))
            .mockResolvedValueOnce(jsonResponse(updatedMenuItem))
        const user = userEvent.setup()

        render(<MenuManager />)

        await screen.findByRole('heading', { name: 'Current menu' })
        await user.type(screen.getByLabelText('Name'), menuItem.name)
        await user.type(screen.getByLabelText('Description'), menuItem.description)
        await user.clear(screen.getByLabelText('Discount applied (%)'))
        await user.type(screen.getByLabelText('Discount applied (%)'), '10')
        await user.type(screen.getByLabelText('Price (INR)'), '180')
        await user.click(screen.getByRole('button', { name: 'Add menu item' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/api/menu',
            expect.objectContaining({
                body: JSON.stringify({
                    name: 'Masala Dosa',
                    description: 'Crisp dosa',
                    discountApplied: 10,
                    price: 180,
                }),
                credentials: 'include',
                method: 'POST',
            }),
        )

        await screen.findByRole('button', { name: 'Edit Masala Dosa' })
        await user.click(screen.getByRole('button', { name: 'Edit Masala Dosa' }))
        await user.clear(screen.getByLabelText('Discount applied for Masala Dosa'))
        await user.type(screen.getByLabelText('Discount applied for Masala Dosa'), '15')
        await user.clear(screen.getByLabelText('Price for Masala Dosa'))
        await user.type(screen.getByLabelText('Price for Masala Dosa'), '195')
        await user.click(screen.getByRole('button', { name: 'Save Masala Dosa' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            '/api/menu/1',
            expect.objectContaining({
                body: JSON.stringify({
                    name: 'Masala Dosa',
                    description: 'Crisp dosa',
                    discountApplied: 15,
                    price: 195,
                }),
                credentials: 'include',
                method: 'PUT',
            }),
        )
        expect(await screen.findByText('15%')).toBeInTheDocument()
    })

    it('shows saved menu values in a table beneath the form', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([{
            id: 1,
            name: 'Masala Dosa',
            description: 'Crisp dosa',
            discountApplied: 10,
            price: 180,
        }]))

        render(<MenuManager />)

        expect(await screen.findByRole('table', { name: 'Saved menu items' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Description' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Discount' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Price' })).toBeInTheDocument()
        expect(screen.getByText('Masala Dosa')).toBeInTheDocument()
        expect(screen.getByText('Crisp dosa')).toBeInTheDocument()
        expect(screen.getByText('10%')).toBeInTheDocument()
        expect(screen.getByText('₹180.00')).toBeInTheDocument()
        expect(screen.getByText('1 item')).toBeInTheDocument()
    })

    it('shows saved menu values without mutation controls when read-only', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([{
            id: 1,
            name: 'Masala Dosa',
            description: 'Crisp dosa',
            discountApplied: 10,
            price: 180,
        }]))

        render(<MenuManager canManage={false} />)

        expect(await screen.findByRole('heading', { name: 'Menu' })).toBeInTheDocument()
        expect(screen.getByText('Masala Dosa')).toBeInTheDocument()
        expect(screen.getByRole('table', { name: 'Saved menu items' })).toBeInTheDocument()
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Edit Masala Dosa' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Delete Masala Dosa' })).not.toBeInTheDocument()
        expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
    })

    it('deletes a saved menu item', async () => {
        const menuItem = {
            id: 1,
            name: 'Masala Dosa',
            description: 'Crisp dosa',
            discountApplied: 10,
            price: 180,
        }
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(new Response(null, { status: 204 }))
        const user = userEvent.setup()

        render(<MenuManager />)

        await screen.findByRole('button', { name: 'Delete Masala Dosa' })
        await user.click(screen.getByRole('button', { name: 'Delete Masala Dosa' }))

        expect(fetchMock).toHaveBeenCalledOnce()
        expect(screen.getByRole('alertdialog', { name: 'Delete Masala Dosa?' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Delete item' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/api/menu/1',
            expect.objectContaining({ credentials: 'include', method: 'DELETE' }),
        )
        expect(await screen.findByText('No menu items yet.')).toBeInTheDocument()
    })

    it('dismisses the delete review when the server rejects the deletion', async () => {
        const menuItem = {
            id: 1,
            name: 'Masala Dosa',
            description: 'Crisp dosa',
            discountApplied: 10,
            price: 180,
        }
        vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([menuItem]))
            .mockResolvedValueOnce(new Response(null, { status: 500 }))
        const user = userEvent.setup()

        render(<MenuManager />)

        await user.click(await screen.findByRole('button', { name: 'Delete Masala Dosa' }))
        await user.click(screen.getByRole('button', { name: 'Delete item' }))

        expect(await screen.findByText('We could not delete this menu item. Please try again.')).toBeInTheDocument()
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
})