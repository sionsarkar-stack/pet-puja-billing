import { useEffect, useRef, useState } from 'react'
import { apiBaseUrl } from './financial'

type MenuItem = {
    id: number
    name: string
    section: string
}

type RawMaterial = {
    rawMaterial: string
    quantity: string
}

type RawMaterialDraft = RawMaterial & {
    draftId: number
}

type ProductDetails = {
    menuItemId: number
    rawMaterials: RawMaterial[]
}

function isMenuItems(value: unknown): value is MenuItem[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'object' && item !== null
        && 'id' in item && typeof item.id === 'number'
        && 'name' in item && typeof item.name === 'string'
        && 'section' in item && typeof item.section === 'string')
}

function isProductDetails(value: unknown): value is ProductDetails {
    return typeof value === 'object' && value !== null
        && 'menuItemId' in value && typeof value.menuItemId === 'number'
        && 'rawMaterials' in value && Array.isArray(value.rawMaterials)
        && value.rawMaterials.every((item) => typeof item === 'object' && item !== null
            && 'rawMaterial' in item && typeof item.rawMaterial === 'string'
            && 'quantity' in item && typeof item.quantity === 'string')
}

function ProductDetailsManager({ canManage = false }: { canManage?: boolean }) {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([])
    const [selectedMenuItemId, setSelectedMenuItemId] = useState<number | null>(null)
    const [rawMaterials, setRawMaterials] = useState<RawMaterialDraft[]>([])
    const [loadedDetailsFor, setLoadedDetailsFor] = useState<number | null>(null)
    const [isLoadingMenu, setIsLoadingMenu] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [successMessage, setSuccessMessage] = useState<string | null>(null)
    const nextDraftId = useRef(0)

    function toDrafts(items: RawMaterial[]) {
        return items.map((item) => ({ ...item, draftId: ++nextDraftId.current }))
    }

    useEffect(() => {
        const controller = new AbortController()

        async function loadMenuItems() {
            setIsLoadingMenu(true)
            try {
                const response = await fetch(`${apiBaseUrl}/api/menu`, {
                    credentials: 'include',
                    signal: controller.signal,
                })
                if (!response.ok) throw new Error('Menu items could not be loaded.')
                const value: unknown = await response.json()
                if (!isMenuItems(value)) throw new Error('Menu items response was invalid.')
                setMenuItems(value)
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setErrorMessage(error instanceof Error ? error.message : 'Menu items could not be loaded.')
            } finally {
                if (!controller.signal.aborted) setIsLoadingMenu(false)
            }
        }

        void loadMenuItems()
        return () => controller.abort()
    }, [])

    useEffect(() => {
        if (selectedMenuItemId === null) return

        const controller = new AbortController()

        async function loadProductDetails() {
            try {
                const response = await fetch(`${apiBaseUrl}/api/menu/${selectedMenuItemId}/product-details`, {
                    credentials: 'include',
                    signal: controller.signal,
                })
                if (!response.ok) throw new Error('Product details could not be loaded.')
                const value: unknown = await response.json()
                if (!isProductDetails(value) || value.menuItemId !== selectedMenuItemId) {
                    throw new Error('Product details response was invalid.')
                }
                setRawMaterials(toDrafts(value.rawMaterials))
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setRawMaterials([])
                setErrorMessage(error instanceof Error ? error.message : 'Product details could not be loaded.')
            } finally {
                if (!controller.signal.aborted) setLoadedDetailsFor(selectedMenuItemId)
            }
        }

        void loadProductDetails()
        return () => controller.abort()
    }, [selectedMenuItemId])

    function addRawMaterial() {
        setRawMaterials((current) => [...current, {
            draftId: ++nextDraftId.current,
            quantity: '',
            rawMaterial: '',
        }])
        setErrorMessage(null)
        setSuccessMessage(null)
    }

    function selectMenuItem(value: string) {
        setSelectedMenuItemId(value ? Number(value) : null)
        setErrorMessage(null)
        setSuccessMessage(null)
    }

    function updateRawMaterial(draftId: number, field: keyof RawMaterial, value: string) {
        setRawMaterials((current) => current.map((item) => item.draftId === draftId ? { ...item, [field]: value } : item))
        setErrorMessage(null)
        setSuccessMessage(null)
    }

    function removeRawMaterial(draftId: number) {
        setRawMaterials((current) => current.filter((item) => item.draftId !== draftId))
        setErrorMessage(null)
        setSuccessMessage(null)
    }

    async function saveProductDetails() {
        if (selectedMenuItemId === null || isSaving || isLoadingDetails) return
        const payload = rawMaterials.map(({ rawMaterial, quantity }) => ({
            rawMaterial: rawMaterial.trim(),
            quantity: quantity.trim(),
        }))
        if (payload.some((item) => item.rawMaterial === '' || item.quantity === '')) {
            setErrorMessage('Enter both a raw material and quantity for every row, or remove the empty row.')
            setSuccessMessage(null)
            return
        }

        setIsSaving(true)
        setErrorMessage(null)
        setSuccessMessage(null)
        try {
            const response = await fetch(`${apiBaseUrl}/api/menu/${selectedMenuItemId}/product-details`, {
                body: JSON.stringify({ rawMaterials: payload }),
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                method: 'PUT',
            })
            if (!response.ok) throw new Error('Product details could not be saved.')
            const value: unknown = await response.json()
            if (!isProductDetails(value) || value.menuItemId !== selectedMenuItemId) {
                throw new Error('Product details response was invalid.')
            }
            setRawMaterials(toDrafts(value.rawMaterials))
            setSuccessMessage('Product details saved.')
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error ? error.message : 'Product details could not be saved.')
        } finally {
            setIsSaving(false)
        }
    }

    const isLoadingDetails = selectedMenuItemId !== null && loadedDetailsFor !== selectedMenuItemId
    const isBusy = isLoadingMenu || isLoadingDetails || isSaving
    const selectedMenuItem = menuItems.find((item) => item.id === selectedMenuItemId)

    return (
        <div className="product-details-manager">
            <header className="product-details-heading">
                <p className="eyebrow">Menu configuration</p>
                <h1>Product details</h1>
            </header>

            <label className="product-details-menu-select" htmlFor="product-details-menu-item">
                <span>Menu item</span>
                <select
                    disabled={isLoadingMenu || menuItems.length === 0 || isSaving}
                    id="product-details-menu-item"
                    onChange={(event) => selectMenuItem(event.target.value)}
                    value={selectedMenuItemId ?? ''}
                >
                    <option value="">Select a menu item</option>
                    {menuItems.map((item) => (
                        <option key={item.id} value={item.id}>{item.name} ({item.section})</option>
                    ))}
                </select>
            </label>

            {isLoadingMenu && <p className="financial-empty" role="status">Loading menu items...</p>}
            {!isLoadingMenu && menuItems.length === 0 && !errorMessage && <p className="financial-empty">No menu items available.</p>}
            {selectedMenuItem && (
                <section aria-label={`Raw materials for ${selectedMenuItem.name}`} className="product-details-recipe">
                    <header className="product-details-recipe-heading">
                        <div>
                            <p className="eyebrow">{selectedMenuItem.section}</p>
                            <h2>{selectedMenuItem.name}</h2>
                        </div>
                        {canManage && (
                            <button className="product-details-add" disabled={isBusy} onClick={addRawMaterial} type="button">
                                <span aria-hidden="true">+</span> Add raw material
                            </button>
                        )}
                    </header>

                    {isLoadingDetails ? (
                        <p className="financial-empty" role="status">Loading product details...</p>
                    ) : rawMaterials.length === 0 ? (
                        <p className="financial-empty">No raw materials recorded for this item.</p>
                    ) : (
                        <div className="product-details-list">
                            <div aria-hidden="true" className="product-details-row product-details-row-heading">
                                <span>Raw material</span>
                                <span>Quantity</span>
                                {canManage && <span />}
                            </div>
                            {rawMaterials.map((item, index) => (
                                <div className="product-details-row" key={item.draftId}>
                                    <input
                                        aria-label={`Raw material ${index + 1}`}
                                        disabled={!canManage || isBusy}
                                        maxLength={120}
                                        onChange={(event) => updateRawMaterial(item.draftId, 'rawMaterial', event.target.value)}
                                        placeholder="e.g. Rice flour"
                                        value={item.rawMaterial}
                                    />
                                    <input
                                        aria-label={`Quantity ${index + 1}`}
                                        disabled={!canManage || isBusy}
                                        maxLength={80}
                                        onChange={(event) => updateRawMaterial(item.draftId, 'quantity', event.target.value)}
                                        placeholder="e.g. 150 g"
                                        value={item.quantity}
                                    />
                                    {canManage && (
                                        <button
                                            aria-label={`Remove raw material ${index + 1}`}
                                            className="product-details-remove"
                                            disabled={isBusy}
                                            onClick={() => removeRawMaterial(item.draftId)}
                                            type="button"
                                        >Remove</button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                    {canManage && (
                        <div className="product-details-actions">
                            <button className="product-details-save" disabled={isBusy} onClick={() => void saveProductDetails()} type="button">
                                {isSaving ? 'Saving...' : 'Save product details'}
                            </button>
                        </div>
                    )}
                </section>
            )}

            {errorMessage && <p className="financial-message financial-message-error" role="alert">{errorMessage}</p>}
            {successMessage && <p className="table-order-message table-order-message-success" role="status">{successMessage}</p>}
        </div>
    )
}

export default ProductDetailsManager