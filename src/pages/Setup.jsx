import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { Field } from '../components/ui'

const types = [
  { value: 'retail', label: 'Shop or supermarket', hint: 'Stock, barcodes, suppliers' },
  { value: 'restaurant', label: 'Restaurant', hint: 'Menu, recipes, orders' },
  { value: 'cyber_cafe', label: 'Cyber cafe', hint: 'Timed services, printing' },
  { value: 'other', label: 'Something else', hint: 'Start simple, adjust later' },
]

export default function Setup() {
  const { session, refresh, signOut } = useAuth()
  const [name, setName] = useState('')
  const [type, setType] = useState('retail')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.rpc('create_business', {
      p_name: name,
      p_type: type,
      p_full_name: session.user.user_metadata?.full_name ?? null,
    })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    await refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6 text-ink">
      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-5">
        <h1 className="text-2xl font-semibold">Set up your business</h1>

        <Field label="Business name"><input
          className="w-full rounded-xl border border-ink/55 bg-surface px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-accent"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        /></Field>

        <div className="grid grid-cols-2 gap-3">
          {types.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setType(t.value)}
              className={`rounded-xl border p-3 text-left ${
                type === t.value
                  ? 'border-brand bg-brand text-white'
                  : 'border-ink/25 bg-surface'
              }`}
            >
              <span className="block font-medium">{t.label}</span>
              <span className="block text-sm opacity-70">{t.hint}</span>
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          disabled={busy}
          className="w-full rounded-xl bg-accent py-2.5 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? 'Creating...' : 'Create business'}
        </button>

        <button type="button" onClick={signOut} className="text-sm underline">
          Log out
        </button>
      </form>
    </div>
  )
}
