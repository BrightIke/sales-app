import { Component } from 'react'
import { APP_NAME } from '../lib/brand'

// If something crashes, show a calm message instead of a blank white page.
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error, info) {
    console.error(`${APP_NAME} crashed:`, error, info?.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="grid min-h-dvh place-items-center bg-page p-6 text-ink">
        <div className="card max-w-sm p-6 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink/65">
            Your data is safe. Reload the page to carry on. If it keeps happening, tell whoever looks
            after {APP_NAME} what you were doing.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-fg hover:bg-accent-hover"
            >
              Reload
            </button>
            <button
              onClick={() => this.setState({ failed: false })}
              className="rounded-xl border border-line px-4 py-2.5 font-medium hover:bg-surface-2"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }
}
