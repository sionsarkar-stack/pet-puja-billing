import { expect, test } from '@playwright/test'
import type { OpenOrder, OpenOrderAddOn } from '../src/financial'

function orderLine(menuItemId: number, itemName: string, quantity: number, unitPrice: number, addOns: OpenOrderAddOn[] = []) {
    return { menuItemId, itemName, quantity, unitPrice, lineTotal: quantity * unitPrice, section: 'Mains', addOns }
}

function exampleOrders(): OpenOrder[] {
    return [
        {
            tableName: 'Table 1', completed: false, subtotal: 180, discountPercent: 10, discountAmount: 18, total: 162,
            lines: [orderLine(1, 'Milk tea', 2, 30), orderLine(2, 'Grilled sandwich', 1, 120)],
        },
        { tableName: 'Table 2', completed: true, total: 302, lines: [orderLine(3, 'Paneer meal', 1, 302)] },
        {
            tableName: 'Table 3', completed: false, total: 200,
            lines: ['Milk tea', 'Regular coffee', 'French fries', 'Grilled sandwich', 'Masala noodles', 'Paneer roll', 'Chocolate shake', 'Bottled water']
                .map((name, index) => orderLine(100 + index, name, 1, 25)),
        },
        { tableName: 'Table 4', tableLabel: 'Window side family table', completed: false, total: 90, lines: [orderLine(4, 'Fresh lime soda', 2, 45)] },
        {
            tableName: 'Outdoor 3', completed: false, total: 180,
            lines: [orderLine(5, 'Club sandwich', 1, 180, [{ id: 1, name: 'Egg', price: 20 }])],
        },
    ]
}

