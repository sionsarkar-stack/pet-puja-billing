import { type FormEvent, useEffect, useState } from 'react'
import {
  defaultRestaurantConfiguration,
  getRestaurantMark,
  RestaurantConfigurationContext,
  type RestaurantConfiguration,
} from './RestaurantConfiguration'
import type { UserMode } from './userMode'
import Workspace from './Workspace'
import './App.css'

type AuthState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; username: string; mode: UserMode }

type AuthenticatedSession = {
  authenticated: true
  username: string
  mode: UserMode
}

type LoginResponse = {
  username: string
  mode: UserMode
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

function isAuthenticatedSession(value: unknown): value is AuthenticatedSession {
  return typeof value === 'object'
    && value !== null
    && 'authenticated' in value
    && value.authenticated === true
    && 'username' in value
    && typeof value.username === 'string'
    && 'mode' in value
    && (value.mode === 'ADMIN' || value.mode === 'CAPTAIN')
}

function hasUsername(value: unknown): value is LoginResponse {
  return typeof value === 'object'
    && value !== null
    && 'username' in value
    && typeof value.username === 'string'
    && 'mode' in value
    && (value.mode === 'ADMIN' || value.mode === 'CAPTAIN')
}

function isRestaurantConfiguration(value: unknown): value is RestaurantConfiguration {
  return typeof value === 'object'
    && value !== null
    && 'restaurantName' in value
    && typeof value.restaurantName === 'string'
    && value.restaurantName.trim().length > 0
    && 'upiVpa' in value
    && typeof value.upiVpa === 'string'
}

function App() {
  const [authState, setAuthState] = useState<AuthState>({ status: 'checking' })
  const [restaurantConfiguration, setRestaurantConfiguration] = useState<RestaurantConfiguration | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    Promise.all([
      fetch(`${apiBaseUrl}/api/public-config`, { signal: controller.signal }),
      fetch(`${apiBaseUrl}/api/auth/session`, {
        credentials: 'include',
        signal: controller.signal,
      })
    ])
      .then(async ([configurationResponse, sessionResponse]) => {
        if (!configurationResponse.ok) throw new Error(`Configuration load failed: ${configurationResponse.status}`)
        if (!sessionResponse.ok) throw new Error(`Session check failed: ${sessionResponse.status}`)

        const [configuration, session] = await Promise.all([
          configurationResponse.json() as Promise<unknown>,
          sessionResponse.json() as Promise<unknown>,
        ])
        if (!isRestaurantConfiguration(configuration)) throw new Error('Restaurant configuration has an unexpected shape')

        setRestaurantConfiguration(configuration)
        if (isAuthenticatedSession(session)) {
          setAuthState({ status: 'signed-in', username: session.username, mode: session.mode })
          return
        }

        setAuthState({ status: 'signed-out' })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setAuthState({ status: 'signed-out' })
        setLoginError('Restaurant settings are unavailable. Start the backend and try again.')
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (restaurantConfiguration === null) return
    document.title = restaurantConfiguration.restaurantName
  }, [restaurantConfiguration])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const submittedUsername = username.trim()
    if (!submittedUsername || !password) {
      setLoginError('Enter your username and password.')
      return
    }

    setIsSubmitting(true)
    setLoginError('')

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        body: JSON.stringify({ username: submittedUsername, password }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })

      if (response.status === 401) {
        setLoginError('The username or password is incorrect.')
        return
      }

      if (!response.ok) {
        throw new Error(`Login failed: ${response.status}`)
      }

      const login = await response.json() as unknown
      if (!hasUsername(login)) {
        throw new Error('Login response did not include an authenticated mode')
      }

      setPassword('')
      setAuthState({ status: 'signed-in', username: login.username, mode: login.mode })
    } catch {
      setLoginError('We could not sign you in. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true)
    setLoginError('')

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/logout`, {
        credentials: 'include',
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Logout failed: ${response.status}`)
      }

      setAuthState({ status: 'signed-out' })
    } catch {
      setLoginError('We could not sign you out. Please try again.')
    } finally {
      setIsLoggingOut(false)
    }
  }

  if (restaurantConfiguration === null) {
    return (
      <main className="auth-page">
        <div className="auth-loading" aria-live="polite" role="status">
          {loginError || 'Loading restaurant settings'}
        </div>
      </main>
    )
  }

  if (authState.status === 'signed-in') {
    return (
      <RestaurantConfigurationContext.Provider value={restaurantConfiguration}>
        <Workspace
          isLoggingOut={isLoggingOut}
          mode={authState.mode}
          onLogout={handleLogout}
          username={authState.username}
        />
      </RestaurantConfigurationContext.Provider>
    )
  }

  return (
    <RestaurantConfigurationContext.Provider value={restaurantConfiguration ?? defaultRestaurantConfiguration}>
      <main className="auth-page">
        <header className="auth-topbar">
          <a className="brand" href="/" aria-label={`${restaurantConfiguration.restaurantName} home`}>
            <span className="brand-mark">{getRestaurantMark(restaurantConfiguration.restaurantName)}</span>
            <span>{restaurantConfiguration.restaurantName}</span>
          </a>
          <span className="owner-badge">Team access</span>
        </header>

        <section className="auth-layout" aria-label="Team sign in">
          <div className="auth-visual">
            <div className="auth-visual-content">
              <p className="eyebrow">{restaurantConfiguration.restaurantName}</p>
              <h1>Ready for service.</h1>
              <p>One calm place to begin the day.</p>
            </div>
          </div>

          <section className="auth-form-panel">
            {authState.status === 'checking' && (
              <div className="auth-loading" aria-live="polite">
                <span className="loading-mark" aria-hidden="true" />
                Checking your session
              </div>
            )}

            {authState.status === 'signed-out' && (
              <form className="login-form" onSubmit={handleLogin} noValidate>
                <div className="form-heading">
                  <p className="eyebrow">Team sign-in</p>
                  <h2>Welcome back</h2>
                  <p>Use your restaurant credentials to continue.</p>
                </div>

                <div className="field-group">
                  <label htmlFor="username">Username</label>
                  <input
                    autoCapitalize="none"
                    autoComplete="username"
                    disabled={isSubmitting}
                    id="username"
                    name="username"
                    onChange={(event) => setUsername(event.target.value)}
                    value={username}
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="password">Password</label>
                  <input
                    autoComplete="current-password"
                    disabled={isSubmitting}
                    id="password"
                    name="password"
                    onChange={(event) => setPassword(event.target.value)}
                    type="password"
                    value={password}
                  />
                </div>

                <p className="form-message" role="alert" aria-live="polite">
                  {loginError}
                </p>

                <button className="auth-submit" disabled={isSubmitting} type="submit">
                  {isSubmitting ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            )}

          </section>
        </section>
      </main>
    </RestaurantConfigurationContext.Provider>
  )
}

export default App
