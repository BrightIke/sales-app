import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { money } from '../lib/format'
import { Field } from '../components/ui'

const periods = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
]

const categories = [
  'Rent',
  'Electricity or power',
  'Salaries',
  'Transport',
  'Supplies',
  'Internet or data',
  'Marketing',
  'Other',
]

const field =
  'w-full rounded-xl border border-ink/55 bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent'

function startOf(period) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (period === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  if (period === 'month') d.setDate(1)
  return d
}

const today = () => new Date().toLocaleDateString('en-CA')
const blank = () => ({ category: categories[0], description: '', amount: '', date: today() })

export default function Money() {
  const { business } = useAuth()
  const cur = business.currency

  const [period, setPeriod] = useState('month')
  const [sales, setSales] = useState([])
  const [expenses, setExpenses] = useState([])
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const start = startOf(period)
    const [s, e] = await Promise.all([
      supabase.from('sales').select('total, sale_costs(total_cost)').gte('created_at', start.toISOString()),
      supabase
        .from('expenses')
        .select('*')
        .gte('expense_date', start.toLocaleDateString('en-CA'))
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])
    if (s.error || e.error) setError((s.error || e.error).message)
    setSales(s.data ?? [])
    setExpenses(e.data ?? [])
  }

  useEffect(() => {
    load()
  }, [period])

  const revenue = sales.reduce((n, x) => n + Number(x.total), 0)
  const cogs = sales.reduce((n, x) => n + Number(x.sale_costs?.total_cost ?? 0), 0)
  const gross = revenue - cogs
  const spent = expenses.reduce((n, x) => n + Number(x.amount), 0)
  const net = gross - spent

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  async function addExpense(e) {
    e.preventDefault()
    setError('')
    if (!(Number(form.amount) > 0)) return setError('Enter an amount above zero.')
    setBusy(true)
    const { error } = await supabase.rpc('add_expense', {
      p_category: form.category,
      p_description: form.description,
      p_amount: Number(form.amount),
      p_date: form.date,
    })
    setBusy(false)
    if (error) return setError(error.message)
    toast.success('Expense added')
    setForm(null)
    load()
  }

  async function removeExpense(x) {
    if (!window.confirm(`Delete this ${money(x.amount, cur)} expense?`)) return
    const { error } = await supabase.rpc('delete_expense', { p_id: x.id })
    if (error) setError(error.message)
    else {
      toast.success('Expense deleted')
      load()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Money</h2>
        <div className="flex gap-2">
          {periods.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPeriod(id)}
              className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${
                period === id
                  ? 'border-brand bg-brand text-white'
                  : 'border-ink/25 bg-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Total sales" value={money(revenue, cur)} />
        <Card label="Cost of goods sold" value={money(cogs, cur)} />
        <Card label="Gross profit" value={money(gross, cur)} />
        <Card label="Expenses" value={money(spent, cur)} />
      </div>

      <div className={`rounded-xl p-5 ${net < 0 ? 'bg-danger/15 text-danger' : 'bg-brand text-white'}`}>
        <p className="text-sm opacity-70">Net profit (gross profit minus expenses)</p>
        <p className="text-4xl font-semibold">{money(net, cur)}</p>
        <p className="mt-1 text-sm opacity-70">Credit sales count as sales even if not yet paid.</p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Expenses</h3>
          <button
            onClick={() => {
              setError('')
              setForm(blank())
            }}
            className="rounded-xl bg-accent px-4 py-2 font-medium hover:bg-accent-hover"
          >
            Add expense
          </button>
        </div>

        {form && (
          <form onSubmit={addExpense} className="space-y-3 rounded-xl border border-ink/15 bg-surface p-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Category"><select className={field} value={form.category} onChange={set('category')}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select></Field>
              <Field label="Amount"><input
                className={field}
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={set('amount')}
                required
              /></Field>
              <Field label="Description" hint="Optional"><input
                className={field}
                value={form.description}
                onChange={set('description')}
              /></Field>
              <Field label="Date"><input className={field} type="date" value={form.date} onChange={set('date')} required /></Field>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex gap-3">
              <button
                disabled={busy}
                className="rounded-xl bg-brand px-4 py-2 font-medium text-white disabled:opacity-60"
              >
                {busy ? 'Saving...' : 'Save expense'}
              </button>
              <button type="button" onClick={() => setForm(null)} className="px-3 py-2 text-sm underline">
                Cancel
              </button>
            </div>
          </form>
        )}

        {!form && error && <p className="text-sm text-danger">{error}</p>}

        {expenses.length === 0 ? (
          <p className="text-ink/65">No expenses recorded for this period.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink/15 bg-surface">
            <table className="w-full text-left text-sm">
              <tbody>
                {expenses.map((x) => (
                  <tr key={x.id} className="border-b border-ink/10 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-ink/65">
                      {new Date(x.expense_date + 'T00:00:00').toLocaleDateString('en-NG', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium">{x.category}</td>
                    <td className="px-4 py-3 text-ink/65">{x.description}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium">
                      {money(x.amount, cur)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeExpense(x)} className="text-danger underline">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Card({ label, value }) {
  return (
    <div className="rounded-xl border border-ink/15 bg-surface p-4">
      <p className="text-sm text-ink/65">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  )
}
