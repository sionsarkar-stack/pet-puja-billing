import { type FormEvent, useEffect, useState } from 'react'
import ConfirmationDialog from './ConfirmationDialog'

type MenuItem = {
    id: number
    name: string
    description: string | null
    discountApplied: number
    price: number
}

type MenuDraft = {
    name: string
    description: string
    discountApplied: string
    price: string
}

type MenuPayload = {
    name: string
    description: string | null
    discountApplied: number
    price: number
}

type MenuMessage = {
    tone: 'error' | 'success'
    text: string
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

const emptyDraft: MenuDraft = {
    name: '',
    description: '',
    discountApplied: '0',
    price: '',
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
})

type MenuManagerProps = {
    canManage?: boolean
}

function isMenuItem(value: unknown): value is MenuItem {
    return typeof value === 'object'
        && value !== null
        && 'id' in value
        && typeof value.id === 'number'
        && 'name' in value
        && typeof value.name === 'string'
        && 'description' in value
        && (typeof value.description === 'string' || value.description === null)
        && 'discountApplied' in value
        && typeof value.discountApplied === 'number'
        && 'price' in value
        && typeof value.price === 'number'
}

function isMenuItems(value: unknown): value is MenuItem[] {
    return Array.isArray(value) && value.every(isMenuItem)
}

function sortMenuItems(items: MenuItem[]) {
    return [...items].sort((leftItem, rightItem) => leftItem.name.localeCompare(rightItem.name))
}

function validateMenuDraft(menuDraft: MenuDraft): { error: string } | { payload: MenuPayload } {
    const name = menuDraft.name.trim()
    const discountApplied = Number.parseFloat(menuDraft.discountApplied)
    const price = Number.parseFloat(menuDraft.price)

    if (!name || !Number.isFinite(discountApplied) || !Number.isFinite(price)) {
        return { error: 'Enter a name, discount, and price.' }
    }

    if (discountApplied < 0 || discountApplied > 100 || price < 0) {
        return { error: 'Discount must be between 0 and 100, and price cannot be negative.' }
    }

    return {
        payload: {
            name,
            description: menuDraft.description.trim() || null,
            discountApplied,
            price,
        },
    }
}

