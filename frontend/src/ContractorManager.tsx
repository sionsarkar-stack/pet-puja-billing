import { type FormEvent, useEffect, useState } from 'react'
import ConfirmationDialog from './ConfirmationDialog'
import { apiBaseUrl } from './financial'

type Contractor = {
    id: number
    name: string
    phoneNumber: string
    address: string | null
    contractType: string | null
    description: string | null
}

type ContractorDraft = Omit<Contractor, 'id'>

function isContractor(value: unknown): value is Contractor {
    return typeof value === 'object' && value !== null
        && 'id' in value && typeof value.id === 'number'
        && 'name' in value && typeof value.name === 'string'
        && 'phoneNumber' in value && typeof value.phoneNumber === 'string'
        && 'address' in value && (typeof value.address === 'string' || value.address === null)
        && 'contractType' in value && (typeof value.contractType === 'string' || value.contractType === null)
        && 'description' in value && (typeof value.description === 'string' || value.description === null)
}

function isContractors(value: unknown): value is Contractor[] {
    return Array.isArray(value) && value.every(isContractor)
}

function ContractorManager({ canManage = false }: { canManage?: boolean }) {
    const [contractors, setContractors] = useState<Contractor[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [isRemoving, setIsRemoving] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [contractorToRemove, setContractorToRemove] = useState<Contractor | null>(null)
    const [search, setSearch] = useState('')
    const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [draft, setDraft] = useState<ContractorDraft>({
        name: '',
        phoneNumber: '',
        address: '',
        contractType: '',
        description: '',
    })

    const normalizedSearch = search.trim().toLocaleLowerCase()
    const filteredContractors = contractors.filter((contractor) => (
        `${contractor.name} ${contractor.phoneNumber} ${contractor.address ?? ''} ${contractor.contractType ?? ''} ${contractor.description ?? ''}`
            .toLocaleLowerCase()
            .includes(normalizedSearch)
    ))

    useEffect(() => {
        const controller = new AbortController()

        async function loadContractors() {
            try {
                const response = await fetch(`${apiBaseUrl}/api/contractors`, {
                    credentials: 'include',
                    signal: controller.signal,
                })
                if (!response.ok) throw new Error('Contractor details could not be loaded.')
                const result: unknown = await response.json()
                if (!isContractors(result)) throw new Error('Contractor response was invalid.')
                setContractors(result)
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setErrorMessage(error instanceof Error ? error.message : 'Contractor details could not be loaded.')
            } finally {
                if (!controller.signal.aborted) setIsLoading(false)
            }
        }

        void loadContractors()
        return () => controller.abort()
    }, [])

    function updateDraft(field: keyof ContractorDraft, value: string) {
        setDraft((current) => ({ ...current, [field]: value }))
        setMessage(null)
    }

    function resetDraft() {
        setEditingId(null)
        setDraft({ name: '', phoneNumber: '', address: '', contractType: '', description: '' })
        setMessage(null)
    }

    function editContractor(contractor: Contractor) {
        setEditingId(contractor.id)
        setDraft({
            name: contractor.name,
            phoneNumber: contractor.phoneNumber,
            address: contractor.address ?? '',
            contractType: contractor.contractType ?? '',
            description: contractor.description ?? '',
        })
        setMessage(null)
    }

    async function saveContractor(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (isSaving) return

        const payload = {
            name: draft.name.trim(),
            phoneNumber: draft.phoneNumber.trim(),
            address: draft.address?.trim() || null,
            contractType: draft.contractType?.trim() || null,
            description: draft.description?.trim() || null,
        }
        if (!payload.name || !payload.phoneNumber) {
            setMessage({ tone: 'error', text: 'Name and phone number are required.' })
            return
        }

        setIsSaving(true)
        setMessage(null)
        const isEditing = editingId !== null
        try {
            const response = await fetch(
                isEditing ? `${apiBaseUrl}/api/contractors/${editingId}` : `${apiBaseUrl}/api/contractors`,
                {
                    body: JSON.stringify(payload),
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    method: isEditing ? 'PUT' : 'POST',
                },
            )
            if (!response.ok) throw new Error('Contractor details could not be saved.')
            const savedContractor: unknown = await response.json()
            if (!isContractor(savedContractor)) throw new Error('Contractor response was invalid.')
            setContractors((currentContractors) => [
                ...currentContractors.filter((contractor) => contractor.id !== savedContractor.id),
                savedContractor,
            ].sort((first, second) => first.name.localeCompare(second.name) || first.id - second.id))
            resetDraft()
            setMessage({ tone: 'success', text: isEditing ? 'Contractor details updated.' : 'Contractor added.' })
        } catch (error: unknown) {
            setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Contractor details could not be saved.' })
        } finally {
            setIsSaving(false)
        }
    }

    async function removeContractor() {
        if (contractorToRemove === null || isRemoving) return

        setIsRemoving(true)
        try {
            const response = await fetch(`${apiBaseUrl}/api/contractors/${contractorToRemove.id}`, {
                credentials: 'include',
                method: 'DELETE',
            })
            if (!response.ok) throw new Error('Contractor could not be removed.')
            setContractors((current) => current.filter((contractor) => contractor.id !== contractorToRemove.id))
            if (editingId === contractorToRemove.id) resetDraft()
            setMessage({ tone: 'success', text: 'Contractor removed.' })
            setContractorToRemove(null)
        } catch {
            setMessage({ tone: 'error', text: 'Contractor could not be removed. Please try again.' })
            setContractorToRemove(null)
        } finally {
            setIsRemoving(false)
        }
    }

    return (
        <div className="customer-workspace contractor-workspace">
            <header className="history-page-heading customer-page-heading">
                <div>
                    <p className="eyebrow">Directory</p>
                    <h1>Contractors</h1>
                </div>
                <p>Keep contractor contact and agreement details together.</p>
            </header>

            {canManage && (
                <form aria-label={editingId === null ? 'Add contractor' : 'Edit contractor'} className="customer-editor contractor-editor" onSubmit={(event) => void saveContractor(event)}>
                    <header>
                        <h3>{editingId === null ? 'Add contractor' : 'Edit contractor'}</h3>
                    </header>
                    <div className="customer-editor-fields contractor-editor-fields">
                        <label htmlFor="contractor-name">
                            <span>Name</span>
                            <input
                                autoComplete="name"
                                id="contractor-name"
                                maxLength={120}
                                onChange={(event) => updateDraft('name', event.target.value)}
                                required
                                value={draft.name}
                            />
                        </label>
                        <label htmlFor="contractor-phone">
                            <span>Phone number</span>
                            <input
                                autoComplete="tel"
                                id="contractor-phone"
                                inputMode="tel"
                                maxLength={32}
                                onChange={(event) => updateDraft('phoneNumber', event.target.value)}
                                pattern="[+0-9() .-]+"
                                required
                                type="tel"
                                value={draft.phoneNumber}
                            />
                        </label>
                        <label htmlFor="contractor-address">
                            <span>Address</span>
                            <textarea
                                id="contractor-address"
                                maxLength={500}
                                onChange={(event) => updateDraft('address', event.target.value)}
                                rows={2}
                                value={draft.address ?? ''}
                            />
                        </label>
                        <label htmlFor="contractor-type">
                            <span>Contract type</span>
                            <input
                                id="contractor-type"
                                maxLength={120}
                                onChange={(event) => updateDraft('contractType', event.target.value)}
                                value={draft.contractType ?? ''}
                            />
                        </label>
                        <label htmlFor="contractor-description">
                            <span>Description</span>
                            <textarea
                                id="contractor-description"
                                maxLength={1000}
                                onChange={(event) => updateDraft('description', event.target.value)}
                                rows={2}
                                value={draft.description ?? ''}
                            />
                        </label>
                    </div>
                    <div className="customer-editor-actions">
                        <button className="customer-save-button" disabled={isSaving} type="submit">
                            {isSaving ? 'Saving...' : editingId === null ? 'Add contractor' : 'Save changes'}
                        </button>
                        {editingId !== null && <button disabled={isSaving} onClick={resetDraft} type="button">Cancel</button>}
                    </div>
                </form>
            )}

            {message && <p className="customer-directory-message" role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p>}

            <section aria-labelledby="contractor-directory-heading" className="financial-list">
                <header className="financial-list-heading">
                    <div>
                        <p className="eyebrow">Saved records</p>
                        <h2 id="contractor-directory-heading">Contractor directory</h2>
                    </div>
                    <span>{filteredContractors.length} {filteredContractors.length === 1 ? 'contractor' : 'contractors'}</span>
                </header>

                <label className="customer-search" htmlFor="contractor-search">
                    <span>Search contractors</span>
                    <input
                        id="contractor-search"
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Name, phone, address, or contract type"
                        type="search"
                        value={search}
                    />
                </label>

                {isLoading && <p className="financial-empty" role="status">Loading contractors...</p>}
                {!isLoading && errorMessage && <p className="financial-message financial-message-error" role="alert">{errorMessage}</p>}
                {!isLoading && !errorMessage && contractors.length === 0 && <p className="financial-empty">No contractors have been saved yet.</p>}
                {!isLoading && !errorMessage && contractors.length > 0 && filteredContractors.length === 0 && <p className="financial-empty">No contractors match this search.</p>}
                {!isLoading && !errorMessage && filteredContractors.length > 0 && (
                    <div className="financial-table-wrap contractor-table-wrap">
                        <table aria-label="Contractor details" className="financial-table contractor-table">
                            <thead>
                                <tr>
                                    <th scope="col">Name</th>
                                    <th scope="col">Phone number</th>
                                    <th scope="col">Address</th>
                                    <th scope="col">Contract type</th>
                                    <th scope="col">Description</th>
                                    {canManage && <th scope="col">Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredContractors.map((contractor) => (
                                    <tr key={contractor.id}>
                                        <th scope="row">{contractor.name}</th>
                                        <td>{contractor.phoneNumber}</td>
                                        <td>{contractor.address || 'NA'}</td>
                                        <td>{contractor.contractType || 'NA'}</td>
                                        <td>{contractor.description || 'NA'}</td>
                                        {canManage && (
                                            <td>
                                                <div className="customer-row-actions">
                                                    <button aria-label={`Edit ${contractor.name}`} onClick={() => editContractor(contractor)} type="button">Edit</button>
                                                    <button aria-label={`Remove ${contractor.name}`} onClick={() => setContractorToRemove(contractor)} type="button">Remove</button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {contractorToRemove && (
                <ConfirmationDialog
                    confirmLabel="Remove contractor"
                    isConfirming={isRemoving}
                    message={`Remove ${contractorToRemove.name} (${contractorToRemove.phoneNumber}) from the contractor directory?`}
                    onCancel={() => setContractorToRemove(null)}
                    onConfirm={() => void removeContractor()}
                    title="Remove contractor"
                    tone="danger"
                />
            )}
        </div>
    )
}

export default ContractorManager