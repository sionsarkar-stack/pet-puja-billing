import { type FormEvent, useEffect, useRef, useState } from 'react'
import { apiBaseUrl, currencyFormatter } from './financial'

type DiscountTier = {
    fromAmount: number | null
    toAmount: number | null
    discountPercent: number
}

type DiscountSettings = {
    enabled: boolean
    tiers: DiscountTier[]
}

type DiscountTierDraft = {
    key: number
    fromAmount: string
    toAmount: string
    discountPercent: string
}

type DiscountSettingsDraft = {
    enabled: boolean
    tiers: DiscountTierDraft[]
}

type DiscountMessage = {
    tone: 'error' | 'success'
    text: string
}

const emptySettings: DiscountSettingsDraft = { enabled: false, tiers: [] }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null
}

function isDiscountSettings(value: unknown): value is DiscountSettings {
    return isRecord(value)
        && typeof value.enabled === 'boolean'
        && Array.isArray(value.tiers)
        && value.tiers.every((tier) => isRecord(tier)
            && (typeof tier.fromAmount === 'number' || tier.fromAmount === null)
            && (typeof tier.toAmount === 'number' || tier.toAmount === null)
            && typeof tier.discountPercent === 'number')
}

function toDraft(settings: DiscountSettings, createKey: () => number): DiscountSettingsDraft {
    return {
        enabled: settings.enabled,
        tiers: settings.tiers.map((tier) => ({
            key: createKey(),
            fromAmount: tier.fromAmount === null ? '' : String(tier.fromAmount),
            toAmount: tier.toAmount === null ? '' : String(tier.toAmount),
            discountPercent: String(tier.discountPercent),
        })),
    }
}

function formatRange(tier: DiscountTier) {
    if (tier.fromAmount === null && tier.toAmount === null) return '₹0.00 and above'
    if (tier.fromAmount === null) return `Up to ${currencyFormatter.format(tier.toAmount!)}`
    if (tier.toAmount === null) return `${currencyFormatter.format(tier.fromAmount)} and above`
    return `${currencyFormatter.format(tier.fromAmount)} to ${currencyFormatter.format(tier.toAmount)}`
}

function validateSettings(draft: DiscountSettingsDraft): { error: string } | { payload: Omit<DiscountSettings, 'tiers'> & { tiers: DiscountTier[] } } {
    const tiers: DiscountTier[] = []
    for (const [index, tier] of draft.tiers.entries()) {
        const fromAmount = tier.fromAmount.trim() === '' ? null : Number(tier.fromAmount)
        const toAmount = tier.toAmount.trim() === '' ? null : Number(tier.toAmount)
        const discountPercent = tier.discountPercent.trim() === '' ? Number.NaN : Number(tier.discountPercent)
        if ((fromAmount !== null && (!Number.isFinite(fromAmount) || fromAmount < 0))
            || (toAmount !== null && (!Number.isFinite(toAmount) || toAmount < 0))
            || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
            return { error: `Enter valid amounts and a 0–100% discount for range ${index + 1}.` }
        }
        if (fromAmount !== null && toAmount !== null && fromAmount > toAmount) {
            return { error: `The “From” amount must not exceed “To” in range ${index + 1}.` }
        }
        tiers.push({ fromAmount, toAmount, discountPercent })
    }

    if (draft.enabled && tiers.length === 0) {
        return { error: 'Add at least one range or switch bill discounts off.' }
    }

    const orderedTiers = [...tiers].sort((leftTier, rightTier) =>
        (leftTier.fromAmount ?? 0) - (rightTier.fromAmount ?? 0))
    for (let index = 1; index < orderedTiers.length; index++) {
        const previousTo = orderedTiers[index - 1].toAmount
        const currentFrom = orderedTiers[index].fromAmount ?? 0
        if (previousTo === null || currentFrom <= previousTo) {
            return { error: 'Discount ranges overlap. Adjust their From/To amounts so only one range can match a bill.' }
        }
    }

    return { payload: { enabled: draft.enabled, tiers: orderedTiers } }
}

