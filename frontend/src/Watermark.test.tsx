import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import App from './App'

afterEach(() => vi.useRealTimers())

it('shows the watermark splash for two seconds before the app', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
    render(<App />)
    expect(screen.getByText('Designed by DInda')).toBeInTheDocument()
    expect(screen.getByText(/With Love to Rimo da/)).toBeInTheDocument()

    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(document.querySelector('.splash-screen')).toBeNull()
    expect(screen.getByText('Designed by DInda')).toBeInTheDocument()
    vi.unstubAllGlobals()
})
