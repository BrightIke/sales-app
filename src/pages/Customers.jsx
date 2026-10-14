import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { money, daysSince, lastSeen } from '../lib/format'
import CustomerDetail from './CustomerDetail'
import { Field } from '../components/ui'

const field =
  'w-full rounded-xl border border-ink/55 bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent'

const empty = { name: '', phone: '', email: '', birthday: '', notes: '' }

const filters = [
  ['all', 'All'],
  ['owing', 'Owes money'],
  ['inactive', 'Not back in 30 days'],
]

const isOwing = (r) => Number(r.balance_owed) > 0
const isInactive = (r) => r.visits > 0 && daysSince(r.last_purchase) >= 30
const birthdayThisMonth = (r) =>
  r.birthday && new Date(r.birthday + 'T00:00:00').getMonth() === new Date().getMonth()

export default function Customers() {
  const { business } = useAuth()
  const cur = business.currency

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [c, s] = await Promise.all([
      supabase.from('customers').select('*').order('name'),
      supabase.from('customer_stats').select('*'),
    ])
    if (c.error || s.error) setError((c.error || s.error).message)
    const stats = Object.fromEntries((s.data ?? []).map((x) => [x.customer_id, x]))
    setRows(
      (c.data ?? []).map((x) => ({
        ...x,
        visits: Number(stats[x.id]?.visits ?? 0),
        total_spent: Number(stats[x.id]?.total_spent ?? 0),
        last_purchase: stats[x.id]?.last_purchase ?? null,
      }))
    )
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === 'owing' && !isOwing(r)) return false
      if (filter === 'inactive' && !isInactive(r)) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q) || (r.phone ?? '').includes(q)
    })
  }, [rows, search, filter])

  const totalOwed = rows.reduce((n, r) => n + Number(r.balance_owed), 0)
  const inactiveCount = rows.filter(isInactive).length

  function openNew() {
    setEditingId(null)
    setForm({ ...empty })
    setError('')
  }

  function openEdit(c) {
    setSelectedId(null)
    setEditingId(c.id)
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      birthday: c.birthday ?? '',
      notes: c.notes ?? '',
    })
    setError('')
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  async function save(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      birthday: form.birthday || null,
      notes: form.notes.trim() || null,
    }
    const { error } = await supabase.rpc('save_customer', {
      p_id: editingId,
      p_name: payload.name,
      p_phone: payload.phone,
      p_email: payload.email,
      p_birthday: payload.birthday,
      p_notes: payload.notes,
    })
    setBusy(false)
    if (error) return setError(error.message)
    toast.success('Customer saved')
    setForm(null)
    setEditingId(null)
    load()
  }

  const selected = rows.find((r) => r.id === selectedId)
  if (selected) {
    return (
      <CustomerDetail
        customer={selected}
        onBack={() => {
          setSelectedId(null)
          load()
        }}
        onEdit={() => openEdit(selected)}
        onChanged={load}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Customers</h2>
        <button onClick={openNew} className="rounded-xl bg-accent px-4 py-2 font-medium hover:bg-accent-hover">
          Add customer
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Customers" value={rows.length} />
        <Stat label="Owed to you" value={money(totalOwed, cur)} warn={totalOwed > 0} />
        <Stat label="Not back in 30 days" value={inactiveCount} />
      </div>

      {form && (
        <form onSubmit={save} className="space-y-3 rounded-xl border border-ink/15 bg-surface p-5">
          <h3 className="font-semibold">{editingId ? 'Edit customer' : 'New customer'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><input className={field} value={form.name} onChange={set('name')} required /></Field>
            <Field label="Phone" hint="e.g. 0803 000 0000"><input className={field} value={form.phone} onChange={set('phone')} /></Field>
            <Field label="Email" hint="Optional"><input className={field} type="email" value={form.email} onChange={set('email')} /></Field>
            <Field label="Birthday" hint="Optional"><input className={field} type="date" value={form.birthday} onChange={set('birthday')} /></Field>
            <Field label="Notes" hint="e.g. prefers evening delivery" className="sm:col-span-2"><textarea
              className={field}
              rows={2}
              value={form.notes}
              onChange={set('notes')}
            /></Field>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-3">
            <button disabled={busy} className="rounded-xl bg-brand px-4 py-2 font-medium text-white disabled:opacity-60">
              {busy ? 'Saving...' : 'Save customer'}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(null)
                setEditingId(null)
              }}
              className="px-3 py-2 text-sm underline"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          className={`${field} max-w-xs`}
          placeholder="Search name or phone" aria-label="Search name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          {filters.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${
                filter === id ? 'border-brand bg-brand text-white' : 'border-ink/25 bg-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!form && error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-ink/65">Loading customers...</p>
      ) : shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink/30 p-8 text-center text-ink/70">
          {rows.length === 0
            ? 'No customers yet. Add your first one, or add them while making a sale.'
            : 'No customers match.'}
        </p>
      ) : (
        <ul className="divide-y divide-ink/10 rounded-xl border border-ink/15 bg-surface">
          {shown.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelectedId(r.id)}
                className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {r.name}
                    {birthdayThisMonth(r) && (
                      <span className="ml-2 rounded bg-accent/30 px-1.5 py-0.5 text-xs font-medium">
                        Birthday this month
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-ink/65">{r.phone || 'No phone saved'}</p>
                </div>
                <div className="shrink-0 text-right">
                  {isOwing(r) ? (
                    <p className="font-semibold text-danger">Owes {money(r.balance_owed, cur)}</p>
                  ) : (
                    <p className="text-sm text-ink/65">{money(r.total_spent, cur)} spent</p>
                  )}
                  <p className="text-xs text-ink/65">{lastSeen(r.last_purchase)}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, warn }) {
  return (
    <div className="rounded-xl border border-ink/15 bg-surface p-4">
      <p className="text-sm text-ink/65">{label}</p>
      <p className={`text-2xl font-semibold ${warn ? 'text-danger' : ''}`}>{value}</p>
    </div>
  )
}
