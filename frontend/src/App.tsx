import { useEffect, useState } from 'react'
import './App.css'

type ApiState = 'checking' | 'online' | 'offline'

const capabilities = [
  {
    title: 'Billing & balance sheets',
    description: 'Create bills and review the numbers that matter at closing time.',
    icon: '₹',
  },
  {
    title: 'Inventory checks',
    description: 'Track ingredients and spot low-stock items before service.',
    icon: '◫',
  },
  {
    title: 'Menu updates',
    description: 'Keep prices and item availability current from one place.',
    icon: '≡',
  },
]

function App() {
  const [apiState, setApiState] = useState<ApiState>('checking')

  useEffect(() => {
    const controller = new AbortController()
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

    fetch(`${apiBaseUrl}/api/health`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Health check failed: ${response.status}`)
        setApiState('online')
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setApiState('offline')
      })

    return () => controller.abort()
  }, [])

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Pet Puja Billing home">
          <span className="brand-mark">PP</span>
          <span>Pet Puja Billing</span>
        </a>
        <span className={`status status-${apiState}`}>
          <span aria-hidden="true" />
          API {apiState}
        </span>
      </header>

      <section className="hero">
        <p className="eyebrow">Restaurant operations, kept simple</p>
        <h1>Run the counter.<br />Know the kitchen.</h1>
        <p className="hero-copy">
          A focused workspace for everyday restaurant billing, stock, and menu
          management—built to stay out of your way.
        </p>
        <div className="hero-actions">
          <button type="button" disabled>Open dashboard</button>
          <span>Foundation ready · Workflows coming next</span>
        </div>
      </section>

      <section className="capabilities" aria-labelledby="capabilities-title">
        <div className="section-heading">
          <p className="eyebrow">One clear view</p>
          <h2 id="capabilities-title">Everything the owner needs</h2>
        </div>
        <div className="card-grid">
          {capabilities.map((capability) => (
            <article className="card" key={capability.title}>
              <span className="card-icon" aria-hidden="true">{capability.icon}</span>
              <h3>{capability.title}</h3>
              <p>{capability.description}</p>
              <span className="coming-soon">Coming soon</span>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <span>Pet Puja Billing</span>
        <span>Secure owner access · Up to 4 devices</span>
      </footer>
    </main>
  )
}

export default App