test.beforeEach(async ({ page }, testInfo) => {
    await page.addInitScript((theme) => localStorage.setItem('pet-puja-theme', theme), testInfo.project.name.endsWith('dark') ? 'dark' : 'light')
    const orders = exampleOrders()
    const menu = [
        { id: 1, name: 'Milk tea', price: 30, description: null, section: 'Beverages', subsection: '', discountApplied: 0, addOns: [] },
        { id: 2, name: 'Grilled sandwich', price: 120, description: null, section: 'Mains', subsection: '', discountApplied: 0, addOns: [] },
        { id: 6, name: 'Lemon tea', price: 40, description: null, section: 'Beverages', subsection: '', discountApplied: 0, addOns: [] },
    ]
    const customers = [
        { name: 'Asha Das', phoneNumber: '9876543210', dateOfBirth: '1992-05-14' },
        { name: 'Asha Roy', phoneNumber: '9876543211', dateOfBirth: null },
    ]
    await page.route('**/api/**', async (route) => {
        const request = route.request()
        const url = new URL(request.url())
        const path = url.pathname
        if (path === '/api/customers/search' && request.method() === 'GET') {
            const query = (url.searchParams.get('query') ?? '').trim().toLowerCase()
            await route.fulfill({
                json: customers.filter((customer) => query !== '' && (
                    customer.name.toLowerCase().includes(query) || customer.phoneNumber.includes(query)
                ))
            })
            return
        }
        if (path === '/api/open-orders' && request.method() === 'PUT') {
            const payload = request.postDataJSON() as Partial<Omit<OpenOrder, 'lines'>> & {
                tableName: string
                completed: boolean
                lines: { menuItemId: number; quantity: number; addOns?: OpenOrderAddOn[] }[]
            }
            const index = orders.findIndex((order) => order.tableName === payload.tableName)
            const previous = index < 0 ? undefined : orders[index]
            if (payload.lines.length === 0) {
                if (index >= 0) orders.splice(index, 1)
                await route.fulfill({ status: 204 })
                return
            }
            if (payload.lines.some((line) => !menu.some((item) => item.id === line.menuItemId)
                && !previous?.lines.some((existing) => existing.menuItemId === line.menuItemId))) {
                await route.fulfill({ status: 400, json: { message: 'Unknown menu item' } })
                return
            }
            const lines = payload.lines.map((line) => {
                const item = menu.find((item) => item.id === line.menuItemId)
                const existing = previous?.lines.find((existing) => existing.menuItemId === line.menuItemId)
                const addOns = line.addOns ?? existing?.addOns ?? []
                const unitPrice = item ? item.price + addOns.reduce((total, addOn) => total + addOn.price, 0) : existing!.unitPrice
                return {
                    ...orderLine(line.menuItemId, item?.name ?? existing!.itemName, line.quantity, unitPrice, addOns),
                    section: item?.section ?? existing?.section ?? 'Mains',
                }
            })
            const subtotal = lines.reduce((total, line) => total + line.lineTotal, 0)
            const discountPercent = payload.committeeDiscountPercent ?? previous?.committeeDiscountPercent ?? previous?.discountPercent ?? 0
            const discountAmount = Math.round(subtotal * discountPercent) / 100
            const updated = { ...previous, ...payload, lines, subtotal, total: subtotal - discountAmount, discountPercent, discountAmount }
            if (index < 0) orders.push(updated)
            else orders.splice(index, 1, updated)
            await route.fulfill({ json: updated })
            return
        }
        if (path === '/api/payments' && request.method() === 'POST') {
            const payload = request.postDataJSON() as { tableName: string; paymentMethod: string }
            const index = orders.findIndex((order) => order.tableName === payload.tableName)
            const [order] = orders.splice(index, 1)
            await route.fulfill({
                status: 201, json: {
                    id: 99, billNumber: 'PREVIEW-99', tableName: order.tableName, paymentMethod: payload.paymentMethod,
                    paidAt: new Date().toISOString(), total: order.total, cashAmount: order.total, onlineAmount: 0,
                    lines: order.lines, refund: null,
                }
            })
            return
        }
        if (path === '/api/open-orders/shift' && request.method() === 'PUT') {
            const payload = request.postDataJSON() as { fromTableName: string; toTableName: string }
            const index = orders.findIndex((order) => order.tableName === payload.fromTableName)
            if (index < 0) {
                await route.fulfill({ status: 404, json: { message: 'Open order not found' } })
                return
            }
            if (orders.some((order) => order.tableName === payload.toTableName)) {
                await route.fulfill({ status: 409, json: { message: 'Destination table occupied' } })
                return
            }
            const [source] = orders.splice(index, 1)
            const moved = { ...source, tableName: payload.toTableName }
            orders.push(moved)
            await route.fulfill({ json: moved })
            return
        }
        const fixtures: Record<string, unknown> = {
            '/api/public-config': { restaurantName: 'The Third Break', upiVpa: 'preview@upi' },
            '/api/auth/session': { authenticated: true, mode: 'ADMIN', username: 'table-preview' },
            '/api/daily-closings/status': { active: true, businessDate: '2026-10-22', startedAt: '2026-10-22T09:00:00Z' },
            '/api/backups/status': { available: false },
            '/api/menu': menu,
            '/api/open-orders': orders,
            '/api/committee-members': [],
        }
        await route.fulfill({ json: fixtures[path] ?? [] })
    })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Table 1', exact: true })).toBeVisible()
})

test('shows order details and discounted totals before opening a table', async ({ page }, testInfo) => {
    const table = page.locator('article.seating-card[data-seating-id="table-1"]')
    await expect(table.getByText('2 x', { exact: true })).toBeVisible()
    await expect(table.getByText(/Milk tea/)).toBeVisible()
    await expect(table.getByText('₹60.00', { exact: true })).toBeVisible()
    await expect(table.getByText(/Grilled sandwich/)).toBeVisible()
    await expect(table.getByText('3 items', { exact: true })).toBeVisible()
    await expect(table.locator('.seating-order-discount')).toHaveText('Discount-₹18.00')
    await expect(table.locator('.seating-order-total')).toHaveText('Total₹162.00')
    await expect(table.getByRole('button', { name: 'Table 1', exact: true })).toHaveAttribute('aria-expanded', 'false')
    await expect(table.locator('.seating-order-preview')).toBeVisible()
    await expect(page.locator('#selected-order-panel')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Table 5', exact: true })).toHaveCount(0)
    await expect(page.locator('.table-grid > article.seating-card')).toHaveCount(4)
    await expect(page.locator('.outdoor-grid > article.seating-card')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Outdoor 1', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Outdoor 2', exact: true })).toHaveCount(0)
    await expect(page.locator('article.seating-card[data-seating-id="table-2"]').getByText('Ready', { exact: true })).toBeVisible()
    if (testInfo.project.name.startsWith('mobile')) await page.setViewportSize({ width: 390, height: 2200 })
    const screenshot = testInfo.outputPath('running-tables.png')
    await page.locator('.seating-zone-table').screenshot({ path: screenshot, animations: 'disabled' })
    await testInfo.attach('Running table examples', { path: screenshot, contentType: 'image/png' })
})

