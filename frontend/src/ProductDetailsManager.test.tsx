import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProductDetailsManager from './ProductDetailsManager'

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status,
    })
}

describe('ProductDetailsManager', () => {
    afterEach(() => {
        cleanup()
        vi.unstubAllGlobals()
    })

    it('loads a selected menu item recipe, adds a raw material, and saves it', async () => {
        const menuItems = [
            { id: 1, name: 'Masala Dosa', section: 'Quick Bites' },
            { id: 2, name: 'Tea', section: 'Beverages' },
        ]
        const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
            const url = String(input)
            if (url === '/api/menu') return jsonResponse(menuItems)
            if (url === '/api/menu/1/product-details' && init?.method === 'PUT') {
                const request = JSON.parse(String(init.body)) as { rawMaterials: Array<{ rawMaterial: string; quantity: string }> }
                return jsonResponse({ menuItemId: 1, rawMaterials: request.rawMaterials })
            }
            if (url === '/api/menu/1/product-details') {
                return jsonResponse({ menuItemId: 1, rawMaterials: [{ rawMaterial: 'Rice batter', quantity: '150 g' }] })
            }
            if (url === '/api/menu/2/product-details') return jsonResponse({ menuItemId: 2, rawMaterials: [] })
            return jsonResponse({ message: 'Not found' }, 404)
        })
        vi.stubGlobal('fetch', fetchMock)
        const user = userEvent.setup()

        render(<ProductDetailsManager canManage />)

        await user.selectOptions(await screen.findByLabelText('Menu item'), '1')
        expect(await screen.findByLabelText('Raw material 1')).toHaveValue('Rice batter')
        expect(screen.getByLabelText('Quantity 1')).toHaveValue('150 g')

        await user.click(screen.getByRole('button', { name: 'Add raw material' }))
        await user.type(screen.getByLabelText('Raw material 2'), 'Potato')
        await user.type(screen.getByLabelText('Quantity 2'), '80 g')
        await user.click(screen.getByRole('button', { name: 'Save product details' }))

        expect(await screen.findByRole('status')).toHaveTextContent('Product details saved.')
        expect(fetchMock).toHaveBeenLastCalledWith('/api/menu/1/product-details', expect.objectContaining({
            body: JSON.stringify({
                rawMaterials: [
                    { rawMaterial: 'Rice batter', quantity: '150 g' },
                    { rawMaterial: 'Potato', quantity: '80 g' },
                ],
            }),
            method: 'PUT',
        }))

        await user.selectOptions(screen.getByLabelText('Menu item'), '2')
        await waitFor(() => expect(screen.getByText('No raw materials recorded for this item.')).toBeInTheDocument())
    })

    it('requires both fields and keeps recipe inputs read-only for captains', async () => {
        const fetchMock = vi.fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse([{ id: 1, name: 'Masala Dosa', section: 'Quick Bites' }]))
            .mockResolvedValueOnce(jsonResponse({ menuItemId: 1, rawMaterials: [{ rawMaterial: 'Rice batter', quantity: '150 g' }] }))
        vi.stubGlobal('fetch', fetchMock)
        const user = userEvent.setup()

        render(<ProductDetailsManager />)

        await user.selectOptions(await screen.findByLabelText('Menu item'), '1')
        expect(await screen.findByLabelText('Raw material 1')).toBeDisabled()
        expect(screen.queryByRole('button', { name: 'Add raw material' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Save product details' })).not.toBeInTheDocument()
    })
})