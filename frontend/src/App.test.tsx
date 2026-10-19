import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  })
}

const restaurantConfiguration = {
  restaurantName: 'The Third Break',
  upiVpa: 'sionsarkar@okicici',
}

describe('App', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows the team login form when no session exists', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(restaurantConfiguration))
      .mockResolvedValueOnce(jsonResponse({ authenticated: false, username: null }))

    render(<App splashDuration={0} />)

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'The Third Break home' })).toBeInTheDocument()
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('submits credentials and shows the signed-in state', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(restaurantConfiguration))
      .mockResolvedValueOnce(jsonResponse({ authenticated: false, username: null }))
      .mockResolvedValueOnce(jsonResponse({ mode: 'ADMIN', username: 'restaurant-owner' }))
      .mockResolvedValueOnce(jsonResponse({ active: false, businessDate: null, startedAt: null }))
      .mockResolvedValueOnce(jsonResponse({ available: true }))
    const user = userEvent.setup()

    render(<App splashDuration={0} />)

    await screen.findByRole('heading', { name: 'Welcome back' })
    await user.type(screen.getByLabelText('Username'), 'restaurant-owner')
    await user.type(screen.getByLabelText('Password'), 'correct-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/auth/login',
      expect.objectContaining({
        body: JSON.stringify({ username: 'restaurant-owner', password: 'correct-password' }),
        credentials: 'include',
        method: 'POST',
      }),
    )
    expect(await screen.findByRole('heading', { name: 'Start or end a business day' })).toBeInTheDocument()
    expect(screen.getByText('Admin mode')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Table' })).toBeDisabled()
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Expenses' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Daily start/close' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Balance sheet' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Backup' })).toBeInTheDocument()
  })

  it('explains rejected credentials without leaving the form', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(restaurantConfiguration))
      .mockResolvedValueOnce(jsonResponse({ authenticated: false, username: null }))
      .mockResolvedValueOnce(jsonResponse({}, 401))
    const user = userEvent.setup()

    render(<App splashDuration={0} />)

    await screen.findByRole('heading', { name: 'Welcome back' })
    await user.type(screen.getByLabelText('Username'), 'restaurant-owner')
    await user.type(screen.getByLabelText('Password'), 'incorrect-password')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('The username or password is incorrect.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  })

  it('restores a Captain session and shows the Captain workspace mode', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(restaurantConfiguration))
      .mockResolvedValueOnce(jsonResponse({ authenticated: true, mode: 'CAPTAIN', username: 'captain' }))
      .mockResolvedValueOnce(jsonResponse({ active: false, businessDate: null, startedAt: null }))

    render(<App splashDuration={0} />)

    expect(await screen.findByRole('tab', { name: 'Table' })).toBeDisabled()
    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument()
    expect(screen.getByText('Captain mode')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Expenses' })).not.toBeInTheDocument()
  })
})

