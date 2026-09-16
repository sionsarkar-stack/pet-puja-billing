import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ConfirmationDialog from './ConfirmationDialog'

describe('ConfirmationDialog', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('starts on cancel and keeps keyboard focus inside the final confirmation', async () => {
        const onCancel = vi.fn()
        const user = userEvent.setup()

        render(
            <ConfirmationDialog
                confirmLabel="Confirm payment"
                message="Record this payment?"
                onCancel={onCancel}
                onConfirm={() => { }}
                title="Confirm payment"
            />,
        )

        const cancelButton = screen.getByRole('button', { name: 'Cancel' })
        const confirmButton = screen.getByRole('button', { name: 'Confirm payment' })
        expect(cancelButton).toHaveFocus()

        await user.tab()
        expect(confirmButton).toHaveFocus()
        await user.tab()
        expect(cancelButton).toHaveFocus()

        await user.keyboard('{Escape}')
        expect(onCancel).toHaveBeenCalledOnce()
    })
})