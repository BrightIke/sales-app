import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, CircleCheck, HandCoins, ShoppingCart, TrendingDown, TrendingUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { money } from '../lib/format'
import { Badge, EmptyState } from '../components/ui'

const num = (x) => Number(x) || 0
const dayKey = (d) => new Date(d).toLocaleDateString('en-CA')

export default function Dashboard({ go }) {
  const { business, profile, hasModule } = useAuth()
  const cur = business.currency
  const isCashier = profile?.role === 'cashier'

  const [data, setData] = useState(null)

  useEffect(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - 6)

    Promise.all([
      supabase.from('sales').select('total, created_at, sale_costs(total_cost)').gte('created_at', start.toISOString()),
      supabase
        .from('sales')
        .select('id, total, payment_method, created_at, sale_items(item_name, quantity)')
        .order('created_at', { ascending: false })
        .limit(5),
      hasModule('inventory')
        ? supabase
            .from('items')
            .select('name, stock_qty, reorder_level')
            .eq('is_active', true)
            .eq('track_stock', true)
        : Promise.resolve({ data: [] }),
      hasModule('customers')
        ? supabase
            .from('customers')
            .select('name, balance_owed')
            .gt('balance_owed', 0)
            .order('balance_owed', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]).then(([s, r, i, c]) =>
      setData({
        sales: s.data ?? [],
        recent: r.data ?? [],
        items: i.data ?? [],
        debtors: c.data ?? [],
      })
    )
  }, [])

  if (!data) return <p className="text-ink/65">Loading your day...</p>

  const days = Array.from({ length: 7 }, (_, k) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - k))
    return d
  })
  const series = days.map((d, k) => ({
    label: d.toLocaleDateString('en-NG', { weekday: 'short' }).slice(0, 2),
    today: k === 6,
    revenue: data.sales
      .filter((s) => dayKey(s.created_at) === dayKey(d))
      .reduce((n, s) => n + num(s.total), 0),
  }))
  const today = series[6].revenue
  const yesterday = series[5].revenue
  const change = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : null
  const todaySales = data.sales.filter((s) => dayKey(s.created_at) === dayKey(days[6]))
  const profit = todaySales.reduce((n, s) => n + num(s.total) - num(s.sale_costs?.total_cost), 0)

  const low = data.items.filter((i) => num(i.stock_qty) <= num(i.reorder_level))
  const owed = data.debtors.reduce((n, c) => n + num(c.balance_owed), 0)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = profile?.full_name?.split(' ')[0]

  const attention = []
  if (low.length > 0)
    attention.push({
      key: 'low',
      icon: AlertTriangle,
      title: `${low.length} item${low.length > 1 ? 's' : ''} running low`,
      body: low.slice(0, 3).map((i) => i.name).join(', ') + (low.length > 3 ? ' and more' : ''),
      action: isCashier ? null : () => go('stock'),
      label: 'Restock',
    })
  if (data.debtors.length > 0)
    attention.push({
      key: 'debt',
      icon: HandCoins,
      title: `${money(owed, cur)} owed to you`,
      body: `${data.debtors.length} customer${data.debtors.length > 1 ? 's' : ''} owe you money`,
      action: () => go('customers'),
      label: 'View',
    })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold md:text-3xl">
            {greeting}
            {firstName ? `, ${firstName}` : ''}
          </h2>
          <p className="text-sm text-ink/65">
            {new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <button
          onClick={() => go('sales')}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3.5 text-lg font-semibold text-accent-fg hover:bg-accent-hover sm:w-auto"
        >
          <ShoppingCart size={22} /> New sale
        </button>
      </div>

      {/* Hero: today at a glance */}
      <section className="grid gap-6 rounded-3xl bg-brand p-6 text-brand-fg md:grid-cols-[1.1fr_1fr] md:p-8">
        <div>
          <p className="text-sm text-brand-fg/60">Sales today</p>
          <p className="num mt-1 text-5xl font-semibold tracking-tight">{money(today, cur)}</p>
          {change !== null && (
            <p
              className={`mt-2 flex items-center gap-1.5 text-sm font-medium ${
                change < 0 ? 'text-red-300' : 'text-emerald-300'
              }`}
            >
              {change < 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
              {change === 0 ? 'Same as yesterday' : `${Math.abs(change)}% ${change > 0 ? 'up' : 'down'} on yesterday`}
            </p>
          )}
          <dl className="mt-6 flex gap-8">
            {!isCashier && (
              <div>
                <dt className="text-sm text-brand-fg/60">Profit today</dt>
                <dd className="num text-xl font-semibold">{money(profit, cur)}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-brand-fg/60">Transactions</dt>
              <dd className="num text-xl font-semibold">{todaySales.length}</dd>
            </div>
          </dl>
        </div>

        <div>
          <p className="mb-2 text-sm text-brand-fg/60">This week</p>
          <WeekBars series={series} cur={cur} />
        </div>
      </section>

      {/* Needs attention */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Needs your attention</h3>
        {attention.length === 0 ? (
          <div className="card flex items-center gap-3 p-4 text-ink/70">
            <CircleCheck size={22} className="text-success" />
            All clear. Nothing needs your attention right now.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {attention.map(({ key, icon: Icon, title, body, action, label }) => (
              <div key={key} className="card flex items-start gap-3 p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warning/20">
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{title}</p>
                  <p className="truncate text-sm text-ink/65">{body}</p>
                </div>
                {action && (
                  <button onClick={action} className="flex items-center gap-1 pt-0.5 text-sm font-medium underline">
                    {label} <ArrowRight size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent sales */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Recent sales</h3>
        {data.recent.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="No sales yet"
            action={
              <button
                onClick={() => go('sales')}
                className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-fg hover:bg-accent-hover"
              >
                Record your first sale
              </button>
            }
          >
            Your day will come alive here as soon as you record a sale.
          </EmptyState>
        ) : (
          <ul className="card divide-y divide-line">
            {data.recent.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 p-4 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {s.sale_items.map((x) => `${num(x.quantity)} x ${x.item_name}`).join(', ')}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-ink/65">
                    {new Date(s.created_at).toLocaleString('en-NG', {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    <Badge tone={s.payment_method === 'credit' ? 'accent' : 'neutral'}>
                      <span className="capitalize">{s.payment_method}</span>
                    </Badge>
                  </p>
                </div>
                <p className="num shrink-0 text-base font-semibold">{money(s.total, cur)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

// Seven plain bars. Drawn with HTML so the Home page does not need to
// download a chart library (that only loads on the Analytics page).
function WeekBars({ series, cur }) {
  const max = Math.max(...series.map((d) => d.revenue), 1)
  const summary = series.map((d) => `${d.label} ${money(d.revenue, cur)}`).join(', ')
  return (
    <div role="img" aria-label={`Sales over the last 7 days: ${summary}`} className="flex h-[120px] items-end gap-2">
      {series.map((d, i) => (
        <div key={i} title={`${d.label}: ${money(d.revenue, cur)}`} className="flex h-full flex-1 flex-col">
          <div className="flex flex-1 items-end">
            <div
              className={`w-full rounded-t-md ${d.today ? 'bg-accent' : 'bg-white/30'}`}
              style={{ height: `${Math.max((d.revenue / max) * 100, d.revenue > 0 ? 4 : 2)}%` }}
            />
          </div>
          <span className="mt-1.5 text-center text-xs text-brand-fg/65">{d.label}</span>
        </div>
      ))}
    </div>
  )
}
