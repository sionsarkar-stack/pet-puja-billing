import { useState } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DetailsManager from './DetailsManager'
import { RestaurantConfigurationContext } from './RestaurantConfiguration'
import type { UpiQrProvider } from './upiPayment'

vi.mock('./MenuManager', () => ({
    default: ({ canManage }: { canManage: boolean }) => <p>Menu {canManage ? 'editable' : 'read-only'}</p>,
}))

vi.mock('./ProductDetailsManager', () => ({
    default: ({ canManage }: { canManage: boolean }) => <p>Product details {canManage ? 'editable' : 'read-only'}</p>,
}))

vi.mock('./ContractorManager', () => ({
    default: ({ canManage }: { canManage: boolean }) => <p>Contractor {canManage ? 'editable' : 'read-only'}</p>,
}))

vi.mock('./DiscountManager', () => ({
    default: ({ canManage }: { canManage: boolean }) => <p>Discount {canManage ? 'editable' : 'read-only'}</p>,
}))

describe('DetailsManager', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('shows Menu, Product, Contractor, and Action subtabs with role-aware editing', async () => {
        const user = userEvent.setup()
        render(<DetailsManager mode="CAPTAIN" theme="light" onThemeChange={() => undefined} upiQrProvider="primary" onUpiQrProviderChange={() => undefined} />)

        expect(screen.getByRole('tab', { name: 'Menu' })).toHaveAttribute('aria-selected', 'true')
        expect(screen.getByText('Menu read-only')).toBeInTheDocument()
        await user.click(screen.getByRole('tab', { name: 'Product' }))
        expect(screen.getByText('Product details read-only')).toBeInTheDocument()
        await user.click(screen.getByRole('tab', { name: 'Contractor' }))
        expect(screen.getByText('Contractor read-only')).toBeInTheDocument()
        await user.click(screen.getByRole('tab', { name: 'Action' }))
        expect(screen.getByText('Discount read-only')).toBeInTheDocument()

        cleanup()
        render(<DetailsManager mode="ADMIN" theme="light" onThemeChange={() => undefined} upiQrProvider="primary" onUpiQrProviderChange={() => undefined} />)
        expect(screen.getByText('Menu editable')).toBeInTheDocument()
        await user.click(screen.getByRole('tab', { name: 'Product' }))
        expect(screen.getByText('Product details editable')).toBeInTheDocument()
        await user.click(screen.getByRole('tab', { name: 'Contractor' }))
        expect(screen.getByText('Contractor editable')).toBeInTheDocument()
        await user.click(screen.getByRole('tab', { name: 'Action' }))
        expect(screen.getByText('Discount editable')).toBeInTheDocument()
    })

    it('changes the selected app theme from the Theme tab', async () => {
        const user = userEvent.setup()
        const onThemeChange = vi.fn()
        render(<DetailsManager mode="ADMIN" theme="light" onThemeChange={onThemeChange} upiQrProvider="primary" onUpiQrProviderChange={() => undefined} />)

        await user.click(screen.getByRole('tab', { name: 'Theme' }))
        expect(screen.getByRole('radio', { name: /Light/ })).toBeChecked()
        await user.click(screen.getByRole('radio', { name: /Dark/ }))

        expect(onThemeChange).toHaveBeenCalledWith('dark')
    })

    it.each(['ADMIN', 'CAPTAIN'] as const)('selects the payment QR account from Action for %s', async (mode) => {
        function Harness() {
            const [provider, setProvider] = useState<UpiQrProvider>('primary')
            return <RestaurantConfigurationContext.Provider value={{ restaurantName: 'Restaurant', upiVpa: 'primary@upi', secondaryUpiVpa: 'secondary@upi' }}>
                <DetailsManager mode={mode} theme="dark" onThemeChange={() => undefined} upiQrProvider={provider} onUpiQrProviderChange={setProvider} />
            </RestaurantConfigurationContext.Provider>
        }
        const user = userEvent.setup()
        render(<Harness />)
        expect(screen.queryByRole('tab', { name: 'Discount' })).not.toBeInTheDocument()
        await user.click(screen.getByRole('tab', { name: 'Action' }))
        expect(screen.getByRole('radio', { name: /Primary/ })).toBeChecked()
        await user.click(screen.getByRole('radio', { name: /Secondary/ }))
        expect(screen.getByRole('radio', { name: /Secondary/ })).toBeChecked()
        await user.click(screen.getByRole('tab', { name: 'Menu' }))
        await user.click(screen.getByRole('tab', { name: 'Action' }))
        expect(screen.getByRole('radio', { name: /Secondary/ })).toBeChecked()
        expect(screen.getByText(`Discount ${mode === 'ADMIN' ? 'editable' : 'read-only'}`)).toBeInTheDocument()
    })
})
