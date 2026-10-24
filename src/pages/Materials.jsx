import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Layers } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { money } from '../lib/format'
import { UNITS, materialUnitCost, num, perUnitMoney } from '../lib/costing'
import { Badge, EmptyState, Field, PageHeader } from '../components/ui'

const blank = { name: '', unit: 'piece', pack_size: '', pack_cost: '', track: false, opening: '', reorder: '' }

export default function Materials() {
  const { business } = useAuth()
  const cur = business.currency

  const [materials, setMaterials] = useState([])
  const [usage, setUsage] = useState({}) // material id -> how many items use it
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [restock, setRestock] = useState(null)
  const [count, setCount] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [m, l] = await Promise.all([
      supabase.from('materials').select('*').eq('is_active', true).order('name'),
      supabase.from('item_cost_lines').select('material_id, item_id'),
    ])
    if (m.error || l.error) setError((m.error || l.error).message)
    const used = {}
    for (const row of l.data ?? []) {
      if (!row.material_id) continue
      used[row.material_id] = (used[row.material_id] ?? new Set()).add(row.item_id)
    }
    setUsage(Object.fromEntries(Object.entries(used).map(([k, v]) => [k, v.size])))
    setMaterials(m.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const closeAll = () => {
    setForm(null)
    setEditingId(null)
    setRestock(null)
    setCount(null)
    setError('')
  }

  function openNew() {
    closeAll()
    setForm({ ...blank })
  }

  function openEdit(m) {
    closeAll()
    setEditingId(m.id)
    setForm({
      name: m.name,
      unit: m.unit,
      pack_size: String(num(m.pack_size)),
      pack_cost: String(num(m.pack_cost)),
      track: m.track_stock,
      opening: '',
      reorder: String(num(m.reorder_level)),
    })
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function save(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.rpc('save_material', {
      p_id: editingId,
      p_name: form.name,
      p_unit: form.unit,
      p_pack_size: Number(form.pack_size),
      p_pack_cost: Number(form.pack_cost),
      p_track_stock: form.track,
      p_opening_stock: !editingId && form.track ? Number(form.opening) || 0 : 0,
      p_reorder: form.track ? Number(form.reorder) || 0 : 0,
    })
    setBusy(false)
    if (error) return setError(error.message)
    toast.success(editingId ? 'Material updated. Items that use it were re-costed.' : 'Material added')
    closeAll()
    load()
  }

  async function archive(m) {
    const n = usage[m.id] ?? 0
    const warning = n > 0 ? ` It is used in ${n} item${n > 1 ? 's' : ''}, which will keep counting its cost.` : ''
    if (!window.confirm(`Archive "${m.name}"?${warning}`)) return
    const { error } = await supabase.rpc('archive_material', { p_id: m.id })
    if (error) return setError(error.message)
    toast.success('Material archived')
    load()
  }

  async function submitRestock(e) {
    e.preventDefault()
    setError('')
    const packs = Number(restock.packs)
    const price = Number(restock.price)
    if (!(packs > 0)) return setError('Enter how many packs you bought.')
    if (restock.price === '' || price < 0) return setError('Enter the price of one pack.')
    setBusy(true)
    const m = restock.material
    const { error } = await supabase.rpc('adjust_material', {
      p_material_id: m.id,
      p_change: packs * num(m.pack_size),
      p_reason: 'purchase',
      p_note: restock.note.trim() || null,
      p_new_pack_cost: price !== num(m.pack_cost) ? price : null,
    })
    setBusy(false)
    if (error) return setError(error.message)
    toast.success(price !== num(m.pack_cost) ? 'Restocked, and the new price updated your item costs' : 'Restocked')
    closeAll()
    load()
  }

  async function submitCount(e) {
    e.preventDefault()
    setError('')
    if (count.counted === '' || Number(count.counted) < 0) return setError('Enter the number you counted.')
    const change = Number(count.counted) - num(count.material.stock_qty)
    if (change === 0) return setError('That matches the current count, so nothing to change.')
    setBusy(true)
    const { error } = await supabase.rpc('adjust_material', {
      p_material_id: count.material.id,
      p_change: change,
      p_reason: 'adjustment',
      p_note: 'Count correction',
      p_new_pack_cost: null,
    })
    setBusy(false)
    if (error) return setError(error.message)
    toast.success('Count corrected')
    closeAll()
    load()
  }

  const preview = form && num(form.pack_size) > 0 ? materialUnitCost({ pack_size: form.pack_size, pack_cost: form.pack_cost }) : null

  return (
    <div className="space-y-6">
      <PageHeader
        title="Materials"
        subtitle="The things you use up to make or sell: paper, toner, rice, oil, packaging. Add what a pack costs and Akanti works out the cost of one."
      >
        <button onClick={openNew} className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-fg hover:bg-accent-hover">
          Add material
        </button>
      </PageHeader>

      {form && (
        <form onSubmit={save} className="card space-y-4 p-5">
          <h3 className="font-semibold">{editingId ? 'Edit material' : 'New material'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <input className="field" value={form.name} onChange={set('name')} placeholder="e.g. A4 paper" required />
            </Field>
            <Field label="Unit" hint="what you count it in">
              <input className="field" list="material-units" value={form.unit} onChange={set('unit')} required />
              <datalist id="material-units">
                {UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </Field>
            <Field label="One pack holds" hint={`how many ${form.unit || 'units'}`}>
              <input className="field" type="number" min="0" step="any" value={form.pack_size} onChange={set('pack_size')} placeholder="e.g. 500" required />
            </Field>
            <Field label="One pack costs" hint={cur}>
              <input className="field" type="number" min="0" step="0.01" value={form.pack_cost} onChange={set('pack_cost')} placeholder="e.g. 6500" required />
            </Field>
          </div>

          {preview !== null && form.pack_cost !== '' && (
            <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm">
              So one {form.unit || 'unit'} costs you <strong className="num">{perUnitMoney(preview, cur)}</strong>.
            </p>
          )}

          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" checked={form.track} onChange={set('track')} className="mt-1 h-5 w-5" />
            <span>
              <span className="font-medium">Keep count of how much I have left</span>
              <span className="block text-ink/65">
                Each sale then uses some up, and you can see when to buy more. It never stops a sale.
              </span>
            </span>
          </label>

          {form.track && (
            <div className="grid gap-3 sm:grid-cols-2">
              {!editingId && (
                <Field label="How many do you have now?" hint={form.unit}>
                  <input className="field" type="number" min="0" step="any" value={form.opening} onChange={set('opening')} />
                </Field>
              )}
              <Field label="Warn me when I have" hint={`${form.unit} or fewer left`}>
                <input className="field" type="number" min="0" step="any" value={form.reorder} onChange={set('reorder')} />
              </Field>
            </div>
          )}

          {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex gap-3">
            <button disabled={busy} className="rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-fg hover:bg-brand-hover disabled:opacity-60">
              {busy ? 'Saving...' : 'Save material'}
            </button>
            <button type="button" onClick={closeAll} className="px-3 py-2 text-sm underline">
              Cancel
            </button>
          </div>
        </form>
      )}

      {restock && (
        <form onSubmit={submitRestock} className="card space-y-3 p-5">
          <h3 className="font-semibold">Restock: {restock.material.name}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="How many packs did you buy?" hint={`1 pack = ${num(restock.material.pack_size)} ${restock.material.unit}`}>
              <input className="field" type="number" min="0" step="any" value={restock.packs} onChange={(e) => setRestock({ ...restock, packs: e.target.value })} autoFocus />
            </Field>
            <Field label="Price of one pack" hint={cur}>
              <input className="field" type="number" min="0" step="0.01" value={restock.price} onChange={(e) => setRestock({ ...restock, price: e.target.value })} />
            </Field>
            <Field label="Note" hint="Optional" className="sm:col-span-2">
              <input className="field" value={restock.note} onChange={(e) => setRestock({ ...restock, note: e.target.value })} />
            </Field>
          </div>
          <p className="text-sm text-ink/65">If the price changed, every item that uses this material is re-costed.</p>
          {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex gap-3">
            <button disabled={busy} className="rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-fg disabled:opacity-60">
              {busy ? 'Saving...' : 'Save restock'}
            </button>
            <button type="button" onClick={closeAll} className="px-3 py-2 text-sm underline">
              Cancel
            </button>
          </div>
        </form>
      )}

      {count && (
        <form onSubmit={submitCount} className="card space-y-3 p-5">
          <h3 className="font-semibold">Correct the count: {count.material.name}</h3>
          <p className="text-sm text-ink/65">
            Akanti thinks you have {num(count.material.stock_qty)} {count.material.unit}.
          </p>
          <Field label={`How many ${count.material.unit} do you actually have?`}>
            <input className="field" type="number" min="0" step="any" value={count.counted} onChange={(e) => setCount({ ...count, counted: e.target.value })} autoFocus />
          </Field>
          {error && <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex gap-3">
            <button disabled={busy} className="rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-fg disabled:opacity-60">
              {busy ? 'Saving...' : 'Save count'}
            </button>
            <button type="button" onClick={closeAll} className="px-3 py-2 text-sm underline">
              Cancel
            </button>
          </div>
        </form>
      )}

      {!form && !restock && !count && error && <p className="text-sm text-danger">{error}</p>}

      {loading ? (
        <p className="text-ink/65">Loading materials...</p>
      ) : materials.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No materials yet"
          action={
            <button onClick={openNew} className="rounded-xl bg-accent px-4 py-2.5 font-semibold text-accent-fg hover:bg-accent-hover">
              Add your first material
            </button>
          }
        >
          Add what you use up: paper, toner, rice, oil, gas, packaging. Then open any item on the Items page and tap
          Costing to build its cost.
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-line">
          {materials.map((m) => {
            const stock = num(m.stock_qty)
            const short = m.track_stock && stock < 0
            const low = m.track_stock && !short && num(m.reorder_level) > 0 && stock <= num(m.reorder_level)
            const n = usage[m.id] ?? 0
            return (
              <li key={m.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-sm text-ink/65">
                      {money(m.pack_cost, cur)} for {num(m.pack_size)} {m.unit}, so{' '}
                      <span className="num font-medium text-ink">{perUnitMoney(materialUnitCost(m), cur)}</span> per {m.unit}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink/65">
                      {m.track_stock ? (
                        <>
                          <span className="num">
                            {stock} {m.unit} left
                          </span>
                          {low && <Badge tone="warning">Low</Badge>}
                          {short && <Badge tone="danger">Short: restock or correct the count</Badge>}
                        </>
                      ) : (
                        <span>Not counting stock</span>
                      )}
                      <span>{n > 0 ? `Used in ${n} item${n > 1 ? 's' : ''}` : 'Not used in any item yet'}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-4 text-sm">
                    {m.track_stock && (
                      <>
                        <button
                          onClick={() => {
                            closeAll()
                            setRestock({ material: m, packs: '', price: String(num(m.pack_cost)), note: '' })
                          }}
                          className="underline"
                        >
                          Restock
                        </button>
                        <button
                          onClick={() => {
                            closeAll()
                            setCount({ material: m, counted: '' })
                          }}
                          className="underline"
                        >
                          Count
                        </button>
                      </>
                    )}
                    <button onClick={() => openEdit(m)} className="underline">
                      Edit
                    </button>
                    <button onClick={() => archive(m)} className="text-danger underline">
                      Archive
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
