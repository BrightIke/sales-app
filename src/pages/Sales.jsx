import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeftRight,
  Banknote,
  CreditCard,
  HandCoins,
  Minus,
  PackageSearch,
  Plus,
  Search,
  ShoppingBag,
  UserPlus,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { money } from '../lib/format'
import Receipt from '../components/Receipt'
import { EmptyState } from '../components/ui'

const methods = [
  { id: 'cash', label: 'Cash', icon: Banknote },
  { id: 'transfer', label: 'Transfer', icon: ArrowLeftRight },
  { id: 'card', label: 'Card', icon: CreditCard },
  { id: 'credit', label: 'Credit', icon: HandCoins },
]

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

export default function Sales() {
  const { business, profile } = useAuth()
  const cur = business.currency
  const showProfit = profile?.role !== 'cashier'
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [items, setItems] = useState([])
  const [customers, setCustomers] = useState([])
  const [todaySales, setTodaySales] = useState([])
  const [cart, setCart] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [method, setMethod] = useState('cash')
  const [customerId, setCustomerId] = useState('')
  const [paidNow, setPaidNow] = useState('')
  const [newCustomer, setNewCustomer] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  async function loadAll() {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const [i, c, s] = await Promise.all([
      supabase.from('items').select('*').eq('is_active', true).order('name'),
      supabase.from('customers').select('id, name, phone, balance_owed').order('name'),
      supabase
        .from('sales')
        .select('id, total, payment_method, created_at, sale_costs(total_cost), sale_items(item_name, quantity)')
        .gte('created_at', start.toISOString())
        .order('created_at', { ascending: false }),
    ])
    if (i.error || c.error || s.error) setError((i.error || c.error || s.error).message)
    setItems(i.data ?? [])
    setCustomers(c.data ?? [])
    setTodaySales(s.data ?? [])
  }

  useEffect(() => {
    loadAll()
  }, [])

  const categories = useMemo(
    () => ['All', ...new Set(items.map((i) => i.category).filter(Boolean))],
    [items]
  )

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      if (category !== 'All' && i.category !== category) return false
      if (!q) return true
      return [i.name, i.category, i.barcode].some((v) => v?.toLowerCase().includes(q))
    })
  }, [items, search, category])

  const lines = cart
    .map((c) => ({ item: items.find((i) => i.id === c.id), qty: c.qty, q: Number(c.qty) }))
    .filter((l) => l.item)
  const total = lines.reduce((sum, l) => sum + (l.q || 0) * Number(l.item.selling_price), 0)
  const customer = customers.find((c) => c.id === customerId)

  const stepFor = (item) => (item.item_type === 'timed_service' ? 0.5 : 1)
  const cap = (item, q) => (item.track_stock ? Math.min(q, Number(item.stock_qty)) : q)

  function add(item) {
    setError('')
    setCart((prev) => {
      const found = prev.find((l) => l.id === item.id)
      if (!found) return [...prev, { id: item.id, qty: '1' }]
      return prev.map((l) =>
        l.id === item.id ? { ...l, qty: String(cap(item, Number(l.qty) + stepFor(item))) } : l
      )
    })
  }

  function step(item, direction) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.id !== item.id) return l
          const next = cap(item, Number(l.qty) + direction * stepFor(item))
          return { ...l, qty: String(next) }
        })
        .filter((l) => Number(l.qty) > 0)
    )
  }

  const setQty = (id, qty) => setCart(cart.map((l) => (l.id === id ? { ...l, qty } : l)))
  const remove = (id) => setCart(cart.filter((l) => l.id !== id))

  async function addCustomer() {
    if (!newCustomer.name.trim()) return
    const { data: newId, error } = await supabase.rpc('save_customer', {
      p_id: null,
      p_name: newCustomer.name,
      p_phone: newCustomer.phone,
      p_email: null,
      p_birthday: null,
      p_notes: null,
    })
    if (error) return setError(error.message)
    const data = {
      id: newId,
      name: newCustomer.name.trim(),
      phone: newCustomer.phone.trim() || null,
      balance_owed: 0,
    }
    setCustomers([...customers, data].sort((a, b) => a.name.localeCompare(b.name)))
    setCustomerId(data.id)
    setNewCustomer(null)
    toast.success('Customer added')
  }

  async function complete() {
    setError('')
    if (lines.length === 0) return setError('Tap an item to add it to the sale.')
    if (lines.some((l) => !(l.q > 0))) return setError('Every quantity must be more than zero.')
    if (method === 'credit' && !customerId) return setError('Choose a customer for a credit sale.')

    setBusy(true)
    const { data: saleId, error } = await supabase.rpc('record_sale', {
      p_items: lines.map((l) => ({ item_id: l.item.id, quantity: l.q })),
      p_payment_method: method,
      p_customer_id: customerId || null,
      p_amount_paid: method === 'credit' ? Number(paidNow) || 0 : null,
    })
    setBusy(false)
    if (error) return setError(error.message)

    setReceipt({
      id: saleId,
      date: new Date().toISOString(),
      lines: lines.map((l) => ({ name: l.item.name, qty: l.q, price: Number(l.item.selling_price) })),
      total,
      method,
      customer: customer ?? null,
      paid: method === 'credit' ? Math.min(Number(paidNow) || 0, total) : total,
    })
    setCart([])
    setPaidNow('')
    setMethod('cash')
    setCustomerId('')
    setSheetOpen(false)
    loadAll()
  }

  const salesTotal = todaySales.reduce((s, x) => s + Number(x.total), 0)
  const profit = todaySales.reduce((s, x) => s + Number(x.total) - Number(x.sale_costs?.total_cost ?? 0), 0)
  const itemCount = lines.length

  // The sale panel is a side column on computers and a bottom sheet on phones
  const sheetHidden = !isDesktop && !sheetOpen

  return (
    <div className="space-y-5">
      {/* Today strip */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
        <p className="text-ink/65">
          Sales today <span className="num ml-1 text-base font-semibold text-ink">{money(salesTotal, cur)}</span>
        </p>
        <p className="text-ink/65">
          Transactions <span className="num ml-1 text-base font-semibold text-ink">{todaySales.length}</span>
        </p>
        {showProfit && (
          <p className="text-ink/65">
            Profit <span className="num ml-1 text-base font-semibold text-ink">{money(profit, cur)}</span>
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* ---------- Items ---------- */}
        <section className="space-y-3">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/65" />
            <input
              className="field pl-10"
              placeholder="Search items"
              aria-label="Search items"
              inputMode="search"
              enterKeyHint="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {categories.length > 2 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`whitespace-nowrap rounded-full border px-4 py-2.5 text-sm font-medium ${
                    category === c
                      ? 'border-brand bg-brand text-brand-fg'
                      : 'border-line bg-surface text-ink/80'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          {items.length === 0 ? (
            <EmptyState icon={PackageSearch} title="No items yet">
              Add your products and services on the Items page, then come back to sell them.
            </EmptyState>
          ) : shown.length === 0 ? (
            <p className="py-10 text-center text-ink/65">Nothing matches your search.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((i) => {
                const out = i.track_stock && Number(i.stock_qty) <= 0
                const lowStock = i.track_stock && !out && Number(i.stock_qty) <= Number(i.reorder_level)
                const inCart = cart.find((c) => c.id === i.id)
                return (
                  <button
                    key={i.id}
                    onClick={() => add(i)}
                    disabled={out}
                    className={`relative flex min-h-[6.5rem] flex-col justify-between rounded-2xl border bg-surface p-3.5 text-left hover:border-accent disabled:opacity-45 ${
                      inCart ? 'border-accent ring-1 ring-accent' : 'border-line'
                    }`}
                  >
                    {inCart && (
                      <span className="num absolute right-2.5 top-2.5 grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-xs font-bold text-accent-fg">
                        {inCart.qty}
                      </span>
                    )}
                    <span className="line-clamp-2 pr-7 font-medium leading-snug">{i.name}</span>
                    <span>
                      <span className="num block text-lg font-semibold">
                        {money(i.selling_price, cur)}
                        {i.item_type === 'timed_service' && (
                          <span className="text-sm font-normal text-ink/65"> /hr</span>
                        )}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink/65">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            out ? 'bg-danger' : lowStock ? 'bg-accent' : i.track_stock ? 'bg-success' : 'bg-ink/30'
                          }`}
                        />
                        {out
                          ? 'Out of stock'
                          : i.track_stock
                            ? `${lowStock ? 'Low, ' : ''}${Number(i.stock_qty)} left`
                            : 'Service'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </section>

        {/* ---------- Current sale: side panel (computer) / bottom sheet (phone) ---------- */}
        {!isDesktop && sheetOpen && (
          <div className="fade-in fixed inset-0 z-40 bg-black/45" onClick={() => setSheetOpen(false)} />
        )}

        <aside
          inert={sheetHidden}
          aria-label="Current sale"
          className={`fixed inset-x-0 bottom-0 z-50 flex max-h-[88dvh] flex-col rounded-t-3xl border border-line bg-surface shadow-2xl transition-transform duration-[260ms] ease-drawer lg:inset-x-auto lg:bottom-auto lg:sticky lg:top-6 lg:z-auto lg:max-h-[calc(100dvh-3rem)] lg:translate-y-0 lg:self-start lg:rounded-2xl lg:shadow-none ${
            sheetOpen ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h3 className="text-lg font-semibold">Current sale</h3>
            <button
              onClick={() => setSheetOpen(false)}
              aria-label="Close"
              className="-mr-2 rounded-lg p-3 text-ink/65 lg:hidden"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-4">
            {lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink/65">Tap an item to start a sale.</p>
            ) : (
              <ul className="divide-y divide-dashed divide-ink/25">
                {lines.map((l) => (
                  <li key={l.item.id} className="py-3">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-medium">{l.item.name}</p>
                      <span className="num text-sm font-semibold">
                        {money((l.q || 0) * l.item.selling_price, cur)}
                      </span>
                      <button
                        onClick={() => remove(l.item.id)}
                        aria-label={`Remove ${l.item.name}`}
                        className="-mr-3 -my-3 grid h-11 w-11 place-items-center rounded-lg text-ink/65 hover:text-danger"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="num text-xs text-ink/65">{money(l.item.selling_price, cur)} each</p>
                      <div className="flex items-center rounded-xl border border-line">
                        <button
                          onClick={() => step(l.item, -1)}
                          aria-label={`Fewer ${l.item.name}`}
                          className="grid h-11 w-11 place-items-center rounded-l-xl hover:bg-surface-2"
                        >
                          <Minus size={16} />
                        </button>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step={l.item.item_type === 'timed_service' ? 0.5 : 1}
                          value={l.qty}
                          onChange={(e) => setQty(l.item.id, e.target.value)}
                          aria-label={`Quantity of ${l.item.name}`}
                          className="num h-11 w-12 border-x border-line bg-transparent text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          onClick={() => step(l.item, 1)}
                          aria-label={`More ${l.item.name}`}
                          className="grid h-11 w-11 place-items-center rounded-r-xl hover:bg-surface-2"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div>
              <p className="mb-2 text-sm font-medium text-ink/70">Payment</p>
              <div className="grid grid-cols-4 gap-2">
                {methods.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setMethod(id)}
                    aria-pressed={method === id}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium ${
                      method === id
                        ? 'border-brand bg-brand text-brand-fg'
                        : 'border-line bg-surface text-ink/80'
                    }`}
                  >
                    <Icon size={18} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="customer" className="text-sm font-medium text-ink/70">
                Customer {method === 'credit' ? '(required)' : '(optional)'}
              </label>
              <div className="flex gap-2">
                <select
                  id="customer"
                  className="field"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">Walk-in customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setNewCustomer({ name: '', phone: '' })}
                  aria-label="Add a new customer"
                  className="grid w-12 shrink-0 place-items-center rounded-xl border border-line hover:bg-surface-2"
                >
                  <UserPlus size={18} />
                </button>
              </div>

              {newCustomer && (
                <div className="space-y-2 rounded-xl bg-surface-2 p-3">
                  <input
                    className="field"
                    placeholder="Customer name"
                    aria-label="Customer name"
                    autoComplete="off"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  />
                  <input
                    className="field"
                    type="tel"
                    inputMode="tel"
                    placeholder="Phone (optional)"
                    aria-label="Customer phone"
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  />
                  <div className="flex gap-3">
                    <button onClick={addCustomer} className="rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-brand-fg">
                      Save customer
                    </button>
                    <button onClick={() => setNewCustomer(null)} className="text-sm underline">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {customer && Number(customer.balance_owed) > 0 && (
                <p className="text-sm text-danger">Already owes {money(customer.balance_owed, cur)}</p>
              )}
            </div>

            {method === 'credit' && (
              <div className="space-y-1.5">
                <label htmlFor="paid" className="text-sm font-medium text-ink/70">
                  Paid now (leave empty if nothing)
                </label>
                <input
                  id="paid"
                  className="field"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={paidNow}
                  onChange={(e) => setPaidNow(e.target.value)}
                />
                <p className="text-sm text-ink/70">
                  Added to debt: {money(Math.max(total - (Number(paidNow) || 0), 0), cur)}
                </p>
              </div>
            )}

            {error && (
              <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
          </div>

          <div className="border-t border-dashed border-ink/25 px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-ink/70">Total</span>
              <span className="num text-3xl font-semibold">{money(total, cur)}</span>
            </div>
            <button
              onClick={complete}
              disabled={busy || lines.length === 0}
              className="w-full rounded-xl bg-accent py-3.5 text-lg font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {busy ? 'Saving...' : lines.length === 0 ? 'Complete sale' : `Charge ${money(total, cur)}`}
            </button>
          </div>
        </aside>
      </div>

      {/* ---------- Today's sales ---------- */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Today's sales</h3>
        {todaySales.length === 0 ? (
          <p className="text-ink/65">No sales recorded yet today.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {todaySales.slice(0, 10).map((s) => (
              <li key={s.id} className="flex items-center gap-4 p-4 text-sm">
                <span className="w-16 shrink-0 text-ink/65">
                  {new Date(s.created_at).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' })}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {s.sale_items.map((x) => `${Number(x.quantity)} x ${x.item_name}`).join(', ')}
                </span>
                <span className="hidden capitalize text-ink/65 sm:block">{s.payment_method}</span>
                <span className="num shrink-0 font-semibold">{money(s.total, cur)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Phone: sticky bar that opens the sale ---------- */}
      {itemCount > 0 && !isDesktop && !sheetOpen && (
        <button
          onClick={() => setSheetOpen(true)}
          className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] z-20 flex items-center justify-between rounded-2xl bg-brand px-4 py-3.5 text-brand-fg shadow-xl"
        >
          <span className="flex items-center gap-2 font-medium">
            <ShoppingBag size={20} />
            {itemCount} item{itemCount > 1 ? 's' : ''}
          </span>
          <span className="num text-lg font-semibold">{money(total, cur)}</span>
        </button>
      )}

      {receipt && <Receipt receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}