test('shows full outdoor and long orders without inner scrollbars', async ({ page }, testInfo) => {
    const outdoor = page.locator('article.seating-card').filter({ has: page.getByRole('button', { name: 'Outdoor 3', exact: true }) })
    await expect(outdoor.getByText(/Club sandwich \+ Egg/)).toBeVisible()
    await expect(outdoor.locator('.seating-order-total')).toHaveText('Total₹180.00')
    const longOrder = page.locator('article.seating-card[data-seating-id="table-3"]')
    await expect(longOrder.locator('.seating-order-line')).toHaveCount(8)
    const dimensions = await longOrder.locator('.seating-order-lines').evaluate((element) => ({
        height: element.clientHeight, scrollHeight: element.scrollHeight,
        width: element.clientWidth, scrollWidth: element.scrollWidth,
        overflow: getComputedStyle(element).overflow,
    }))
    expect(dimensions.scrollHeight).toBe(dimensions.height)
    expect(dimensions.scrollWidth).toBe(dimensions.width)
    expect(dimensions.overflow).toBe('visible')
    expect(await longOrder.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(224)
    await expect(page.getByRole('button', { name: /Window side family table/, exact: true })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    expect(overflow).toBe(false)
    if (testInfo.project.name.startsWith('mobile')) await page.setViewportSize({ width: 390, height: 2200 })
    const screenshot = testInfo.outputPath('outdoor-tables.png')
    await page.locator('.seating-zone-outdoor').screenshot({ path: screenshot, animations: 'disabled' })
    await testInfo.attach('Outdoor table examples', { path: screenshot, contentType: 'image/png' })
    const longOrderScreenshot = testInfo.outputPath('long-order-table.png')
    await longOrder.screenshot({ path: longOrderScreenshot, animations: 'disabled' })
    await testInfo.attach('Expanded long order table', { path: longOrderScreenshot, contentType: 'image/png' })
})

test('updates the tile quantity and total after editing an order', async ({ page }) => {
    const table = page.locator('article.seating-card[data-seating-id="table-1"]')
    const header = table.getByRole('button', { name: 'Table 1', exact: true })
    await header.click()
    await table.getByRole('button', { name: 'Increase Milk tea quantity', exact: true }).click()
    await expect(table.getByRole('button', { name: 'Decrease Milk tea quantity', exact: true })).toBeEnabled()
    await header.click()
    await expect(table.locator('#selected-order-panel')).toHaveCount(0)
    await expect(table.getByText('3 x', { exact: true })).toBeVisible()
    await expect(table.locator('.seating-order-total')).toHaveText('Total₹189.00')
    await expect(table.getByText('₹90.00', { exact: true })).toBeVisible()
})

test('clears the tile summary only after payment confirmation', async ({ page }) => {
    const table = page.locator('article.seating-card[data-seating-id="table-2"]')
    await table.getByRole('button', { name: 'Table 2', exact: true }).click()
    await table.getByRole('button', { name: 'Paid by cash', exact: true }).click()
    await expect(table).toBeVisible()
    await expect(table.locator('#selected-order-panel')).toBeVisible()
    await page.getByRole('button', { name: 'Confirm cash payment', exact: true }).click()
    await expect(table).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Receipt PREVIEW-99', exact: true })).toBeVisible()
    await expect(page.locator('article.seating-card').getByRole('heading', { name: 'Receipt PREVIEW-99', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Close table', exact: true }).click()
    await expect(page.locator('#selected-order-panel')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Table 1', exact: true })).toBeVisible()
})

test('creates tables using plus with an optional name and closes unused drafts', async ({ page }) => {
    await page.getByRole('button', { name: 'Add table', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Table 5', exact: true })).toBeVisible()
    const tableName = page.getByLabel('Table name', { exact: true })
    await expect(tableName).toBeFocused()
    await expect(tableName).not.toHaveAttribute('required')
    await tableName.fill('Birthday group')
    await expect(page.getByRole('button', { name: 'Birthday group', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close empty table', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Birthday group', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'Add outdoor table', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Outdoor 4', exact: true })).toBeVisible()
    await expect(page.getByLabel('Table name', { exact: true })).toHaveValue('')
    await page.getByRole('button', { name: 'Close empty table', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Outdoor 4', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Outdoor 3', exact: true })).toBeVisible()
})

test('confirms shifts between indoor and outdoor and keeps the order intact', async ({ page }) => {
    const source = page.locator('article.seating-card[data-seating-id="table-1"]')
    await source.getByRole('button', { name: 'Table 1', exact: true }).click()
    await source.getByRole('button', { name: 'Shift to Outdoor', exact: true }).click()
    const firstConfirmation = page.getByRole('alertdialog', { name: 'Shift to Outdoor?' })
    await expect(firstConfirmation).toContainText('Table 1')
    await expect(firstConfirmation).toContainText('Outdoor 4')
    await expect(firstConfirmation).toContainText('₹162.00')
    await firstConfirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(source).toBeVisible()

    await source.getByRole('button', { name: 'Shift to Outdoor', exact: true }).click()
    await page.getByRole('alertdialog', { name: 'Shift to Outdoor?' }).getByRole('button', { name: 'Confirm shift to Outdoor 4', exact: true }).click()
    await expect(page.locator('article.seating-card[data-seating-id="table-1"]')).toHaveCount(0)
    const outdoor = page.locator('article.seating-card[data-seating-id="outdoor-4"]')
    await expect(outdoor).toBeVisible()
    await expect(outdoor.locator('#selected-order-panel')).toBeVisible()
    await expect(outdoor.locator('#selected-order-panel').getByRole('table', { name: 'Order for Outdoor 4' })).toContainText('₹162.00')
    await expect(outdoor.locator('#selected-order-panel').getByRole('table', { name: 'Order for Outdoor 4' })).toContainText('Grilled sandwich')
    await outdoor.getByRole('button', { name: 'Shift to Indoor', exact: true }).click()
    await page.getByRole('alertdialog', { name: 'Shift to Indoor?' }).getByRole('button', { name: 'Confirm shift to Table 5', exact: true }).click()
    const movedBack = page.locator('article.seating-card[data-seating-id="table-5"]')
    await expect(movedBack).toBeVisible()
    await expect(movedBack.locator('#selected-order-panel')).toBeVisible()
    await expect(movedBack.locator('#selected-order-panel').getByRole('table', { name: 'Order for Table 5' })).toContainText('₹162.00')
    await expect(movedBack.locator('.table-order-summary-heading > span')).toHaveText('2 items')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

test('does not show predefined tables when no orders are running', async ({ page }) => {
    await page.route('**/api/open-orders', (route) => route.fulfill({ json: [] }))
    await page.reload()
    await expect(page.locator('.workspace-page')).toBeVisible()
    const tableTab = page.locator('#desktop-tab-table')
    if (await tableTab.isVisible()) await tableTab.click()
    else await page.locator('#mobile-tab-table').click()
    await expect(page.getByRole('button', { name: 'Add table', exact: true })).toBeEnabled()
    await expect(page.locator('.table-grid > article.seating-card, .outdoor-grid > article.seating-card')).toHaveCount(0)
    await page.getByRole('button', { name: 'Add table', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Table 1', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Close empty table', exact: true }).click()
    await expect(page.locator('.table-grid > article.seating-card')).toHaveCount(0)
})

test('expands only one inline editor and toggles the same card closed', async ({ page }) => {
    const indoor = page.locator('article.seating-card[data-seating-id="table-1"]')
    const outdoor = page.locator('article.seating-card').filter({ has: page.getByRole('button', { name: 'Outdoor 3', exact: true }) })
    await indoor.getByRole('button', { name: 'Table 1', exact: true }).click()
    await expect(indoor.locator('#selected-order-panel')).toBeVisible()
    await expect(page.locator('#selected-order-panel')).toHaveCount(1)
    await expect(page.getByText('Selected seating', { exact: true })).toHaveCount(0)
    await outdoor.getByRole('button', { name: 'Outdoor 3', exact: true }).click()
    await expect(indoor.locator('#selected-order-panel')).toHaveCount(0)
    await expect(indoor.locator('.seating-order-preview')).toBeVisible()
    await expect(outdoor.locator('#selected-order-panel')).toBeVisible()
    await expect(page.locator('#selected-order-panel')).toHaveCount(1)
    await outdoor.getByRole('button', { name: 'Outdoor 3', exact: true }).click()
    await expect(page.locator('#selected-order-panel')).toHaveCount(0)
    await expect(outdoor.locator('.seating-order-preview')).toBeVisible()
})

test('edits an inline table and reads saved dishes, notes and contact back after reload', async ({ page }, testInfo) => {
    const table = page.locator('article.seating-card[data-seating-id="table-1"]')
    const editor = table.locator('#selected-order-panel')
    const saveOrder = async (action: () => Promise<unknown>) => {
        const responsePromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/open-orders'
            && response.request().method() === 'PUT')
        await action()
        const response = await responsePromise
        expect(response.ok()).toBe(true)
        await expect(editor.getByRole('button', { name: 'Increase Milk tea quantity', exact: true })).toBeEnabled()
        return response.json() as Promise<OpenOrder>
    }

    await table.getByRole('button', { name: 'Table 1', exact: true }).click()
    await expect(editor).toBeVisible()
    await expect(page.locator('#selected-order-panel')).toHaveCount(1)
    await expect(page.getByText('Selected seating', { exact: true })).toHaveCount(0)
    await editor.getByLabel('Table name', { exact: true }).fill('Garden friends')
    await saveOrder(() => editor.getByRole('button', { name: 'Save table name', exact: true }).click())
    await expect(table.getByRole('button', { name: 'Garden friends', exact: true })).toBeVisible()

    await editor.getByLabel('Menu item', { exact: true }).fill('Lemon tea')
    const lemonTea = editor.getByRole('checkbox', { name: 'Select Lemon tea', exact: true })
    await expect(lemonTea).not.toBeChecked()
    const added = await saveOrder(() => lemonTea.click())
    await expect(lemonTea).toBeChecked()
    expect(added.lines).toEqual(expect.arrayContaining([expect.objectContaining({ menuItemId: 6, quantity: 1 })]))
    await editor.getByLabel('Menu item', { exact: true }).press('Escape')
    await saveOrder(() => editor.getByRole('button', { name: 'Increase Milk tea quantity', exact: true }).click())
    const decreased = await saveOrder(() => editor.getByRole('button', { name: 'Decrease Milk tea quantity', exact: true }).click())
    expect(decreased.lines.find((line) => line.menuItemId === 1)?.quantity).toBe(2)
    const removed = await saveOrder(() => editor.getByRole('button', { name: 'Remove Lemon tea from Garden friends', exact: true }).click())
    expect(removed.lines.some((line) => line.menuItemId === 6)).toBe(false)
    await saveOrder(() => editor.getByRole('button', { name: 'Increase Milk tea quantity', exact: true }).click())

    const description = editor.locator('details.table-description-disclosure')
    await expect(description).not.toHaveAttribute('open', '')
    await description.locator('summary').filter({ hasText: /^Order description$/ }).click()
    await description.getByLabel('Order description (optional)', { exact: true }).fill('Less sugar; serve together.')
    await saveOrder(() => description.getByRole('button', { name: 'Save description', exact: true }).click())

    const contact = editor.locator('details.table-contact-disclosure')
    await expect(contact).not.toHaveAttribute('open', '')
    await contact.locator('summary').filter({ hasText: /^Contact details$/ }).click()
    await contact.getByLabel('Search by name or mobile', { exact: true }).fill('Asha')
    await contact.getByRole('button', { name: 'Search', exact: true }).click()
    await contact.getByRole('button', { name: 'Use Asha Das, 9876543210', exact: true }).click()
    const saved = await saveOrder(() => contact.getByRole('button', { name: 'Save details', exact: true }).click())
    expect(saved).toMatchObject({
        tableName: 'Table 1', tableLabel: 'Garden friends', orderDescription: 'Less sugar; serve together.',
        customerName: 'Asha Das', customerPhone: '+919876543210', customerDateOfBirth: '1992-05-14',
        subtotal: 210, discountPercent: 10, discountAmount: 21, total: 189,
    })

    const readBackPromise = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/open-orders'
        && response.request().method() === 'GET')
    await page.reload()
    const readBack = await (await readBackPromise).json() as OpenOrder[]
    expect(readBack.find((order) => order.tableName === 'Table 1')).toEqual(saved)
    await expect(table.locator('.seating-order-preview').getByText('3 x', { exact: true })).toBeVisible()
    await expect(table.locator('.seating-order-total')).toHaveText('Total₹189.00')
    await table.getByRole('button', { name: 'Garden friends', exact: true }).click()
    await expect(editor.getByLabel('Table name', { exact: true })).toHaveValue('Garden friends')
    await description.locator('summary').click()
    await expect(description.getByLabel('Order description (optional)', { exact: true })).toHaveValue('Less sugar; serve together.')
    await contact.locator('summary').click()
    const selectedCustomer = contact.getByRole('group', { name: 'Selected customer', exact: true })
    await expect(selectedCustomer.getByText('Asha Das', { exact: true })).toBeVisible()
    await expect(selectedCustomer.getByText('+919876543210', { exact: true })).toBeVisible()
    await expect(selectedCustomer.getByText('1992-05-14', { exact: true })).toBeVisible()
    await expect(editor.getByRole('button', { name: 'Remove Lemon tea from Garden friends', exact: true })).toHaveCount(0)
    expect(readBack.find((order) => order.tableName === 'Table 1')?.lines.find((line) => line.menuItemId === 1)?.quantity).toBe(3)
    await expect(page.locator('#selected-order-panel')).toHaveCount(1)
    await expect(page.locator('article.seating-card #selected-order-panel')).toHaveCount(1)
    await expect(page.getByText('Selected seating', { exact: true })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await contact.locator('summary').click()
    await description.locator('summary').click()
    await expect(contact).not.toHaveAttribute('open', '')
    await expect(description).not.toHaveAttribute('open', '')
    const headerHeight = await table.getByRole('button', { name: 'Garden friends', exact: true })
        .evaluate((element) => element.getBoundingClientRect().height)
    expect(headerHeight).toBeLessThan(96)
    const discountAmount = editor.locator('tfoot tr').filter({ hasText: 'Bill discount' }).locator('td').filter({ hasText: /^-₹21\.00$/ })
    await expect(discountAmount).toHaveText('-₹21.00')
    const currencyRects = await discountAmount.evaluate((element) => {
        const characterRects = (character: string) => {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
            while (walker.nextNode()) {
                const node = walker.currentNode
                const index = node.textContent?.indexOf(character) ?? -1
                if (index < 0) continue
                const range = document.createRange()
                range.setStart(node, index)
                range.setEnd(node, index + 1)
                return Array.from(range.getClientRects(), (rect) => ({ top: rect.top, height: rect.height }))
            }
            return []
        }
        return { minus: characterRects('-'), currency: characterRects('₹') }
    })
    expect(currencyRects.minus).toHaveLength(1)
    expect(currencyRects.currency).toHaveLength(1)
    expect(Math.abs(currencyRects.minus[0].top - currencyRects.currency[0].top)).toBeLessThan(1)
    expect(Math.abs(currencyRects.minus[0].height - currencyRects.currency[0].height)).toBeLessThan(1)
    const measurements = { project: testInfo.project.name, viewport: page.viewportSize(), headerHeight, currencyRects }
    console.log(JSON.stringify(measurements))
    await testInfo.attach('Inline layout measurements', { body: JSON.stringify(measurements, null, 2), contentType: 'application/json' })
    await page.setViewportSize(testInfo.project.name.startsWith('mobile')
        ? { width: 390, height: 2400 }
        : { width: 1440, height: 1600 })
    const screenshot = testInfo.outputPath('inline-table-editor.png')
    await table.screenshot({ path: screenshot, animations: 'disabled' })
    await testInfo.attach('Expanded inline table editor', { path: screenshot, contentType: 'image/png' })
})