import { useEffect, useState } from 'react'
import { ArrowLeft, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { money, lastSeen, whatsappLink } from '../lib/format'
import { Field } from '../components/ui'

const field =
  'w-full rounded-xl border border-ink/55 bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent'

const fmt = (d) =>
  new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export default function CustomerDetail({ customer, onBack, onEdit, onChanged }) {
  const { business } = useAuth()
  const cur = business.currency
  const owed = Number(customer.balance_owed)

  const [sales, setSales] = useState([])
  const [payments, setPayments] = useState([])
  const [pay, setPay] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [s, p] = await Promise.all([
      supabase
        .from('sales')
        .select('id, total, amount_paid, payment_method, created_at, sale_items(item_name, quantity)')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('customer_payments')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    setSales(s.data ?? [])
    setPayments(p.data ?? [])
  }

  useEffect(() => {
    load()
  }, [customer.id])

  async function submitPayment(e) {
    e.preventDefault()
    setError('')
    const amount = Number(pay.amount)
    if (!(amount > 0)) return setError('Enter an amount above zero.')
    setBusy(true)
    const { error } = await supabase.rpc('record_payment', {
      p_customer_id: customer.id,
      p_amount: amount,
      p_method: pay.method,
      p_note: pay.note.trim() || null,
    })
    setBusy(false)
    if (error) return setError(error.message)
    toast.success('Payment recorded')
    setPay(null)
    await load()
    onChanged()
  }

  const reminder =
    owed > 0
      ? whatsappLink(
          customer.phone,
          `Hello ${customer.name}, this is a friendly reminder from ${business.name}. You have an outstanding balance of ${money(owed, cur)}. Thank you!`
        )
      : null

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-medium underline">
        <ArrowLeft size={16} /> All customers
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{customer.name}</h2>
          <p className="text-ink/65">
            {[customer.phone, customer.email].filter(Boolean).join(', ') || 'No contact details'}
          </p>
          {customer.notes && <p className="mt-1 text-sm">{customer.notes}</p>}
        </div>
        <button onClick={onEdit} className="rounded-xl border border-ink/25 px-3 py-1.5 text-sm">
          Edit
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total spent" value={money(customer.total_spent, cur)} />
        <Stat label="Visits" value={customer.visits} />
        <Stat label="Last purchase" value={lastSeen(customer.last_purchase)} small />
      </div>

      <div className={`rounded-xl p-5 ${owed > 0 ? 'bg-danger/15 text-danger' : 'bg-brand text-white'}`}>
        <p className="text-sm opacity-70">{owed > 0 ? 'Outstanding balance' : 'Balance'}</p>
        <p className="text-4xl font-semibold">{owed > 0 ? money(owed, cur) : 'Nothing owed'}</p>

        {owed > 0 && !pay && (
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => {
                setError('')
                setPay({ amount: String(owed), method: 'cash', note: '' })
              }}
              className="rounded-xl bg-brand px-4 py-2 font-medium text-white"
            >
              Record payment
            </button>
            {reminder && (
              <a
                href={reminder}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-xl bg-surface px-4 py-2 font-medium text-ink"
              >
                <MessageCircle size={18} /> Remind on WhatsApp
              </a>
            )}
          </div>
        )}
      </div>

      {pay && (
        <form onSubmit={submitPayment} className="space-y-3 rounded-xl border border-ink/15 bg-surface p-5">
          <h3 className="font-semibold">Record a payment</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Amount"><input
              className={field}
              type="number"
              min="0"
              step="0.01"
              value={pay.amount}
              onChange={(e) => setPay({ ...pay, amount: e.target.value })}
              autoFocus
            /></Field>
            <Field label="Method"><select className={field} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
              <option value="cash">Cash</option>
              <option value="transfer">Transfer</option>
              <option value="card">Card</option>
            </select></Field>
            <Field label="Note" hint="Optional"><input
              className={field}
              value={pay.note}
              onChange={(e) => setPay({ ...pay, note: e.target.value })}
            /></Field>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-3">
            <button disabled={busy} className="rounded-xl bg-brand px-4 py-2 font-medium text-white disabled:opacity-60">
              {busy ? 'Saving...' : 'Save payment'}
            </button>
            <button type="button" onClick={() => setPay(null)} className="px-3 py-2 text-sm underline">
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Purchases</h3>
        {sales.length === 0 ? (
          <p className="text-ink/65">No purchases recorded for this customer yet.</p>
        ) : (
          <ul className="divide-y divide-ink/10 rounded-xl border border-ink/15 bg-surface">
            {sales.map((s) => {
              const unpaid = Number(s.total) - Number(s.amount_paid)
              return (
                <li key={s.id} className="flex items-start justify-between gap-4 p-4 text-sm">
                  <div>
                    <p className="text-ink/65">{fmt(s.created_at)}</p>
                    <p>{s.sale_items.map((x) => `${Number(x.quantity)} x ${x.item_name}`).join(', ')}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium">{money(s.total, cur)}</p>
                    <p className="capitalize text-ink/65">
                      {s.payment_method}
                      {unpaid > 0 && `, ${money(unpaid, cur)} unpaid`}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Payments received</h3>
        {payments.length === 0 ? (
          <p className="text-ink/65">No debt payments yet.</p>
        ) : (
          <ul className="divide-y divide-ink/10 rounded-xl border border-ink/15 bg-surface">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                <div>
                  <p className="text-ink/65">{fmt(p.created_at)}</p>
                  <p className="capitalize">
                    {p.payment_method}
                    {p.note && `, ${p.note}`}
                  </p>
                </div>
                <p className="font-medium">{money(p.amount, cur)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value, small }) {
  return (
    <div className="rounded-xl border border-ink/15 bg-surface p-4">
      <p className="text-sm text-ink/65">{label}</p>
      <p className={small ? 'text-lg font-semibold' : 'text-2xl font-semibold'}>{value}</p>
    </div>
  )
}
