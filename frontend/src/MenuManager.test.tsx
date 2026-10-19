import { cleanup, render, screen, within } from '@testing-library/react'
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
            section: 'Quick Bites',
            subsection: '',
            discountApplied: 10,
            price: 180,
            addOns: [],
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
        const quickBitesSummary = await screen.findAllByText('Quick Bites')
        await user.click(quickBitesSummary.find((element) => element.parentElement?.tagName === 'SUMMARY')!)

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/api/menu',
            expect.objectContaining({
                body: JSON.stringify({
                    name: 'Masala Dosa',
                    description: 'Crisp dosa',
                    section: 'Quick Bites',
                    subsection: '',
                    discountApplied: 10,
                    price: 180,
                    addOns: [],
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
                    section: 'Quick Bites',
                    subsection: '',
                    discountApplied: 15,
                    price: 195,
                    addOns: [],
                }),
                credentials: 'include',
                method: 'PUT',
            }),
        )
        expect(await screen.findByText('15%')).toBeInTheDocument()
    })

    it('creates a menu item with multiple item-specific add-ons', async () => {
        const createdItem = {
            id: 4,
            name: 'Chicken Sandwich',
            description: 'Chicken sandwich',
            section: 'Continental',
            subsection: 'Sandwiches',
            discountApplied: 0,
            price: 90,
            addOns: [
                { id: 21, name: 'Extra cheese', price: 20 },
                { id: 22, name: 'Grilled chicken', price: 35 },
            ],
        }
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([]))
            .mockResolvedValueOnce(jsonResponse(createdItem, 201))
        const user = userEvent.setup()

        render(<MenuManager />)

        await user.type(screen.getByLabelText('Name'), createdItem.name)
        await user.type(screen.getByLabelText('Description'), createdItem.description)
        await user.selectOptions(screen.getByLabelText('Main section'), 'Continental')
        expect(screen.getByRole('option', { name: 'Pizza' })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'Main Course' })).not.toBeInTheDocument()
        await user.selectOptions(screen.getByLabelText('Subsection'), 'Sandwiches')
        await user.type(screen.getByLabelText('Price (INR)'), '90')
        await user.click(screen.getByRole('radio', { name: 'Yes' }))
        await user.type(screen.getByLabelText('Add-on name 1 for new-menu-item'), 'Extra cheese')
        await user.type(screen.getByLabelText('Add-on price 1 for new-menu-item'), '20')
        await user.click(screen.getByRole('button', { name: 'Add another add-on' }))
        await user.type(screen.getByLabelText('Add-on name 2 for new-menu-item'), 'Grilled chicken')
        await user.type(screen.getByLabelText('Add-on price 2 for new-menu-item'), '35')
        await user.click(screen.getByRole('button', { name: 'Add menu item' }))

        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            '/api/menu',
            expect.objectContaining({
                body: JSON.stringify({
                    name: createdItem.name,
                    description: createdItem.description,
                    section: 'Continental',
                    subsection: 'Sandwiches',
                    discountApplied: 0,
                    price: 90,
                    addOns: [
                        { id: null, name: 'Extra cheese', price: 20 },
                        { id: null, name: 'Grilled chicken', price: 35 },
                    ],
                }),
                method: 'POST',
            }),
        )
        const continentalSummary = (await screen.findAllByText('Continental'))
            .find((element) => element.parentElement?.tagName === 'SUMMARY')!
        await user.click(continentalSummary)
        const sandwichSummary = screen.getAllByText('Sandwiches')
            .find((element) => element.parentElement?.tagName === 'SUMMARY')!
        await user.click(sandwichSummary)
        expect(screen.getByRole('table', { name: 'Saved menu items in Continental / Sandwiches' })).toBeInTheDocument()
        expect(await screen.findByText('Extra cheese (+₹20.00), Grilled chicken (+₹35.00)')).toBeInTheDocument()
    })

    it('creates and edits combos using only existing non-combo menu items', async () => {
        const dosa = { id: 1, name: 'Dosa', description: null, section: 'Quick Bites', subsection: '', discountApplied: 0, price: 120, addOns: [] }
        const tea = { ...dosa, id: 2, name: 'Tea', price: 30 }
        const existingCombo = { ...dosa, id: 3, name: 'Existing combo', section: 'Combo', comboItems: [{ id: 1, name: 'Dosa' }] }
        const newCombo = { ...existingCombo, id: 4, name: 'Lunch combo', price: 130, comboItems: [{ id: 1, name: 'Dosa' }, { id: 2, name: 'Tea' }] }
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse([dosa, tea, existingCombo]))
            .mockResolvedValueOnce(jsonResponse(newCombo, 201))
            .mockResolvedValueOnce(jsonResponse({ ...newCombo, comboItems: [{ id: 1, name: 'Dosa' }] }))
        const user = userEvent.setup()
        render(<MenuManager />)

        await screen.findByText('Existing combo')
        await user.type(screen.getByLabelText('Name'), 'Lunch combo')
        await user.selectOptions(screen.getByLabelText('Main section'), 'Combo')
        await user.type(screen.getByLabelText('Price (INR)'), '130')
        await user.click(screen.getByRole('button', { name: 'Add menu item' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('Select at least one menu item for this combo.')
        expect(fetchMock).toHaveBeenCalledTimes(1)

        const selector = screen.getByRole('group', { name: 'Combo items (0 selected)' })
        expect(within(selector).queryByRole('checkbox', { name: 'Existing combo' })).not.toBeInTheDocument()
        await user.type(screen.getByLabelText('Find combo items'), 'dos')
        expect(within(selector).queryByRole('checkbox', { name: 'Tea' })).not.toBeInTheDocument()
        await user.click(within(selector).getByRole('checkbox', { name: 'Dosa' }))
        await user.clear(screen.getByLabelText('Find combo items'))
        await user.click(within(selector).getByRole('checkbox', { name: 'Tea' }))
        await user.click(screen.getByRole('button', { name: 'Add menu item' }))
        await screen.findByText('Menu item added.')
        expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
            name: 'Lunch combo', description: null, section: 'Combo', subsection: '',
            discountApplied: 0, price: 130, addOns: [], comboItemIds: [1, 2],
        })

        const comboSummary = screen.getAllByText('Combo').find((element) => element.parentElement?.tagName === 'SUMMARY')!
        await user.click(comboSummary)
        expect(screen.getByText('Dosa, Tea')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Edit Lunch combo' }))
        const editingSelector = screen.getByRole('group', { name: 'Combo items (2 selected)' })
        expect(within(editingSelector).getByRole('checkbox', { name: 'Dosa' })).toBeChecked()
        expect(within(editingSelector).getByRole('checkbox', { name: 'Tea' })).toBeChecked()
        expect(within(editingSelector).getAllByRole('checkbox')).toHaveLength(2)
        await user.click(within(editingSelector).getByRole('checkbox', { name: 'Tea' }))
        await user.click(screen.getByRole('button', { name: 'Save Lunch combo' }))
        await screen.findByText('Menu item updated.')
        expect(JSON.parse(fetchMock.mock.calls[2][1]?.body as string).comboItemIds).toEqual([1])
    })

    it('clears combo selections when changing back to an ordinary menu section', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([{
            id: 1, name: 'Dosa', description: null, section: 'Other', subsection: '', discountApplied: 0, price: 120, addOns: [],
        }]))
        const user = userEvent.setup()
        render(<MenuManager />)
        await screen.findByText('Dosa')
        await user.selectOptions(screen.getByLabelText('Main section'), 'Combo')
        await user.click(screen.getByRole('checkbox', { name: 'Dosa' }))
        await user.selectOptions(screen.getByLabelText('Main section'), 'Quick Bites')
        expect(screen.queryByLabelText('Find combo items')).not.toBeInTheDocument()
        await user.selectOptions(screen.getByLabelText('Main section'), 'Combo')
        expect(screen.getByRole('checkbox', { name: 'Dosa' })).not.toBeChecked()
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

        await userEvent.setup().click(await screen.findByText('Other'))

        expect(await screen.findByRole('table', { name: 'Saved menu items in Other' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Menu item' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Description' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Discount' })).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Price' })).toBeInTheDocument()
        expect(screen.getByText('Masala Dosa')).toBeInTheDocument()
        expect(screen.getByText('Crisp dosa')).toBeInTheDocument()
        expect(screen.getByText('10%')).toBeInTheDocument()
        expect(screen.getByText('₹180.00')).toBeInTheDocument()
        expect(screen.getAllByText('1 item')).toHaveLength(2)
    })

    it('keeps section and subsection lists collapsed until opened', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse([{
            id: 7,
            name: 'Classic Pizza',
            description: 'Classic pizza',
            section: 'Continental',
            subsection: 'Pizza',
            discountApplied: 0,
            price: 65,
            addOns: [],
        }]))
        const user = userEvent.setup()

        render(<MenuManager canManage={false} />)

        const continentalSummaryText = (await screen.findAllByText('Continental'))
            .find((element) => element.parentElement?.tagName === 'SUMMARY')!
        const continentalDisclosure = continentalSummaryText.parentElement!
        expect(continentalDisclosure).not.toHaveAttribute('open')
        expect(screen.getByRole('table', { name: 'Saved menu items in Continental / Pizza' })
            .closest('details')).not.toHaveAttribute('open')

        await user.click(continentalSummaryText)
        const pizzaSummaryText = screen.getAllByText('Pizza')
            .find((element) => element.parentElement?.tagName === 'SUMMARY')!
        const pizzaDisclosure = pizzaSummaryText.parentElement!
        expect(pizzaDisclosure).not.toHaveAttribute('open')

        await user.click(pizzaSummaryText)
        expect(screen.getByRole('table', { name: 'Saved menu items in Continental / Pizza' })).toBeInTheDocument()
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
        await userEvent.setup().click(screen.getByText('Other'))
        expect(screen.getByText('Masala Dosa')).toBeInTheDocument()
        expect(screen.getByRole('table', { name: 'Saved menu items in Other' })).toBeInTheDocument()
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

        await userEvent.setup().click(await screen.findByText('Other'))
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

        await user.click(await screen.findByText('Other'))
        await user.click(await screen.findByRole('button', { name: 'Delete Masala Dosa' }))
        await user.click(screen.getByRole('button', { name: 'Delete item' }))

        expect(await screen.findByText('We could not delete this menu item. Please try again.')).toBeInTheDocument()
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })
})