function DiscountManager({ canManage }: { canManage: boolean }) {
    const nextKey = useRef(0)
    const [draft, setDraft] = useState<DiscountSettingsDraft>(emptySettings)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<DiscountMessage | null>(null)

    function createKey() {
        const key = nextKey.current
        nextKey.current += 1
        return key
    }

    useEffect(() => {
        const controller = new AbortController()
        async function loadSettings() {
            try {
                const response = await fetch(`${apiBaseUrl}/api/discount-settings`, {
                    credentials: 'include',
                    signal: controller.signal,
                })
                if (!response.ok) throw new Error(`Discount settings load failed: ${response.status}`)
                const settings: unknown = await response.json()
                if (!isDiscountSettings(settings)) throw new Error('Discount settings response has an unexpected shape')
                setDraft(toDraft(settings, createKey))
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setMessage({ tone: 'error', text: 'We could not load bill discounts. Please try again.' })
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }
        void loadSettings()
        return () => controller.abort()
    }, [])

    function updateTier(key: number, field: keyof Omit<DiscountTierDraft, 'key'>, value: string) {
        setDraft((currentDraft) => ({
            ...currentDraft,
            tiers: currentDraft.tiers.map((tier) => tier.key === key ? { ...tier, [field]: value } : tier),
        }))
    }

    function addTier() {
        setDraft((currentDraft) => ({
            ...currentDraft,
            tiers: [...currentDraft.tiers, {
                key: createKey(),
                fromAmount: '',
                toAmount: '',
                discountPercent: '',
            }],
        }))
    }

    function removeTier(key: number) {
        setDraft((currentDraft) => ({
            ...currentDraft,
            tiers: currentDraft.tiers.filter((tier) => tier.key !== key),
        }))
    }

    function setDiscountEnabled(enabled: boolean) {
        setDraft((currentDraft) => ({
            ...currentDraft,
            enabled,
            tiers: enabled && currentDraft.tiers.length === 0
                ? [...currentDraft.tiers, { key: createKey(), fromAmount: '', toAmount: '', discountPercent: '' }]
                : currentDraft.tiers,
        }))
    }

    async function saveSettings(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const validation = validateSettings(draft)
        if ('error' in validation) {
            setMessage({ tone: 'error', text: validation.error })
            return
        }
        setIsSaving(true)
        setMessage(null)
        try {
            const response = await fetch(`${apiBaseUrl}/api/discount-settings`, {
                body: JSON.stringify(validation.payload),
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                method: 'PUT',
            })
            if (!response.ok) throw new Error(`Discount settings save failed: ${response.status}`)
            const settings: unknown = await response.json()
            if (!isDiscountSettings(settings)) throw new Error('Discount settings response has an unexpected shape')
            setDraft(toDraft(settings, createKey))
            setMessage({ tone: 'success', text: 'Bill discounts saved.' })
        } catch {
            setMessage({ tone: 'error', text: 'We could not save bill discounts. Please try again.' })
        } finally {
            setIsSaving(false)
        }
    }

    const savedTiers = draft.tiers.map((tier) => ({
        fromAmount: tier.fromAmount.trim() === '' ? null : Number(tier.fromAmount),
        toAmount: tier.toAmount.trim() === '' ? null : Number(tier.toAmount),
        discountPercent: Number(tier.discountPercent),
    })).filter((tier) => Number.isFinite(tier.discountPercent))

    return (
        <div className="discount-workspace">
            <header className="discount-page-heading">
                <div>
                    <p className="eyebrow">Details / Discount</p>
                    <h1>Bill discounts</h1>
                </div>
            </header>

            {isLoading && <p role="status">Loading discount settings...</p>}
            {!isLoading && !canManage && (
                <section aria-label="Bill discount settings" className="discount-readonly">
                    <p>Bill discounts are {draft.enabled ? 'enabled' : 'disabled'}.</p>
                    {savedTiers.length > 0 ? (
                        <ul>
                            {savedTiers.map((tier, index) => (
                                <li key={index}>{formatRange(tier)}: {tier.discountPercent}%</li>
                            ))}
                        </ul>
                    ) : <p>No discount ranges are configured.</p>}
                </section>
            )}
            {!isLoading && canManage && (
                <form className="discount-editor" noValidate onSubmit={saveSettings}>
                    <fieldset className="discount-enabled-fieldset" disabled={isSaving}>
                        <legend>Apply bill discounts</legend>
                        <label>
                            <input checked={draft.enabled} name="bill-discounts-enabled" onChange={() => setDiscountEnabled(true)} type="radio" />
                            Yes
                        </label>
                        <label>
                            <input checked={!draft.enabled} name="bill-discounts-enabled" onChange={() => setDiscountEnabled(false)} type="radio" />
                            No
                        </label>
                    </fieldset>

                    {draft.tiers.length > 0 && (
                        <div aria-label="Bill discount ranges" className="discount-tier-list">
                            <div className="discount-tier-heading" aria-hidden="true">
                                <span>From (INR)</span>
                                <span>To (INR)</span>
                                <span>Discount (%)</span>
                                <span></span>
                            </div>
                            {draft.tiers.map((tier, index) => (
                                <div className="discount-tier-row" key={tier.key}>
                                    <label>
                                        <span className="screen-reader-only">From amount for range {index + 1}; blank means 0</span>
                                        <input
                                            aria-label={`From amount for range ${index + 1}`}
                                            disabled={isSaving}
                                            inputMode="decimal"
                                            min="0"
                                            onChange={(event) => updateTier(tier.key, 'fromAmount', event.target.value)}
                                            placeholder="0"
                                            step="0.01"
                                            type="number"
                                            value={tier.fromAmount}
                                        />
                                    </label>
                                    <label>
                                        <span className="screen-reader-only">To amount for range {index + 1}; blank means no upper limit</span>
                                        <input
                                            aria-label={`To amount for range ${index + 1}`}
                                            disabled={isSaving}
                                            inputMode="decimal"
                                            min="0"
                                            onChange={(event) => updateTier(tier.key, 'toAmount', event.target.value)}
                                            placeholder="No limit"
                                            step="0.01"
                                            type="number"
                                            value={tier.toAmount}
                                        />
                                    </label>
                                    <label>
                                        <span className="screen-reader-only">Discount applied for range {index + 1} percent</span>
                                        <input
                                            aria-label={`Discount applied for range ${index + 1}`}
                                            disabled={isSaving}
                                            inputMode="decimal"
                                            max="100"
                                            min="0"
                                            onChange={(event) => updateTier(tier.key, 'discountPercent', event.target.value)}
                                            placeholder="0"
                                            step="0.01"
                                            type="number"
                                            value={tier.discountPercent}
                                        />
                                    </label>
                                    <button aria-label={`Remove discount range ${index + 1}`} disabled={isSaving} onClick={() => removeTier(tier.key)} type="button">
                                        Remove
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="discount-actions">
                        <button className="discount-add-tier" disabled={isSaving} onClick={addTier} type="button">Add range</button>
                        <button className="menu-save" disabled={isSaving} type="submit">{isSaving ? 'Saving...' : 'Save discounts'}</button>
                    </div>
                    {message && <p className={`menu-message menu-message-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}
                </form>
            )}
        </div>
    )
}

export default DiscountManager
