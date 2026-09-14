import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the planned restaurant management capabilities', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ status: 'UP' }), { status: 200 }),
    )

    render(<App />)

    expect(screen.getByRole('heading', { name: /run the counter/i })).toBeInTheDocument()
    expect(screen.getByText('Billing & balance sheets')).toBeInTheDocument()
    expect(screen.getByText('Inventory checks')).toBeInTheDocument()
    expect(screen.getByText('Menu updates')).toBeInTheDocument()
    expect(await screen.findByText('API online')).toBeInTheDocument()
  })
})

