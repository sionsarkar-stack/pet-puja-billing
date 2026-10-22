import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DetailsManager from './DetailsManager'

vi.mock('./MenuManager', () => ({
    default: ({ canManage }: { canManage: boolean }) => <p>Menu {canManage ? 'editable' : 'read-only'}</p>,
}))

vi.mock('./DiscountManager', () => ({
    default: ({ canManage }: { canManage: boolean }) => <p>Discount {canManage ? 'editable' : 'read-only'}</p>,
}))

describe('DetailsManager', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('shows Menu and Discount subtabs with role-aware editing', async () => {
        const user = userEvent.setup()
        render(<DetailsManager mode="CAPTAIN" theme="light" onThemeChange={() => undefined} />)

        expect(screen.getByRole('tab', { name: 'Menu' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Menu read-only')).toBeInTheDocument()
        await user.click(screen.getByRole('tab', { name: 'Discount' }))
        expect(screen.getByText('Discount read-only')).toBeInTheDocument()

        cleanup()
        render(<DetailsManager mode="ADMIN" theme="light" onThemeChange={() => undefined} />)
        expect(screen.getByText('Menu editable')).toBeInTheDocument()
        await user.click(screen.getByRole('tab', { name: 'Discount' }))
        expect(screen.getByText('Discount editable')).toBeInTheDocument()
    })

    it('changes the selected app theme from the Theme tab', async () => {
        const user = userEvent.setup()
        const onThemeChange = vi.fn()
        render(<DetailsManager mode="ADMIN" theme="light" onThemeChange={onThemeChange} />)

        await user.click(screen.getByRole('tab', { name: 'Theme' }))
        expect(screen.getByRole('radio', { name: /Light/ })).toBeChecked()
        await user.click(screen.getByRole('radio', { name: /Dark/ }))

        expect(onThemeChange).toHaveBeenCalledWith('dark')
    })
})
