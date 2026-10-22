import { type FormEvent, useEffect, useState } from 'react'
import {
    apiBaseUrl,
    currencyFormatter,
    formatDateTime,
    isExpense,
    isExpenses,
    type Expense,
} from './financial'

type ExpenseDraft = {
    title: string
    amount: string
    addedBy: AddedByOption | ''
    keBhai: string
    description: string
}

type ExpenseMessage = {
    tone: 'error' | 'success'
    text: string
}

const addedByOptions = ['Rimo', 'Rjoe', 'Rishi', 'Dinda', 'Others'] as const
type AddedByOption = typeof addedByOptions[number]

const emptyDraft: ExpenseDraft = {
    title: '',
    amount: '',
    addedBy: '',
    keBhai: '',
    description: '',
}

function ExpensesManager() {
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [draft, setDraft] = useState<ExpenseDraft>(emptyDraft)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<ExpenseMessage | null>(null)

    useEffect(() => {
        const controller = new AbortController()

        async function loadExpenses() {
            try {
                const response = await fetch(`${apiBaseUrl}/api/expenses`, {
                    credentials: 'include',
                    signal: controller.signal,
                })

                if (!response.ok) {
                    throw new Error(`Expense load failed: ${response.status}`)
                }

                const savedExpenses = await response.json() as unknown
                if (!isExpenses(savedExpenses)) {
                    throw new Error('Expense response has an unexpected shape')
                }

                setExpenses(savedExpenses)
            } catch (error: unknown) {
                if (error instanceof DOMException && error.name === 'AbortError') return
                setMessage({ tone: 'error', text: 'We could not load expenses. Please try again.' })
            } finally {
                if (!controller.signal.aborted) {
                    setIsLoading(false)
                }
            }
        }

        void loadExpenses()

        return () => controller.abort()
    }, [])

    function updateDraft(field: keyof ExpenseDraft, value: string) {
        setDraft((currentDraft) => ({ ...currentDraft, [field]: value }))
    }

    async function saveExpense(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        const title = draft.title.trim()
        const amount = Number.parseFloat(draft.amount)
        if (!title || !Number.isFinite(amount) || amount <= 0) {
            setMessage({ tone: 'error', text: 'Enter an expense title and an amount greater than zero.' })
            return
        }
        if (!draft.addedBy) {
            setMessage({ tone: 'error', text: 'Select who added this expense.' })
            return
        }
        const keBhai = draft.keBhai.trim()
        if (draft.addedBy === 'Others' && !keBhai) {
            setMessage({ tone: 'error', text: 'Enter a name for Others.' })
            return
        }

        setIsSaving(true)
        setMessage(null)

        try {
            const response = await fetch(`${apiBaseUrl}/api/expenses`, {
                body: JSON.stringify({
                    addedBy: draft.addedBy,
                    amount,
                    description: draft.description.trim() || null,
                    title,
                    ...(draft.addedBy === 'Others' ? { keBhai } : {}),
                }),
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
            })

            if (!response.ok) {
                throw new Error(`Expense save failed: ${response.status}`)
            }

            const savedExpense = await response.json() as unknown
            if (!isExpense(savedExpense)) {
                throw new Error('Expense save response has an unexpected shape')
            }

            setExpenses((currentExpenses) => [savedExpense, ...currentExpenses])
            setDraft(emptyDraft)
            setMessage({ tone: 'success', text: 'Expense added.' })
        } catch {
            setMessage({ tone: 'error', text: 'We could not save this expense. Please try again.' })
        } finally {
            setIsSaving(false)
        }
    }

    return (
        <div className="expenses-workspace">
            <header className="expenses-page-heading">
                <div>
                    <p className="eyebrow">Expenses</p>
                    <h1>Expense register</h1>
                </div>
                <p>Record operational costs so the balance sheet reflects the actual result.</p>
            </header>

            <div className="expenses-layout">
                <form className="expense-editor" noValidate onSubmit={saveExpense}>
                    <div className="expense-editor-heading">
                        <p className="eyebrow">New expense</p>
                        <h2>Add an expense</h2>
                    </div>

                    <div className="field-group">
                        <label htmlFor="expense-title">Title</label>
                        <input
                            disabled={isSaving}
                            id="expense-title"
                            maxLength={120}
                            onChange={(event) => updateDraft('title', event.target.value)}
                            value={draft.title}
                        />
                    </div>

                    <div className="field-group expense-amount-field">
                        <label htmlFor="expense-amount">Amount (INR)</label>
                        <input
                            disabled={isSaving}
                            id="expense-amount"
                            inputMode="decimal"
                            min="0.01"
                            onChange={(event) => updateDraft('amount', event.target.value)}
                            step="0.01"
                            type="number"
                            value={draft.amount}
                        />
                    </div>

                    <fieldset aria-required="true" className="expense-added-by" disabled={isSaving}>
                        <legend>Added by <span aria-hidden="true">*</span></legend>
                        <div aria-label="Added by" className="expense-added-by-options" role="radiogroup">
                            {addedByOptions.map((option, index) => <label key={option}>
                                <input
                                    checked={draft.addedBy === option}
                                    name="expense-added-by"
                                    onChange={() => updateDraft('addedBy', option)}
                                    required={index === 0}
                                    type="radio"
                                    value={option}
                                />
                                <span>{option}</span>
                            </label>)}
                        </div>
                    </fieldset>

                    {draft.addedBy === 'Others' && (
                        <div className="field-group">
                            <label htmlFor="expense-ke-bhai">ke bhai <span aria-hidden="true">*</span></label>
                            <input
                                disabled={isSaving}
                                id="expense-ke-bhai"
                                maxLength={72}
                                onChange={(event) => updateDraft('keBhai', event.target.value)}
                                required
                                value={draft.keBhai}
                            />
                        </div>
                    )}

                    <div className="field-group">
                        <label htmlFor="expense-description">Description</label>
                        <textarea
                            disabled={isSaving}
                            id="expense-description"
                            maxLength={500}
                            onChange={(event) => updateDraft('description', event.target.value)}
                            rows={4}
                            value={draft.description}
                        />
                    </div>

                    {message && (
                        <p
                            aria-live="polite"
                            className={`financial-message financial-message-${message.tone}`}
                            role={message.tone === 'error' ? 'alert' : 'status'}
                        >
                            {message.text}
                        </p>
                    )}

                    <button className="expense-save" disabled={isSaving} type="submit">
                        {isSaving ? 'Saving...' : 'Add expense'}
                    </button>
                </form>

                <section aria-labelledby="recorded-expenses-heading" className="financial-list">
                    <header className="financial-list-heading">
                        <div>
                            <p className="eyebrow">Recorded expenses</p>
                            <h2 id="recorded-expenses-heading">Expense entries</h2>
                        </div>
                        <span>{expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}</span>
                    </header>

                    {isLoading && <p className="financial-empty">Loading expenses...</p>}
                    {!isLoading && expenses.length === 0 && <p className="financial-empty">No expenses added yet.</p>}

                    {!isLoading && expenses.length > 0 && (
                        <div className="financial-table-wrap expense-table-wrap">
                            <table aria-label="Recorded expenses" className="financial-table expense-table">
                                <thead>
                                    <tr>
                                        <th scope="col">Date</th>
                                        <th scope="col">Title</th>
                                        <th scope="col">Added by</th>
                                        <th scope="col">Description</th>
                                        <th scope="col">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.map((expense) => (
                                        <tr key={expense.id}>
                                            <td>{formatDateTime(expense.createdAt)}</td>
                                            <td>{expense.title}</td>
                                            <td>{expense.addedBy}</td>
                                            <td>{expense.description ?? '—'}</td>
                                            <td>{currencyFormatter.format(expense.amount)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </div>
    )
}

export default ExpensesManager