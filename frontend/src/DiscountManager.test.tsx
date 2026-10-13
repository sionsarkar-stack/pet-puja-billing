import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DiscountManager from './DiscountManager'

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
        status,
    })
}

describe('DiscountManager', () => {
    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it('saves open-ended amount ranges for Admin', async () => {
        const settings = {
            enabled: true,
            tiers: [
                { fromAmount: null, toAmount: 199.99, discountPercent: 5 },
                { fromAmount: 200, toAmount: null, discountPercent: 10 },
            ],
        }
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse({ enabled: false, tiers: [] }))
            .mockResolvedValueOnce(jsonResponse(settings))
        const user = userEvent.setup()

        render(<DiscountManager canManage />)

        await user.click(await screen.findByRole('radio', { name: 'Yes' }))
        await user.type(screen.getByLabelText('To amount for range 1'), '199.99')
        await user.type(screen.getByLabelText('Discount applied for range 1'), '5')
        await user.click(screen.getByRole('button', { name: 'Add range' }))
        await user.type(screen.getByLabelText('From amount for range 2'), '200')
        await user.type(screen.getByLabelText('Discount applied for range 2'), '10')
        await user.click(screen.getByRole('button', { name: 'Save discounts' }))

        expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/discount-settings', expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify(settings),
            credentials: 'include',
        }))
        expect(await screen.findByText('Bill discounts saved.')).toBeInTheDocument()
    })

    it('rejects overlapping ranges before saving', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({ enabled: false, tiers: [] }))
        const user = userEvent.setup()

        render(<DiscountManager canManage />)

        await user.click(await screen.findByRole('radio', { name: 'Yes' }))
        await user.type(screen.getByLabelText('From amount for range 1'), '200')
        await user.type(screen.getByLabelText('To amount for range 1'), '500')
        await user.type(screen.getByLabelText('Discount applied for range 1'), '10')
        await user.click(screen.getByRole('button', { name: 'Add range' }))
        await user.type(screen.getByLabelText('From amount for range 2'), '400')
        await user.type(screen.getByLabelText('To amount for range 2'), '1200')
        await user.type(screen.getByLabelText('Discount applied for range 2'), '15')
        await user.click(screen.getByRole('button', { name: 'Save discounts' }))

        expect(await screen.findByRole('alert')).toHaveTextContent('Discount ranges overlap')
        expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('shows saved ranges read-only to Captain even when disabled', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(jsonResponse({
            enabled: false,
            tiers: [{ fromAmount: null, toAmount: 500, discountPercent: 5 }],
        }))

        render(<DiscountManager canManage={false} />)

        expect(await screen.findByText('Bill discounts are disabled.')).toBeInTheDocument()
        expect(screen.getByText('Up to ₹500.00: 5%')).toBeInTheDocument()
        expect(screen.queryByRole('radio')).not.toBeInTheDocument()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
})
