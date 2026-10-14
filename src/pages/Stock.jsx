import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { Field } from '../components/ui'

const reasonLabels = {
  purchase: 'Restock',
  sale: 'Sale',
  waste: 'Waste',
  adjustment: 'Correction',
  return: 'Return',
}

const modes = {
  restock: { title: 'Restock', reason: 'purchase', qtyLabel: 'How many are you adding?' },
  waste: { title: 'Waste or damage', reason: 'waste', qtyLabel: 'How many were lost or damaged?' },
  count: { title: 'Stock count correction', reason: 'adjustment', qtyLabel: 'How many do you actually have now?' },
}

const field =
  'w-full rounded-xl border border-ink/55 bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent'

export default function Stock() {
  const [items, setItems] = useState([])
  const [moves, setMoves] = useState([])
  const [lowOnly, setLowOnly] = useState(false)
  const [panel, setPanel] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [i, m] = await Promise.all([
      supabase.from('items').select('*').eq('is_active', true).eq('track_stock', true).order('name'),
      supabase
        .from('stock_movements')
        .select('id, change, reason, note, created_at, items(name)')
        .order('created_at', { ascending: false })
        .limit(30),
    ])
    if (i.error || m.error) setError((i.error || m.error).message)
    setItems(i.data ?? [])
    setMoves(m.data ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  const status = (i) =>
    Number(i.stock_qty) <= 0 ? 'out' : Number(i.stock_qty) <= Number(i.reorder_level) ? 'low' : 'ok'

  const shown = useMemo(
    () => (lowOnly ? items.filter((i) => status(i) !== 'ok') : items),
    [items, lowOnly]
  )

  function open(item, mode) {
    setError('')
    setPanel({ item, mode, qty: '', cost: '', note: '' })
  }

  async function submit(e) {
    e.preventDefault()
    setError('')
    const q = Number(panel.qty)
    if (panel.mode !== 'count' && !(q > 0)) return setError('Enter a quantity above zero.')
    if (panel.mode === 'count' && (panel.qty === '' || q < 0))
      return setError('Enter the number you counted.')

    const current = Number(panel.item.stock_qty)
    const change = panel.mode === 'restock' ? q : panel.mode === 'waste' ? -q : q - current
    if (change === 0) return setError('That matches the current stock, so nothing to change.')

    setBusy(true)
    const { error } = await supabase.rpc('adjust_stock', {
      p_item_id: panel.item.id,
      p_change: change,
      p_reason: modes[panel.mode].reason,
      p_note: panel.note.trim() || null,
      p_new_cost: panel.mode === 'restock' && panel.cost !== '' ? Number(panel.cost) : null,
    })
    setBusy(false)
    if (error) return setError(error.message)
    toast.success('Stock updated')
    setPanel(null)
    load()
  }

  const set = (key) => (e) => setPanel({ ...panel, [key]: e.target.value })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Stock</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Show only low or out of stock
        </label>
      </div>

      {panel && (
        <form onSubmit={submit} className="space-y-3 rounded-xl border border-ink/15 bg-surface p-5">
          <h3 className="font-semibold">
            {modes[panel.mode].title}: {panel.item.name}
          </h3>
          <p className="text-sm text-ink/65">Current stock: {Number(panel.item.stock_qty)}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={modes[panel.mode].qtyLabel}><input
              className={field}
              type="number"
              min="0"
              step="0.01"
              value={panel.qty}
              onChange={set('qty')}
              autoFocus
            /></Field>
            {panel.mode === 'restock' && (
              <Field label="New cost price" hint="Optional"><input
                className={field}
                type="number"
                min="0"
                step="0.01"
                value={panel.cost}
                onChange={set('cost')}
              /></Field>
            )}
            <Field label="Note" hint="Optional, e.g. supplier name or reason" className="sm:col-span-2"><input
              className={field}
              value={panel.note}
              onChange={set('note')}
            /></Field>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-3">
            <button
              disabled={busy}
              className="rounded-xl bg-brand px-4 py-2 font-medium text-white hover:bg-brand-hover disabled:opacity-60"
            >
              {busy ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setPanel(null)} className="px-3 py-2 text-sm underline">
              Cancel
            </button>
          </div>
        </form>
      )}

      {!panel && error && <p className="text-sm text-danger">{error}</p>}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink/30 p-8 text-center text-ink/70">
          {items.length === 0
            ? 'No stock items yet. Add a product on the Items page.'
            : 'Nothing is running low. Good.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-ink/15 bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ink/15 text-ink/65">
              <tr>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">In stock</th>
                <th className="px-4 py-3 font-medium">Warn at</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const s = status(i)
                return (
                  <tr key={i.id} className="border-b border-ink/10 last:border-0">
                    <td className="px-4 py-3 font-medium">{i.name}</td>
                    <td className="px-4 py-3">{Number(i.stock_qty)}</td>
                    <td className="px-4 py-3">{Number(i.reorder_level)}</td>
                    <td className="px-4 py-3">
                      {s === 'out' && <span className="rounded bg-danger/15 px-1.5 py-0.5 text-xs font-medium text-danger">Out</span>}
                      {s === 'low' && <span className="rounded bg-accent/30 px-1.5 py-0.5 text-xs font-medium">Low</span>}
                      {s === 'ok' && <span className="text-ink/65">OK</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button onClick={() => open(i, 'restock')} className="mr-3 underline">Restock</button>
                      <button onClick={() => open(i, 'waste')} className="mr-3 underline">Waste</button>
                      <button onClick={() => open(i, 'count')} className="underline">Count</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Recent stock movements</h3>
        {moves.length === 0 ? (
          <p className="text-ink/65">Nothing yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink/15 bg-surface">
            <table className="w-full text-left text-sm">
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id} className="border-b border-ink/10 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-ink/65">
                      {new Date(m.created_at).toLocaleString('en-NG', {
                        day: 'numeric',
                        month: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 font-medium">{m.items?.name}</td>
                    <td className="px-4 py-3">{reasonLabels[m.reason]}</td>
                    <td className={`px-4 py-3 font-medium ${Number(m.change) < 0 ? 'text-danger' : ''}`}>
                      {Number(m.change) > 0 ? '+' : ''}
                      {Number(m.change)}
                    </td>
                    <td className="px-4 py-3 text-ink/65">{m.note}</td>
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
