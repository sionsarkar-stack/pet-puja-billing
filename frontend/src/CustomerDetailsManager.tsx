import { type FormEvent, useEffect, useState } from 'react'
import ConfirmationDialog from './ConfirmationDialog'
import { apiBaseUrl, formatCustomerName, isCustomerDetails, isCustomerDetailsList, type CustomerDetails } from './financial'

function normalizePhoneNumber(value: string) {
    let digits = value.replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
    if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) digits = `91${digits}`
    if (!/^91[6-9]\d{9}$/.test(digits)) return null

    return `+${digits}`
}

function CustomerDetailsManager() {
    const [customers, setCustomers] = useState<CustomerDetails[]>([])
    const [search, setSearch] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingPhoneNumber, setEditingPhoneNumber] = useState<string | null>(null)
    const [nameDraft, setNameDraft] = useState('')
    const [phoneDraft, setPhoneDraft] = useState('')
    const [dateOfBirthDraft, setDateOfBirthDraft] = useState('')
    const [isSaving, setIsSaving] = useState(false)
    const [customerToRemove, setCustomerToRemove] = useState<CustomerDetails | null>(null)
    const [isRemoving, setIsRemoving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const normalizedSearch = search.trim().toLocaleLowerCase()
    const filteredCustomers = customers.filter((customer) => (
        `${customer.name ?? ''} ${customer.phoneNumber} ${customer.dateOfBirth ?? ''}`
            .toLocaleLowerCase()
            .includes(normalizedSearch)
    ))

    function startAddingCustomer() {
        setEditingPhoneNumber(null)
        setNameDraft('')
        setPhoneDraft('')
        setDateOfBirthDraft('')
        setIsFormOpen(true)
        setMessage(null)
    }

    function startEditingCustomer(customer: CustomerDetails) {
        setEditingPhoneNumber(customer.phoneNumber)
        setNameDraft(customer.name ?? '')
        setPhoneDraft(customer.phoneNumber)
        setDateOfBirthDraft(customer.dateOfBirth ?? '')
        setIsFormOpen(true)
        setMessage(null)
    }

    async function saveCustomer(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const phoneNumber = normalizePhoneNumber(phoneDraft)
        if (phoneNumber === null) {
            setMessage('Enter a valid phone number.')
            return
        }

        setIsSaving(true)
        setMessage(null)
        const isEditing = editingPhoneNumber !== null
        try {
            const response = await fetch(
                isEditing
                    ? `${apiBaseUrl}/api/customers/${encodeURIComponent(editingPhoneNumber)}`
                    : `${apiBaseUrl}/api/customers`,
                {
                    body: JSON.stringify({
                        dateOfBirth: dateOfBirthDraft || null,
                        name: nameDraft.trim() || null,
                        phoneNumber,
                    }),
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    method: isEditing ? 'PUT' : 'POST',
                },
            )
            if (response.status === 409) {
                setMessage('That phone number already belongs to another customer.')
                return
            }
            if (!response.ok) throw new Error(`Customer save failed: ${response.status}`)

            const savedCustomer: unknown = await response.json()
            if (!isCustomerDetails(savedCustomer)) throw new Error('Customer save response has an unexpected shape')
            setCustomers((currentCustomers) => [
                ...currentCustomers.filter((customer) => customer.phoneNumber !== editingPhoneNumber
                    && customer.phoneNumber !== savedCustomer.phoneNumber),
                savedCustomer,
            ].sort((firstCustomer, secondCustomer) => (
                (firstCustomer.name ?? '').localeCompare(secondCustomer.name ?? '')
                || firstCustomer.phoneNumber.localeCompare(secondCustomer.phoneNumber)
            )))
            setIsFormOpen(false)
            setMessage(isEditing ? 'Customer details updated.' : 'Customer added.')
        } catch {
            setMessage('We could not save this customer. Please try again.')
        } finally {
            setIsSaving(false)
        }
    }

    async function removeCustomer() {
        if (customerToRemove === null || isRemoving) return

        setIsRemoving(true)
        try {
            const response = await fetch(
                `${apiBaseUrl}/api/customers/${encodeURIComponent(customerToRemove.phoneNumber)}`,
                { credentials: 'include', method: 'DELETE' },
            )
            if (!response.ok) throw new Error(`Customer delete failed: ${response.status}`)

            setCustomers((currentCustomers) => currentCustomers.filter(
                (customer) => customer.phoneNumber !== customerToRemove.phoneNumber,
            ))
            setCustomerToRemove(null)
            setMessage('Customer removed. Saved order names remain in History.')
        } catch {
            setCustomerToRemove(null)
            setMessage('We could not remove this customer. Please try again.')
        } finally {
            setIsRemoving(false)
        }
    }

    useEffect(() => {
        const controller = new AbortController()

        async function loadCustomers() {
            try {
                const response = await fetch(`${apiBaseUrl}/api/customers`, {
                    credentials: 'include',
                    signal: controller.signal,
                })
                if (!response.ok) throw new Error(`Customer directory load failed: ${response.status}`)

                const result: unknown = await response.json()
                if (!isCustomerDetailsList(result)) throw new Error('Customer directory response has an unexpected shape')
                setCustomers(result)
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setErrorMessage('We could not load customer details. Please try again.')
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }

        void loadCustomers()
        return () => controller.abort()
    }, [])

    return (
        <div className="customer-workspace">
            <header className="history-page-heading customer-page-heading">
                <div>
                    <p className="eyebrow">Customers</p>
                    <h1>Customer details</h1>
                </div>
                <p>Profiles are added when customer details are saved on an order.</p>
            </header>

            <section aria-labelledby="customer-directory-heading" className="financial-list">
                <header className="financial-list-heading">
                    <div>
                        <p className="eyebrow">Saved profiles</p>
                        <h2 id="customer-directory-heading">Customer directory</h2>
                    </div>
                    <div className="customer-directory-actions">
                        <span>{filteredCustomers.length} {filteredCustomers.length === 1 ? 'customer' : 'customers'}</span>
                        <button className="customer-add-button" onClick={startAddingCustomer} type="button">
                            Add customer
                        </button>
                    </div>
                </header>

                {isFormOpen && (
                    <form aria-label={editingPhoneNumber === null ? 'Add customer' : 'Edit customer'} className="customer-editor" onSubmit={saveCustomer}>
                        <header>
                            <h3>{editingPhoneNumber === null ? 'Add customer' : 'Edit customer'}</h3>
                        </header>
                        <div className="customer-editor-fields">
                            <label htmlFor="customer-editor-name">
                                <span>Name (optional)</span>
                                <input
                                    autoComplete="name"
                                    id="customer-editor-name"
                                    maxLength={100}
                                    onChange={(event) => setNameDraft(event.target.value)}
                                    value={nameDraft}
                                />
                            </label>
                            <label htmlFor="customer-editor-phone">
                                <span>Phone number</span>
                                <input
                                    autoComplete="tel"
                                    id="customer-editor-phone"
                                    inputMode="tel"
                                    maxLength={32}
                                    onChange={(event) => setPhoneDraft(event.target.value)}
                                    required
                                    type="tel"
                                    value={phoneDraft}
                                />
                            </label>
                            <label htmlFor="customer-editor-date-of-birth">
                                <span>Date of birth (optional)</span>
                                <input
                                    id="customer-editor-date-of-birth"
                                    max={new Date().toISOString().slice(0, 10)}
                                    onChange={(event) => setDateOfBirthDraft(event.target.value)}
                                    type="date"
                                    value={dateOfBirthDraft}
                                />
                            </label>
                        </div>
                        <div className="customer-editor-actions">
                            <button className="customer-save-button" disabled={isSaving} type="submit">
                                {isSaving ? 'Saving...' : editingPhoneNumber === null ? 'Add customer' : 'Save changes'}
                            </button>
                            <button disabled={isSaving} onClick={() => setIsFormOpen(false)} type="button">Cancel</button>
                        </div>
                    </form>
                )}

                {message && <p className="customer-directory-message" role="status">{message}</p>}

                <label className="customer-search" htmlFor="customer-search">
                    <span>Search customers</span>
                    <input
                        id="customer-search"
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Name, phone, or date of birth"
                        type="search"
                        value={search}
                    />
                </label>

                {isLoading && <p className="financial-empty">Loading customer details...</p>}
                {!isLoading && errorMessage && <p className="financial-message financial-message-error" role="alert">{errorMessage}</p>}
                {!isLoading && !errorMessage && customers.length === 0 && (
                    <p className="financial-empty">No customer details have been saved yet.</p>
                )}
                {!isLoading && !errorMessage && customers.length > 0 && filteredCustomers.length === 0 && (
                    <p className="financial-empty">No customers match this search.</p>
                )}
                {!isLoading && !errorMessage && filteredCustomers.length > 0 && (
                    <div className="financial-table-wrap customer-table-wrap">
                        <table aria-label="Customer details" className="financial-table customer-table">
                            <thead>
                                <tr>
                                    <th scope="col">Name</th>
                                    <th scope="col">Phone number</th>
                                    <th scope="col">Date of birth</th>
                                    <th scope="col">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCustomers.map((customer) => (
                                    <tr key={customer.phoneNumber}>
                                        <td>{formatCustomerName(customer.name)}</td>
                                        <td>{customer.phoneNumber}</td>
                                        <td>{customer.dateOfBirth ?? 'NA'}</td>
                                        <td>
                                            <div className="customer-row-actions">
                                                <button
                                                    aria-label={`Edit ${customer.phoneNumber}`}
                                                    onClick={() => startEditingCustomer(customer)}
                                                    type="button"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    aria-label={`Remove ${customer.phoneNumber}`}
                                                    onClick={() => setCustomerToRemove(customer)}
                                                    type="button"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
            {customerToRemove && (
                <ConfirmationDialog
                    confirmLabel="Remove customer"
                    isConfirming={isRemoving}
                    message={`Remove ${formatCustomerName(customerToRemove.name)} (${customerToRemove.phoneNumber}) from the directory? Existing order names and bills will remain.`}
                    onCancel={() => setCustomerToRemove(null)}
                    onConfirm={() => void removeCustomer()}
                    title="Remove customer"
                    tone="danger"
                />
            )}
        </div>
    )
}

export default CustomerDetailsManager