import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { money } from '../lib/format'
import { checkSheet, costSheetTotals, lineBatchCost, num, perUnitMoney } from '../lib/costing'
import { Field } from './ui'

let nextKey = 0
const newLine = (kind) => ({ key: ++nextKey, kind, material_id: '', qty: '', label: '', cost: '', lifetime_uses: '' })

function toPayload(l) {
  if (l.kind === 'material') return { kind: 'material', material_id: l.material_id, qty: Number(l.qty) }
  if (l.kind === 'extra') return { kind: 'extra', label: l.label.trim(), cost: Number(l.cost) }
  return { kind: 'equipment', label: l.label.trim(), cost: Number(l.cost), lifetime_uses: Number(l.lifetime_uses) }
}

export default function CostBuilder({ item, go, onClose, onSaved }) {
  const { business } = useAuth()
  const cur = business.currency

  const [loading, setLoading] = useState(true)
  const [materials, setMaterials] = useState([])
  const [lines, setLines] = useState([])
  const [yieldQty, setYieldQty] = useState('1')
  const [wastePct, setWastePct] = useState('0')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from('materials').select('*').order('name'),
      supabase.from('item_cost_lines').select('*').eq('item_id', item.id).order('position'),
      supabase.from('item_costs').select('yield_qty, waste_pct, cost_mode').eq('item_id', item.id).maybeSingle(),
    ]).then(([m, l, c]) => {
      if (cancelled) return
      setMaterials(m.data ?? [])
      setLines(
        (l.data ?? []).map((r) => ({
          key: ++nextKey,
          kind: r.kind,
          material_id: r.material_id ?? '',
          qty: r.qty == null ? '' : String(num(r.qty)),
          label: r.label ?? '',
          cost: r.cost == null ? '' : String(num(r.cost)),
          lifetime_uses: r.lifetime_uses == null ? '' : String(num(r.lifetime_uses)),
        }))
      )
      if (c.data?.cost_mode === 'built') {
        setYieldQty(String(num(c.data.yield_qty)))
        setWastePct(String(num(c.data.waste_pct)))
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [item.id])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const byId = useMemo(() => Object.fromEntries(materials.map((m) => [m.id, m])), [materials])
  const activeCount = materials.filter((m) => m.is_active).length
  const totals = costSheetTotals({ lines, yieldQty, wastePct }, byId)
  const price = num(item.selling_price)
  const profit = price - totals.perUnit
  const margin = price > 0 ? Math.round((profit / price) * 100) : 0

  const update = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const remove = (key) => setLines((ls) => ls.filter((l) => l.key !== key))
  const add = (kind) => setLines((ls) => [...ls, newLine(kind)])

  async function save() {
    setError('')
    const problem = checkSheet({ lines, yieldQty, wastePct })
    if (problem) return setError(problem)
    setBusy(true)
    const { data, error } = await supabase.rpc('save_cost_sheet', {
      p_item_id: item.id,
      p_mode: 'built',
      p_yield: Number(yieldQty),
      p_waste: Number(wastePct),
      p_lines: lines.map(toPayload),
    })
    setBusy(false)
    if (error) return setError(error.message)
    toast.success(`Cost price is now ${perUnitMoney(data, cur)}`)
    onSaved()
  }

  async function useFixed() {
    setError('')
    setBusy(true)
    const { error } = await supabase.rpc('save_cost_sheet', {
      p_item_id: item.id,
      p_mode: 'manual',
      p_yield: 1,
      p_waste: 0,
      p_lines: [],
    })
    setBusy(false)
    if (error) return setError(error.message)
    toast.success('Back to a fixed cost price. You can type it in when you edit the item.')
    onSaved()
  }

  const rowCard = 'rounded-xl border border-line p-3'
  const removeBtn = (label, key) => (
    <button
      type="button"
      aria-label={label}
      onClick={() => remove(key)}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink/65 hover:text-danger"
    >
      <Trash2 size={18} />
    </button>
  )
  const addBtn = (text, kind) => (
    <button
      type="button"
      onClick={() => add(kind)}
      className="flex items-center gap-1.5 rounded-xl border border-line px-3.5 py-2.5 text-sm font-medium hover:bg-surface-2"
    >
      <Plus size={16} /> {text}
    </button>
  )
  const ofKind = (kind) => lines.filter((l) => l.kind === kind)

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Costing for ${item.name}`}
        className="pop-in flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-xl font-semibold">What does {item.name} cost you?</h2>
            <p className="text-sm text-ink/65">
              List what you use. Akanti works out the cost price. You sell it for {money(price, cur)}.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-ink/65">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain px-5 py-5">
          {loading ? (
            <p className="text-ink/65">Loading...</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 rounded-2xl bg-brand p-4 text-brand-fg" aria-live="polite">
                <div>
                  <p className="text-xs text-brand-fg/65">Cost each</p>
                  <p className="num text-xl font-semibold" data-testid="cost-each">{perUnitMoney(totals.perUnit, cur)}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-fg/65">Profit each</p>
                  <p className="num text-xl font-semibold">{money(profit, cur)}</p>
                </div>
                <div>
                  <p className="text-xs text-brand-fg/65">Margin</p>
                  <p className="num text-xl font-semibold">{margin}%</p>
                </div>
              </div>
              {price > 0 && totals.perUnit > price && (
                <p role="alert" className="-mt-3 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
                  At this cost you lose money on every one you sell. Raise the price or lower the cost.
                </p>
              )}

              <Field label="How many do you make at once?" hint="Printing one page: 1. Cooking 20 plates: 20.">
                <input className="field" type="number" min="0" step="any" value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} />
              </Field>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">Materials used each time</h3>
                    <p className="text-sm text-ink/65">Things that get used up, like paper, toner, rice or oil.</p>
                  </div>
                  {addBtn('Add material', 'material')}
                </div>
                {activeCount === 0 && (
                  <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                    You have not added any materials yet.{' '}
                    {go && (
                      <button
                        type="button"
                        className="font-medium underline"
                        onClick={() => {
                          onClose()
                          go('materials')
                        }}
                      >
                        Add materials first
                      </button>
                    )}
                  </p>
                )}
                {ofKind('material').map((l) => {
                  const m = byId[l.material_id]
                  return (
                    <div key={l.key} className={rowCard}>
                      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_auto]">
                        <Field label="Material">
                          <select className="field" value={l.material_id} onChange={(e) => update(l.key, { material_id: e.target.value })}>
                            <option value="">Choose a material</option>
                            {materials
                              .filter((x) => x.is_active || x.id === l.material_id)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="How much" hint={m ? `${m.unit} each time` : 'each time'}>
                          <input className="field" type="number" min="0" step="any" value={l.qty} onChange={(e) => update(l.key, { qty: e.target.value })} />
                        </Field>
                        <div className="flex items-end justify-between gap-2 sm:flex-col sm:items-end sm:justify-between">
                          <span className="num pt-1 text-sm font-semibold">{perUnitMoney(lineBatchCost(l, byId), cur)}</span>
                          {removeBtn('Remove this material', l.key)}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">Other costs each time</h3>
                    <p className="text-sm text-ink/65">Packaging, labour, gas, delivery: anything else this takes.</p>
                  </div>
                  {addBtn('Add other cost', 'extra')}
                </div>
                {ofKind('extra').map((l) => (
                  <div key={l.key} className={rowCard}>
                    <div className="grid gap-3 sm:grid-cols-[1fr_9rem_auto]">
                      <Field label="What is it?">
                        <input className="field" value={l.label} onChange={(e) => update(l.key, { label: e.target.value })} placeholder="e.g. Packaging" />
                      </Field>
                      <Field label="Cost each time" hint={cur}>
                        <input className="field" type="number" min="0" step="0.01" value={l.cost} onChange={(e) => update(l.key, { cost: e.target.value })} />
                      </Field>
                      <div className="flex items-end justify-end">{removeBtn('Remove this cost', l.key)}</div>
                    </div>
                  </div>
                ))}
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">Equipment wear</h3>
                    <p className="text-sm text-ink/65">
                      A printer or a pot is not used up in one go. Spread its price over how long it lasts.
                    </p>
                  </div>
                  {addBtn('Add equipment', 'equipment')}
                </div>
                {ofKind('equipment').map((l) => (
                  <div key={l.key} className={rowCard}>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field label="Equipment">
                        <input className="field" value={l.label} onChange={(e) => update(l.key, { label: e.target.value })} placeholder="e.g. Printer" />
                      </Field>
                      <Field label="What it cost" hint={cur}>
                        <input className="field" type="number" min="0" step="0.01" value={l.cost} onChange={(e) => update(l.key, { cost: e.target.value })} />
                      </Field>
                      <Field label="It will last about" hint="uses, e.g. pages">
                        <input className="field" type="number" min="0" step="any" value={l.lifetime_uses} onChange={(e) => update(l.key, { lifetime_uses: e.target.value })} />
                      </Field>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-ink/65">
                        Wear each time: <span className="num font-semibold text-ink">{perUnitMoney(lineBatchCost(l, byId), cur)}</span>
                      </span>
                      {removeBtn('Remove this equipment', l.key)}
                    </div>
                  </div>
                ))}
              </section>

              <Field label="Allow for waste" hint="% lost, spoiled or spilled">
                <input className="field max-w-[10rem]" type="number" min="0" max="100" step="any" value={wastePct} onChange={(e) => setWastePct(e.target.value)} />
              </Field>
            </>
          )}
        </div>

        <div className="space-y-3 border-t border-line px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-4">
          {error && (
            <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={useFixed} disabled={busy || loading} className="text-sm underline">
              Use a fixed cost price instead
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2.5 font-medium hover:bg-surface-2">
                Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || loading}
                className="rounded-xl bg-accent px-5 py-2.5 font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
              >
                {busy ? 'Saving...' : 'Save cost'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