function MenuManager({ canManage = true }: MenuManagerProps) {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([])
    const [draft, setDraft] = useState<MenuDraft>(emptyDraft)
    const [editingMenuItemId, setEditingMenuItemId] = useState<number | null>(null)
    const [editingDraft, setEditingDraft] = useState<MenuDraft | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [updatingMenuItemId, setUpdatingMenuItemId] = useState<number | null>(null)
    const [deletingMenuItemId, setDeletingMenuItemId] = useState<number | null>(null)
    const [menuItemPendingDeletion, setMenuItemPendingDeletion] = useState<MenuItem | null>(null)
    const [message, setMessage] = useState<MenuMessage | null>(null)

    useEffect(() => {
        const controller = new AbortController()

        async function loadMenuItems() {
            try {
                const response = await fetch(`${apiBaseUrl}/api/menu`, {
                    credentials: 'include',
                    signal: controller.signal,
                })

                if (!response.ok) {
                    throw new Error(`Menu load failed: ${response.status}`)
                }

                const items = await response.json() as unknown
                if (!isMenuItems(items)) {
                    throw new Error('Menu response has an unexpected shape')
                }

                setMenuItems(sortMenuItems(items))
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setMessage({ tone: 'error', text: 'We could not load the menu. Please try again.' })
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false)
                }
            }
        }

        void loadMenuItems()

        return () => controller.abort()
    }, [])

    function updateDraft(field: keyof MenuDraft, value: string) {
        setDraft((currentDraft) => ({ ...currentDraft, [field]: value }))
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        const validation = validateMenuDraft(draft)
        if ('error' in validation) {
            setMessage({ tone: 'error', text: validation.error })
            return
        }

        setIsSaving(true)
        setMessage(null)

        try {
            const response = await fetch(`${apiBaseUrl}/api/menu`, {
                body: JSON.stringify(validation.payload),
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
            })

            if (!response.ok) {
                throw new Error(`Menu save failed: ${response.status}`)
            }

            const savedMenuItem = await response.json() as unknown
            if (!isMenuItem(savedMenuItem)) {
                throw new Error('Menu save response has an unexpected shape')
            }

            setMenuItems((currentItems) => sortMenuItems(
                [...currentItems, savedMenuItem],
            ))
            setDraft(emptyDraft)
            setMessage({ tone: 'success', text: 'Menu item added.' })
        } catch {
            setMessage({ tone: 'error', text: 'We could not save this menu item. Please try again.' })
        } finally {
            setIsSaving(false)
        }
    }

    function beginEditing(menuItem: MenuItem) {
        setEditingDraft({
            name: menuItem.name,
            description: menuItem.description ?? '',
            discountApplied: String(menuItem.discountApplied),
            price: String(menuItem.price),
        })
        setEditingMenuItemId(menuItem.id)
        setMessage(null)
    }

    function cancelEditing() {
        setEditingMenuItemId(null)
        setEditingDraft(null)
    }

    function updateEditingDraft(field: keyof MenuDraft, value: string) {
        setEditingDraft((currentDraft) => currentDraft === null
            ? currentDraft
            : { ...currentDraft, [field]: value })
    }

    async function updateMenuItem(menuItem: MenuItem) {
        if (editingMenuItemId !== menuItem.id || editingDraft === null) {
            return
        }

        const validation = validateMenuDraft(editingDraft)
        if ('error' in validation) {
            setMessage({ tone: 'error', text: validation.error })
            return
        }

        setUpdatingMenuItemId(menuItem.id)
        setMessage(null)

        try {
            const response = await fetch(`${apiBaseUrl}/api/menu/${menuItem.id}`, {
                body: JSON.stringify(validation.payload),
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                method: 'PUT',
            })

            if (!response.ok) {
                throw new Error(`Menu update failed: ${response.status}`)
            }

            const savedMenuItem = await response.json() as unknown
            if (!isMenuItem(savedMenuItem)) {
                throw new Error('Menu update response has an unexpected shape')
            }

            setMenuItems((currentItems) => sortMenuItems(
                currentItems.map((currentItem) => currentItem.id === savedMenuItem.id ? savedMenuItem : currentItem),
            ))
            cancelEditing()
            setMessage({ tone: 'success', text: 'Menu item updated.' })
        } catch {
            setMessage({ tone: 'error', text: 'We could not save this menu item. Please try again.' })
        } finally {
            setUpdatingMenuItemId(null)
        }
    }

    async function deleteMenuItem(menuItem: MenuItem) {
        setDeletingMenuItemId(menuItem.id)
        setMessage(null)

        try {
            const response = await fetch(`${apiBaseUrl}/api/menu/${menuItem.id}`, {
                credentials: 'include',
                method: 'DELETE',
            })

            if (!response.ok) {
                throw new Error(`Menu deletion failed: ${response.status}`)
            }

            setMenuItems((currentItems) => currentItems.filter((currentItem) => currentItem.id !== menuItem.id))
            if (editingMenuItemId === menuItem.id) {
                setEditingMenuItemId(null)
                setEditingDraft(null)
            }
            setMenuItemPendingDeletion(null)
            setMessage({ tone: 'success', text: 'Menu item deleted.' })
        } catch {
            setMenuItemPendingDeletion(null)
            setMessage({ tone: 'error', text: 'We could not delete this menu item. Please try again.' })
        } finally {
            setDeletingMenuItemId(null)
        }
    }

    function requestMenuItemDeletion(menuItem: MenuItem) {
        setMenuItemPendingDeletion(menuItem)
        setMessage(null)
    }

    return (
        <div className="menu-workspace">
            <header className="menu-page-heading">
                <div>
                    <p className="eyebrow">Menu</p>
                    <h1>{canManage ? 'Menu editor' : 'Menu'}</h1>
                </div>
                <p>Keep the dishes and prices at the counter current.</p>
            </header>

            <div className="menu-layout">
                {canManage && <form className="menu-editor" noValidate onSubmit={handleSubmit}>
                    <div className="menu-editor-heading">
                        <p className="eyebrow">New item</p>
                        <h2>Add a dish</h2>
                    </div>

                    <div className="field-group">
                        <label htmlFor="menu-name">Name</label>
                        <input
                            disabled={isSaving}
                            id="menu-name"
                            maxLength={120}
                            name="name"
                            onChange={(event) => updateDraft('name', event.target.value)}
                            required
                            value={draft.name}
                        />
                    </div>

                    <div className="field-group">
                        <label htmlFor="menu-description">Description</label>
                        <textarea
                            disabled={isSaving}
                            id="menu-description"
                            maxLength={500}
                            name="description"
                            onChange={(event) => updateDraft('description', event.target.value)}
                            rows={4}
                            value={draft.description}
                        />
                    </div>

                    <div className="menu-number-fields">
                        <div className="field-group">
                            <label htmlFor="menu-discount">Discount applied (%)</label>
                            <input
                                disabled={isSaving}
                                id="menu-discount"
                                inputMode="decimal"
                                max="100"
                                min="0"
                                name="discountApplied"
                                onChange={(event) => updateDraft('discountApplied', event.target.value)}
                                required
                                step="0.01"
                                type="number"
                                value={draft.discountApplied}
                            />
                        </div>

                        <div className="field-group">
                            <label htmlFor="menu-price">Price (INR)</label>
                            <input
                                disabled={isSaving}
                                id="menu-price"
                                inputMode="decimal"
                                min="0"
                                name="price"
                                onChange={(event) => updateDraft('price', event.target.value)}
                                required
                                step="0.01"
                                type="number"
                                value={draft.price}
                            />
                        </div>
                    </div>

                    {message && (
                        <p
                            aria-live="polite"
                            className={`menu-message menu-message-${message.tone}`}
                            role={message.tone === 'error' ? 'alert' : 'status'}
                        >
                            {message.text}
                        </p>
                    )}

                    <div className="menu-editor-actions">
                        <button className="menu-save" disabled={isSaving} type="submit">
                            {isSaving ? 'Saving...' : 'Add menu item'}
                        </button>
                    </div>
                </form>}

                <section aria-labelledby="current-menu-heading" className="menu-list">
                    <header className="menu-list-heading">
                        <div>
                            <p className="eyebrow">Saved menu</p>
                            <h2 id="current-menu-heading">Current menu</h2>
                        </div>
                        <span>{menuItems.length} {menuItems.length === 1 ? 'item' : 'items'}</span>
                    </header>

                    {isLoading && <p className="menu-empty-state">Loading menu...</p>}
                    {!isLoading && menuItems.length === 0 && (
                        <p className="menu-empty-state">No menu items yet.</p>
                    )}

                    {!isLoading && menuItems.length > 0 && (
                        <div className="menu-table-wrap">
                            <table aria-label="Saved menu items" className="menu-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Name</th>
                                        <th scope="col">Description</th>
                                        <th scope="col">Discount</th>
                                        <th scope="col">Price</th>
                                        {canManage && <th scope="col">Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {menuItems.map((menuItem) => {
                                        const isEditing = editingMenuItemId === menuItem.id && editingDraft !== null
                                        const isUpdating = updatingMenuItemId === menuItem.id
                                        const isDeleting = deletingMenuItemId === menuItem.id

                                        return (
                                            <tr className={isEditing ? 'menu-table-row-editing' : undefined} key={menuItem.id}>
                                                <td>
                                                    {isEditing ? (
                                                        <input
                                                            aria-label={`Name for ${menuItem.name}`}
                                                            disabled={isUpdating}
                                                            maxLength={120}
                                                            onChange={(event) => updateEditingDraft('name', event.target.value)}
                                                            value={editingDraft.name}
                                                        />
                                                    ) : menuItem.name}
                                                </td>
                                                <td>
                                                    {isEditing ? (
                                                        <input
                                                            aria-label={`Description for ${menuItem.name}`}
                                                            disabled={isUpdating}
                                                            maxLength={500}
                                                            onChange={(event) => updateEditingDraft('description', event.target.value)}
                                                            value={editingDraft.description}
                                                        />
                                                    ) : menuItem.description || 'No description'}
                                                </td>
                                                <td>
                                                    {isEditing ? (
                                                        <input
                                                            aria-label={`Discount applied for ${menuItem.name}`}
                                                            disabled={isUpdating}
                                                            inputMode="decimal"
                                                            max="100"
                                                            min="0"
                                                            onChange={(event) => updateEditingDraft('discountApplied', event.target.value)}
                                                            step="0.01"
                                                            type="number"
                                                            value={editingDraft.discountApplied}
                                                        />
                                                    ) : `${menuItem.discountApplied}%`}
                                                </td>
                                                <td>
                                                    {isEditing ? (
                                                        <input
                                                            aria-label={`Price for ${menuItem.name}`}
                                                            disabled={isUpdating}
                                                            inputMode="decimal"
                                                            min="0"
                                                            onChange={(event) => updateEditingDraft('price', event.target.value)}
                                                            step="0.01"
                                                            type="number"
                                                            value={editingDraft.price}
                                                        />
                                                    ) : currencyFormatter.format(menuItem.price)}
                                                </td>
                                                {canManage && <td>
                                                    <div className="menu-item-actions">
                                                        {isEditing ? (
                                                            <>
                                                                <button
                                                                    aria-label={`Save ${menuItem.name}`}
                                                                    disabled={isUpdating}
                                                                    onClick={() => void updateMenuItem(menuItem)}
                                                                    type="button"
                                                                >
                                                                    {isUpdating ? 'Saving...' : 'Save'}
                                                                </button>
                                                                <button
                                                                    aria-label={`Cancel editing ${menuItem.name}`}
                                                                    disabled={isUpdating}
                                                                    onClick={cancelEditing}
                                                                    type="button"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                aria-label={`Edit ${menuItem.name}`}
                                                                disabled={isSaving || isDeleting || isUpdating}
                                                                onClick={() => beginEditing(menuItem)}
                                                                type="button"
                                                            >
                                                                Edit
                                                            </button>
                                                        )}
                                                        <button
                                                            aria-label={`Delete ${menuItem.name}`}
                                                            disabled={isSaving || isUpdating || isDeleting}
                                                            onClick={() => requestMenuItemDeletion(menuItem)}
                                                            type="button"
                                                        >
                                                            {isDeleting ? 'Deleting...' : 'Delete'}
                                                        </button>
                                                    </div>
                                                </td>}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>

            {menuItemPendingDeletion && (
                <ConfirmationDialog
                    confirmLabel="Delete item"
                    isConfirming={deletingMenuItemId === menuItemPendingDeletion.id}
                    message={`Remove ${menuItemPendingDeletion.name} from the active menu? It will no longer be available for new orders.`}
                    onCancel={() => setMenuItemPendingDeletion(null)}
                    onConfirm={() => void deleteMenuItem(menuItemPendingDeletion)}
                    title={`Delete ${menuItemPendingDeletion.name}?`}
                    tone="danger"
                />
            )}
        </div>
    )
}

export default MenuManager