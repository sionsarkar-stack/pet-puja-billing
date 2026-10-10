export const SESSION_EXPIRED_EVENT = 'session-expired'

// Wraps fetch so any 401 from a protected API call tells the app the session ended.
export function installSessionExpiryHandler() {
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
        const response = await originalFetch(input, init)
        if (response.status === 401) {
            const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
            if (url.includes('/api/') && !url.includes('/api/auth/')) {
                window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
            }
        }
        return response
    }
}
