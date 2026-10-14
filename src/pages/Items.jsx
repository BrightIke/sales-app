import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { money } from '../lib/format'
import { Field } from '../components/ui'

const typeLabels = {
  product: 'Product',
  service: 'Service',
  timed_service: 'Timed service',
}

const empty = {
  name: '',
  item_type: 'product',
  category: '',
  barcode: '',
  cost_price: '',
  selling_price: '',
  stock_qty: '',
  reorder_level: '',
}

const field =
  'w-full rounded-xl border border-ink/55 bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent'

export default function Items() {
  const { business, profile } = useAuth()
  const canManage = profile?.role !== 'cashier'

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('items')
      .select('*, item_costs(cost_price)')
      .eq('is_active', true)
      .order('name')
    if (error) setError(error.message)
    else setItems(data.map((x) => ({ ...x, cost_price: x.item_costs?.cost_price ?? 0 })))
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((i) =>
      [i.name, i.category, i.barcode].some((v) => v?.toLowerCase().includes(q))
    )
  }, [items, search])

  function openNew() {
    setEditingId(null)
    setForm({ ...empty })
    setError('')
  }

  function openEdit(item) {
    setEditingId(item.id)
    setForm({
      name: item.name,
      item_type: item.item_type,
      category: item.category ?? '',
      barcode: item.barcode ?? '',
      cost_price: String(item.cost_price),
      selling_price: String(item.selling_price),
      stock_qty: '',
      reorder_level: String(item.reorder_level),
    })
    setError('')
  }

  function closeForm() {
    setForm(null)
    setEditingId(null)
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  async function save(e) {
    e.preventDefault()
    setError('')
    setBusy(true)

    const tracked = form.item_type === 'product'
    const { error } = await supabase.rpc('save_item', {
      p_id: editingId,
      p_name: form.name.trim(),
      p_item_type: form.item_type,
      p_category: form.category.trim() || null,
      p_barcode: form.barcode.trim() || null,
      p_cost: Number(form.cost_price) || 0,
      p_price: Number(form.selling_price) || 0,
      p_opening_stock: !editingId && tracked ? Number(form.stock_qty) || 0 : 0,
      p_reorder: tracked ? Number(form.reorder_level) || 0 : 0,
    })
    setBusy(false)
    if (error) return setError(error.message)

    toast.success(editingId ? 'Item updated' : 'Item added')
    closeForm()
    load()
  }

  async function archive(item) {
    if (!window.confirm(`Archive "${item.name}"? It will be hidden from the list and sales screen.`))
      return
    const { error } = await supabase.rpc('archive_item', { p_id: item.id })
    if (error) setError(error.message)
    else {
      toast.success('Item archived')
      load()
    }
  }

  const isTimed = form?.item_type === 'timed_service'
  const isProduct = form?.item_type === 'product'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Items</h2>
        <div className="flex gap-3">
          <input
            className={`${field} w-56`}
            placeholder="Search name, category, barcode" aria-label="Search name, category, barcode"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {canManage && (
            <button
              onClick={openNew}
              className="whitespace-nowrap rounded-xl bg-accent px-4 py-2 font-medium hover:bg-accent-hover"
            >
              Add item
            </button>
          )}
        </div>
      </div>

      {form && (
        <form onSubmit={save} className="space-y-4 rounded-xl border border-ink/15 bg-surface p-5">
          <h3 className="font-semibold">{editingId ? 'Edit item' : 'New item'}</h3>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Item name"><input className={field} value={form.name} onChange={set('name')} required /></Field>
            <Field label="Type"><select className={field} value={form.item_type} onChange={set('item_type')}>
              <option value="product">Product (stock is tracked)</option>
              <option value="service">Service (no stock)</option>
              <option value="timed_service">Timed service (charged per hour)</option>
            </select></Field>
            <Field label="Category" hint="Optional"><input className={field} value={form.category} onChange={set('category')} /></Field>
            <Field label="Barcode" hint="Optional"><input className={field} value={form.barcode} onChange={set('barcode')} /></Field>
            <Field label="Cost price" hint="What it costs you"><input
              className={field}
              type="number"
              min="0"
              step="0.01"
              value={form.cost_price}
              onChange={set('cost_price')}
            /></Field>
            <Field label={isTimed ? 'Selling price per hour' : 'Selling price'}><input
              className={field}
              type="number"
              min="0"
              step="0.01"
              value={form.selling_price}
              onChange={set('selling_price')}
              required
            /></Field>
            {isProduct && !editingId && (
              <Field label="Opening stock" hint="How many you have now"><input
                className={field}
                type="number"
                min="0"
                step="0.01"
                value={form.stock_qty}
                onChange={set('stock_qty')}
              /></Field>
            )}
            {isProduct && (
              <Field label="Warn me when stock falls to"><input
                className={field}
                type="number"
                min="0"
                step="0.01"
                value={form.reorder_level}
                onChange={set('reorder_level')}
              /></Field>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-3">
            <button
              disabled={busy}
              className="rounded-xl bg-brand px-4 py-2 font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {busy ? 'Saving...' : 'Save item'}
            </button>
            <button type="button" onClick={closeForm} className="px-3 py-2 text-sm underline">
              Cancel
            </button>
          </div>
        </form>
      )}

      {!form && error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-ink/65">Loading items...</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink/30 p-8 text-center text-ink/70">
          {items.length === 0
            ? 'No items yet. Add your first product or service to get started.'
            : 'No items match your search.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/15 bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/15 text-ink/65">
              <tr>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Type</th>
                {canManage && <th className="px-4 py-3 font-medium">Cost</th>}
                <th className="px-4 py-3 font-medium">Price</th>
                {canManage && <th className="px-4 py-3 font-medium">Margin</th>}
                <th className="px-4 py-3 font-medium">Stock</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {visible.map((i) => {
                const margin =
                  i.selling_price > 0
                    ? Math.round(((i.selling_price - i.cost_price) / i.selling_price) * 100)
                    : 0
                const low = i.track_stock && Number(i.stock_qty) <= Number(i.reorder_level)
                return (
                  <tr key={i.id} className="border-b border-ink/10 last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium">{i.name}</span>
                      {i.category && <span className="block text-ink/65">{i.category}</span>}
                    </td>
                    <td className="px-4 py-3">{typeLabels[i.item_type]}</td>
                    {canManage && <td className="px-4 py-3">{money(i.cost_price, business.currency)}</td>}
                    <td className="px-4 py-3">
                      {money(i.selling_price, business.currency)}
                      {i.item_type === 'timed_service' && ' /hr'}
                    </td>
                    {canManage && <td className="px-4 py-3">{margin}%</td>}
                    <td className="px-4 py-3">
                      {i.track_stock ? (
                        <>
                          {Number(i.stock_qty)}
                          {low && (
                            <span className="ml-2 rounded bg-accent/30 px-1.5 py-0.5 text-xs font-medium">
                              Low
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-ink/65">Not tracked</span>
                      )}
                    </td>
                    {canManage && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button onClick={() => openEdit(i)} className="mr-3 underline">
                          Edit
                        </button>
                        <button onClick={() => archive(i)} className="text-danger underline">
                          Archive
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
