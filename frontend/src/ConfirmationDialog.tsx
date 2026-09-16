import { type ReactNode, useEffect, useId, useRef } from 'react'

type ConfirmationDialogProps = {
    children?: ReactNode
    confirmLabel: string
    isConfirming?: boolean
    message: string
    onCancel: () => void
    onConfirm: () => void
    title: string
    tone?: 'danger' | 'default'
}

function ConfirmationDialog({
    children,
    confirmLabel,
    isConfirming = false,
    message,
    onCancel,
    onConfirm,
    title,
    tone = 'default',
}: ConfirmationDialogProps) {
    const cancelButtonRef = useRef<HTMLButtonElement>(null)
    const dialogRef = useRef<HTMLElement>(null)
    const descriptionId = useId()
    const titleId = useId()

    useEffect(() => {
        cancelButtonRef.current?.focus()

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape' && !isConfirming) {
                onCancel()
                return
            }
            if (event.key !== 'Tab') return

            const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
            if (!buttons || buttons.length === 0) return

            const firstButton = buttons[0]
            const lastButton = buttons[buttons.length - 1]
            if (event.shiftKey && document.activeElement === firstButton) {
                event.preventDefault()
                lastButton.focus()
            } else if (!event.shiftKey && document.activeElement === lastButton) {
                event.preventDefault()
                firstButton.focus()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [isConfirming, onCancel])

    return (
        <div className="confirmation-backdrop">
            <section
                aria-describedby={descriptionId}
                aria-labelledby={titleId}
                aria-modal="true"
                className="confirmation-dialog"
                ref={dialogRef}
                role="alertdialog"
            >
                <p className="eyebrow">Confirm action</p>
                <h2 id={titleId}>{title}</h2>
                <p id={descriptionId}>{message}</p>
                {children && <div className="confirmation-dialog-details">{children}</div>}
                <div className="confirmation-dialog-actions">
                    <button disabled={isConfirming} onClick={onCancel} ref={cancelButtonRef} type="button">
                        Cancel
                    </button>
                    <button
                        className={tone === 'danger' ? 'confirmation-confirm-danger' : 'confirmation-confirm'}
                        disabled={isConfirming}
                        onClick={onConfirm}
                        type="button"
                    >
                        {isConfirming ? 'Saving...' : confirmLabel}
                    </button>
                </div>
            </section>
        </div>
    )
}

export default ConfirmationDialog