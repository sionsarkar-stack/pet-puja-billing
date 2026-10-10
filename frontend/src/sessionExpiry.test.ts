import { afterEach, expect, it, vi } from 'vitest'
import { installSessionExpiryHandler, SESSION_EXPIRED_EVENT } from './sessionExpiry'

const originalFetch = window.fetch

afterEach(() => {
    window.fetch = originalFetch
})

it('signals expiry only for 401s from protected API calls', async () => {
    window.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    installSessionExpiryHandler()
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)

    await window.fetch('/api/auth/login')
    expect(listener).not.toHaveBeenCalled()

    await window.fetch('/api/orders')
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
})
