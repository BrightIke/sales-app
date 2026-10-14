import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { Field } from '../components/ui'

export default function ResetPassword() {
  const { clearRecovery } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(error.message)
    clearRecovery()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6 text-ink">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <Field label="New password" hint="At least 6 characters"><input
          className="w-full rounded-xl border border-ink/55 bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent"
          type="password"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
        /></Field>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-xl bg-brand py-2.5 font-medium text-white hover:bg-brand-hover disabled:opacity-60"
        >
          {busy ? 'Saving...' : 'Save new password'}
        </button>
      </form>
    </div>
  )
}
