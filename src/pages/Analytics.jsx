import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { money } from '../lib/format'

const INK = 'var(--chart-1)'
const AMBER = 'var(--chart-accent)'
const SAGE = 'var(--chart-3)'

const ranges = [
  [7, '7 days'],
  [30, '30 days'],
  [90, '90 days'],
]

const dowFull = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const dowShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const num = (x) => Number(x) || 0
const compact = (v) => new Intl.NumberFormat('en', { notation: 'compact' }).format(v)
const hourLabel = (h) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`
const dayLabel = (d) =>
  new Date(d + 'T00:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)

function buildInsights(d, cur, days) {
  const out = []
  const rev = num(d.totals.revenue)
  const profit = num(d.totals.profit)
  const tx = num(d.totals.transactions)
  const change = pct(rev, num(d.previous.revenue))

  if (change !== null && change !== 0) {
    out.push(
      `Sales are ${change > 0 ? 'up' : 'down'} ${Math.abs(change)}% compared with the previous ${days} days.`
    )
  }

  if (rev > 0) {
    out.push(
      `Of every ${money(100, cur)} you sell, about ${money(Math.round((profit / rev) * 100), cur)} is profit before expenses.`
    )
  }

  const activeDays = d.daily.filter((x) => num(x.revenue) > 0).length
  if (tx >= 20 && activeDays >= 10 && d.weekday.length === 7) {
    const sorted = [...d.weekday].sort((a, b) => num(b.avg_revenue) - num(a.avg_revenue))
    const best = sorted[0]
    const worst = sorted[6]
    const avg = d.weekday.reduce((n, x) => n + num(x.avg_revenue), 0) / 7
    out.push(`${dowFull[best.dow - 1]}s are your best day, averaging ${money(best.avg_revenue, cur)}.`)
    if (avg > 0) {
      const below = Math.round((1 - num(worst.avg_revenue) / avg) * 100)
      if (below >= 10)
        out.push(`${dowFull[worst.dow - 1]}s are your slowest day, about ${below}% below your daily average.`)
    }
  }

  if (tx >= 10 && d.hourly.length > 0 && rev > 0) {
    const peak = [...d.hourly].sort((a, b) => num(b.revenue) - num(a.revenue))[0]
    out.push(
      `Your busiest hour is ${hourLabel(peak.hour)}, bringing in ${Math.round((num(peak.revenue) / rev) * 100)}% of your sales.`
    )
  }

  if (d.top_items[0] && rev > 0) {
    const t = d.top_items[0]
    out.push(`${t.name} is your top seller, making up ${Math.round((num(t.revenue) / rev) * 100)}% of sales.`)
  }

  const exp = num(d.expenses)
  if (exp > 0) {
    if (exp > profit) {
      out.push(
        `You spent ${money(exp, cur)} on expenses, which is more than your gross profit of ${money(profit, cur)}.`
      )
    } else if (profit > 0) {
      out.push(`Expenses took ${Math.round((exp / profit) * 100)}% of your gross profit in this period.`)
    }
  }

  if (d.dead_stock.length > 0) {
    const value = d.dead_stock.reduce((n, x) => n + num(x.value), 0)
    out.push(
      `${d.dead_stock.slice(0, 3).map((x) => x.name).join(', ')} have not sold in ${days} days, with about ${money(value, cur)} tied up in stock.`
    )
  }

  return out.slice(0, 6)
}

export default function Analytics() {
  const { business } = useAuth()
  const cur = business.currency

  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    supabase
      .rpc('analytics_summary', {
        p_days: days,
        p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setData(data)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [days])

  const insights = useMemo(() => (data ? buildInsights(data, cur, days) : []), [data, cur, days])

  const charts = useMemo(() => {
    if (!data) return null
    return {
      daily: data.daily.map((x) => ({
        label: dayLabel(x.day),
        revenue: num(x.revenue),
        profit: num(x.profit),
      })),
      hourly: Array.from({ length: 24 }, (_, h) => ({
        label: hourLabel(h),
        revenue: num(data.hourly.find((y) => y.hour === h)?.revenue),
      })),
      weekday: dowShort.map((label, i) => ({
        label,
        revenue: num(data.weekday.find((w) => w.dow === i + 1)?.avg_revenue),
      })),
      top: data.top_items.map((x) => ({
        name: x.name.length > 16 ? x.name.slice(0, 15) + '...' : x.name,
        revenue: num(x.revenue),
      })),
    }
  }, [data])

  const tip = { formatter: (v) => money(v, cur), contentStyle: { borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' } }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Analytics</h2>
        <div className="flex gap-2">
          {ranges.map(([d, label]) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${
                days === d ? 'border-brand bg-brand text-white' : 'border-ink/25 bg-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {loading && !data && <p className="text-ink/65">Crunching your numbers...</p>}

      {data && num(data.totals.transactions) === 0 && (
        <p className="rounded-xl border border-dashed border-ink/30 p-8 text-center text-ink/70">
          No sales in the last {days} days yet. Record some sales and your charts will appear here.
        </p>
      )}

      {data && num(data.totals.transactions) > 0 && (
        <div className={`space-y-6 ${loading ? 'opacity-60' : ''}`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Sales"
              value={money(data.totals.revenue, cur)}
              change={pct(num(data.totals.revenue), num(data.previous.revenue))}
            />
            <Kpi
              label="Profit before expenses"
              value={money(data.totals.profit, cur)}
              change={pct(num(data.totals.profit), num(data.previous.profit))}
            />
            <Kpi
              label="Transactions"
              value={num(data.totals.transactions)}
              change={pct(num(data.totals.transactions), num(data.previous.transactions))}
            />
            <Kpi
              label="Average sale"
              value={money(num(data.totals.revenue) / num(data.totals.transactions), cur)}
            />
          </div>

          {insights.length > 0 && (
            <div className="rounded-xl bg-brand p-5 text-white">
              <h3 className="mb-3 font-semibold">What stands out</h3>
              <ul className="space-y-2">
                {insights.map((t, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Card title="Sales and profit over time">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={charts.daily} margin={{ left: -10, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={24} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 12 }} />
                <Tooltip {...tip} />
                <Legend verticalAlign="top" height={28} />
                <Area type="monotone" dataKey="revenue" name="Sales" stroke={INK} fill={INK} fillOpacity={0.12} strokeWidth={2} />
                <Area type="monotone" dataKey="profit" name="Profit" strokeDasharray="6 4" stroke={AMBER} fill={AMBER} fillOpacity={0.25} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Top sellers by sales">
              <ResponsiveContainer width="100%" height={Math.max(180, charts.top.length * 36)}>
                <BarChart data={charts.top} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                  <Tooltip {...tip} />
                  <Bar dataKey="revenue" name="Sales" fill={INK} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Busiest hours">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={charts.hourly} margin={{ left: -10, right: 8 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={2} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 12 }} />
                  <Tooltip {...tip} />
                  <Bar dataKey="revenue" name="Sales" fill={AMBER} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Average sales by day of the week">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={charts.weekday} margin={{ left: -10, right: 8 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={compact} tick={{ fontSize: 12 }} />
                  <Tooltip {...tip} />
                  <Bar dataKey="revenue" name="Average" fill={SAGE} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card title="How customers pay">
              <PaymentMix payments={data.payments} cur={cur} />
            </Card>
          </div>

          {data.dead_stock.length > 0 && (
            <Card title={`Stock that has not sold in ${days} days`}>
              <ul className="divide-y divide-ink/10 text-sm">
                {data.dead_stock.map((x) => (
                  <li key={x.name} className="flex items-center justify-between py-2">
                    <span className="font-medium">{x.name}</span>
                    <span className="text-ink/70">
                      {num(x.qty)} in stock, {money(x.value, cur)} tied up
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

function Card({ title, children }) {
  return (
    <section className="rounded-xl border border-ink/15 bg-surface p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function Kpi({ label, value, change }) {
  return (
    <div className="rounded-xl border border-ink/15 bg-surface p-4">
      <p className="text-sm text-ink/65">{label}</p>
      <p className="text-2xl font-semibold">{value}</p>
      {change !== undefined && change !== null && (
        <p className={`text-sm font-medium ${change < 0 ? 'text-danger' : 'text-success'}`}>
          {change === 0 ? 'Same as previous period' : `${change > 0 ? 'Up' : 'Down'} ${Math.abs(change)}% vs previous period`}
        </p>
      )}
    </div>
  )
}

function PaymentMix({ payments, cur }) {
  const total = payments.reduce((n, p) => n + num(p.total), 0)
  if (total === 0) return <p className="text-sm text-ink/65">No data yet.</p>
  return (
    <ul className="space-y-4">
      {payments.map((p) => {
        const share = Math.round((num(p.total) / total) * 100)
        return (
          <li key={p.method}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-medium capitalize">{p.method}</span>
              <span className="text-ink/70">
                {money(p.total, cur)} ({share}%)
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-ink/10">
              <div className="h-2.5 rounded-full bg-accent" style={{ width: `${share}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
