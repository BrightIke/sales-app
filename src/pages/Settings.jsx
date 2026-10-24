import { useState } from 'react'
import { toast } from 'sonner'
import { Monitor, Moon, Sun } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import InviteList from '../components/InviteList'
import { Segmented } from '../components/ui'
import { setMode, useThemeMode } from '../lib/theme'
import { Field } from '../components/ui'

const moduleList = [
  { id: 'inventory', name: 'Stock management', desc: 'Restock, record waste, correct counts and get low-stock warnings.' },
  { id: 'money', name: 'Expenses and profit', desc: 'Track rent, power and salaries, and see your true net profit.' },
  { id: 'costing', name: 'Costs and materials', desc: 'Work out what each item really costs you: materials, packaging, equipment wear.' },
  { id: 'customers', name: 'Customers and debt', desc: 'Customer list, purchase history and who owes you.' },
  { id: 'analytics', name: 'Analytics', desc: 'Best sellers, peak hours and plain-language insights.' },
]

const types = [
  { value: 'retail', label: 'Shop or supermarket' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cyber_cafe', label: 'Cyber cafe' },
  { value: 'other', label: 'Something else' },
]

const field =
  'w-full rounded-xl border border-ink/55 bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent'

export default function Settings() {
  const { business, businesses, invites, profile, hasModule, refresh, switchBusiness } = useAuth()
  const isOwner = profile?.role === 'owner'
  const theme = useThemeMode()

  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [type, setType] = useState('retail')
  const [creating, setCreating] = useState(false)

  async function toggle(id, on) {
    setError('')
    setBusyKey(id)
    const { error } = await supabase.rpc('set_module', { p_module: id, p_enabled: on })
    if (error) setError(error.message)
    else {
      await refresh()
      toast.success('Module updated')
    }
    setBusyKey('')
  }

  async function addBusiness(e) {
    e.preventDefault()
    setError('')
    setCreating(true)
    const { error } = await supabase.rpc('create_business', {
      p_name: name.trim(),
      p_type: type,
      p_full_name: profile?.full_name ?? null,
    })
    setCreating(false)
    if (error) return setError(error.message)
    await refresh()
    toast.success('Business created')
  }

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-semibold">Settings</h2>
      {error && <p className="text-sm text-danger">{error}</p>}

      {invites.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Invitations for you</h3>
          <InviteList />
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Appearance</h3>
          <p className="text-sm text-ink/65">Choose light or dark, or follow your phone.</p>
        </div>
        <Segmented
          label="Appearance"
          value={theme.mode}
          onChange={setMode}
          options={[
            { value: 'system', label: 'Auto', icon: Monitor },
            { value: 'light', label: 'Light', icon: Sun },
            { value: 'dark', label: 'Dark', icon: Moon },
          ]}
        />
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-lg font-semibold">Modules for {business.name}</h3>
          <p className="text-sm text-ink/65">
            Switch on only what this business needs. {!isOwner && 'Only the owner can change these.'}
          </p>
        </div>

        <div className="divide-y divide-ink/10 rounded-xl border border-ink/15 bg-surface">
          <div className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">Sales and items</p>
              <p className="text-sm text-ink/65">The core of the app, always on.</p>
            </div>
            <span className="text-sm text-ink/65">Always on</span>
          </div>

          {moduleList.map((m) => {
            const on = hasModule(m.id)
            return (
              <div key={m.id} className="flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="font-medium">
                    {m.name}
                    {m.soon && (
                      <span className="ml-2 rounded bg-ink/10 px-1.5 py-0.5 text-xs font-medium">
                        Coming soon
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-ink/65">{m.desc}</p>
                </div>
                <button
                  role="switch"
                  aria-checked={on}
                  disabled={!isOwner || busyKey === m.id}
                  onClick={() => toggle(m.id, !on)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                    on ? 'bg-brand' : 'bg-ink/25'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                      on ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Your businesses</h3>
        <div className="divide-y divide-ink/10 rounded-xl border border-ink/15 bg-surface">
          {businesses.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-4 p-4">
              <div>
                <p className="font-medium">{b.name}</p>
                <p className="text-sm capitalize text-ink/65">
                  {b.business_type.replace('_', ' ')}, {b.role}
                </p>
              </div>
              {b.id === business.id ? (
                <span className="text-sm text-ink/65">Current</span>
              ) : (
                <button onClick={() => switchBusiness(b.id)} className="text-sm font-medium underline">
                  Switch
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Add another business</h3>
        <form onSubmit={addBusiness} className="space-y-3 rounded-xl border border-ink/15 bg-surface p-5">
          <Field label="Business name"><input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          /></Field>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <button
                type="button"
                key={t.value}
                onClick={() => setType(t.value)}
                className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${
                  type === t.value
                    ? 'border-brand bg-brand text-white'
                    : 'border-ink/25 bg-surface'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            disabled={creating}
            className="rounded-xl bg-accent px-4 py-2 font-medium hover:bg-accent-hover disabled:opacity-60"
          >
            {creating ? 'Creating...' : 'Create and switch to it'}
          </button>
        </form>
      </section>
    </div>
  )
}
