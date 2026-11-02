import { type FormEvent, useEffect, useState } from 'react'
import {
    apiBaseUrl,
    currencyFormatter,
    formatDateTime,
    getDateInputValue,
    isExpense,
    isExpenses,
    type Expense,
} from './financial'
import { downloadExpenseWorkbook, getExpenseExportEntries, type ExpenseExportPeriod } from './expenseExport'

type ExpenseDraft = {
    title: string
    amount: string
    addedBy: AddedByOption | ''
    description: string
}

type ExpenseMessage = {
    tone: 'error' | 'success'
    text: string
}

const addedByOptions = ['Rimo', 'Rjoe', 'Rishi', 'Dinda', 'Cash'] as const
type AddedByOption = typeof addedByOptions[number]

const emptyDraft: ExpenseDraft = {
    title: '',
    amount: '',
    addedBy: '',
    description: '',
}

function isAddedByOption(value: string): value is AddedByOption {
    return addedByOptions.some((option) => option === value)
}

function ExpensesManager() {
    const [expenses, setExpenses] = useState<Expense[]>([])
    const [draft, setDraft] = useState<ExpenseDraft>(emptyDraft)
    const [editingExpenseId, setEditingExpenseId] = useState<number | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState<ExpenseMessage | null>(null)
    const [exportPeriod, setExportPeriod] = useState<ExpenseExportPeriod>('day')
    const [exportDate, setExportDate] = useState(() => getDateInputValue(new Date()) ?? '')
    const [isExporting, setIsExporting] = useState(false)
    const [exportMessage, setExportMessage] = useState<ExpenseMessage | null>(null)
    const [loadFailed, setLoadFailed] = useState(false)

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
                setLoadFailed(true)
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

    function startEditing(expense: Expense) {
        setEditingExpenseId(expense.id)
        setDraft({
            title: expense.title,
            amount: String(expense.amount),
            addedBy: isAddedByOption(expense.addedBy) ? expense.addedBy : '',
            description: expense.description ?? '',
        })
        setMessage(null)
        document.getElementById('expense-title')?.focus()
    }

    function cancelEditing() {
        setEditingExpenseId(null)
        setDraft(emptyDraft)
        setMessage(null)
    }

    async function exportExpenses() {
        setExportMessage(null)
        setIsExporting(true)
        try {
            const now = new Date()
            const entries = getExpenseExportEntries(expenses, exportPeriod, exportDate, now)
            if (entries.length === 0) {
                setExportMessage({ tone: 'error', text: 'No expenses recorded for the selected period.' })
                return
            }
            const fileDate = exportPeriod === 'all' ? getDateInputValue(now) : exportDate
            await downloadExpenseWorkbook(entries, `expenses-${exportPeriod}-${fileDate}.xlsx`)
            setExportMessage({ tone: 'success', text: 'Expenses exported to Excel.' })
        } catch {
            setExportMessage({ tone: 'error', text: 'Could not export expenses. Check the selected date and try again.' })
        } finally {
            setIsExporting(false)
        }
    }

    const editedExpenseForForm = expenses.find((expense) => expense.id === editingExpenseId)
    const preservesEditedAddedBy = editingExpenseId !== null
        && editedExpenseForForm !== undefined
        && !isAddedByOption(editedExpenseForForm.addedBy)

    async function saveExpense(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        const title = draft.title.trim()
        const amount = Number.parseFloat(draft.amount)
        if (!title || !Number.isFinite(amount) || amount <= 0) {
            setMessage({ tone: 'error', text: 'Enter an expense title and an amount greater than zero.' })
            return
        }
        if (!draft.addedBy && !preservesEditedAddedBy) {
            setMessage({ tone: 'error', text: 'Select who added this expense.' })
            return
        }
        setIsSaving(true)
        setMessage(null)

        try {
            const response = await fetch(`${apiBaseUrl}/api/expenses${editingExpenseId === null ? '' : `/${editingExpenseId}`}`, {
                body: JSON.stringify({
                    addedBy: draft.addedBy || null,
                    amount,
                    description: draft.description.trim() || null,
                    title,
                }),
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                method: editingExpenseId === null ? 'POST' : 'PUT',
            })

            if (!response.ok) {
                throw new Error(`Expense save failed: ${response.status}`)
            }

            const savedExpense = await response.json() as unknown
            if (!isExpense(savedExpense)) {
                throw new Error('Expense save response has an unexpected shape')
            }

            setExpenses((currentExpenses) => editingExpenseId === null
                ? [savedExpense, ...currentExpenses]
                : currentExpenses.map((expense) => expense.id === savedExpense.id ? savedExpense : expense))
            setDraft(emptyDraft)
            setEditingExpenseId(null)
            setMessage({ tone: 'success', text: editingExpenseId === null ? 'Expense added.' : 'Expense updated.' })
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
                        <p className="eyebrow">{editingExpenseId === null ? 'New expense' : 'Edit expense'}</p>
                        <h2>{editingExpenseId === null ? 'Add an expense' : 'Edit expense details'}</h2>
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

                    <fieldset aria-required={!preservesEditedAddedBy} className="expense-added-by" disabled={isSaving || (editingExpenseId !== null && preservesEditedAddedBy)}>
                        <legend>Added by {!preservesEditedAddedBy && <span aria-hidden="true">*</span>}</legend>
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
                        {editingExpenseId !== null && preservesEditedAddedBy && editedExpenseForForm && <p className="expense-legacy-added-by">Existing attribution retained: {editedExpenseForForm.addedBy}</p>}
                    </fieldset>

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

                    <div className="expense-form-actions">
                        <button className="expense-save" disabled={isSaving} type="submit">
                            {isSaving ? 'Saving...' : editingExpenseId === null ? 'Add expense' : 'Save changes'}
                        </button>
                        {editingExpenseId !== null && <button className="expense-cancel" disabled={isSaving} onClick={cancelEditing} type="button">Cancel edit</button>}
                    </div>
                </form>

                <section aria-labelledby="recorded-expenses-heading" className="financial-list">
                    <header className="financial-list-heading">
                        <div>
                            <p className="eyebrow">Recorded expenses</p>
                            <h2 id="recorded-expenses-heading">Expense entries</h2>
                        </div>
                        <span>{expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}</span>
                    </header>

                    <div aria-label="Expense export" className="expense-export-controls" role="group">
                        <label>
                            <span>Export period</span>
                            <select disabled={isExporting} onChange={(event) => {
                                setExportPeriod(event.target.value as ExpenseExportPeriod)
                                setExportMessage(null)
                            }} value={exportPeriod}>
                                <option value="day">Day</option>
                                <option value="month">Month</option>
                                <option value="quarter">Quarter</option>
                                <option value="year">Year</option>
                                <option value="all">Till now</option>
                            </select>
                        </label>
                        {exportPeriod !== 'all' && <label>
                            <span>Export date (IST)</span>
                            <input disabled={isExporting} onChange={(event) => {
                                setExportDate(event.target.value)
                                setExportMessage(null)
                            }} type="date" value={exportDate} />
                        </label>}
                        <button className="expense-export-button" disabled={isLoading || loadFailed || isSaving || isExporting || expenses.length === 0 || (exportPeriod !== 'all' && !exportDate)} onClick={() => void exportExpenses()} type="button">
                            {isExporting ? 'Exporting...' : 'Download Excel'}
                        </button>
                    </div>
                    {exportMessage && <p className={`financial-message financial-message-${exportMessage.tone}`} role={exportMessage.tone === 'error' ? 'alert' : 'status'}>
                        {exportMessage.text}
                    </p>}

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
                                        <th scope="col">Actions</th>
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
                                            <td><div className="expense-row-actions">
                                                <button aria-label={`Edit ${expense.title}`} className="expense-edit-button" disabled={isSaving || isExporting} onClick={() => startEditing(expense)} type="button">Edit</button>
                                            </div></td>
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