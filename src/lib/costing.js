// The cost maths, used to show a live preview while you type.
// The database does the same sum when you save (see step12.sql), so what you
// see here is what gets saved.
//
//   cost per item = (materials + extra costs + equipment wear, per batch)
//                   x (1 + waste%) / how many the batch makes

export const UNITS = [
  'piece', 'sheet', 'page', 'kg', 'g', 'litre', 'ml', 'cup', 'tin', 'bag',
  'pack', 'plate', 'portion', 'metre', 'hour',
]

export const num = (x) => Number(x) || 0

// You buy a pack (500 sheets for N6,500): the cost of ONE is pack cost / pack size
export function materialUnitCost(m) {
  const size = num(m.pack_size)
  return size > 0 ? num(m.pack_cost) / size : 0
}

// What one line adds to the cost of ONE BATCH
export function lineBatchCost(line, materialsById) {
  if (line.kind === 'material') {
    const m = materialsById[line.material_id]
    return m ? num(line.qty) * materialUnitCost(m) : 0
  }
  if (line.kind === 'extra') return num(line.cost)
  if (line.kind === 'equipment') {
    const uses = num(line.lifetime_uses)
    return uses > 0 ? num(line.cost) / uses : 0 // price spread over how long it lasts
  }
  return 0
}

export function costSheetTotals({ lines, yieldQty, wastePct }, materialsById) {
  const batch = lines.reduce((n, l) => n + lineBatchCost(l, materialsById), 0)
  const withWaste = batch * (1 + num(wastePct) / 100)
  const y = num(yieldQty)
  return { batch, withWaste, perUnit: y > 0 ? withWaste / y : 0 }
}

// The first thing wrong with a cost sheet, in plain words (same rules as the database)
export function checkSheet({ lines, yieldQty, wastePct }) {
  if (!(num(yieldQty) > 0)) return 'Enter how many you make at once (more than zero).'
  const w = Number(wastePct)
  if (wastePct === '' || Number.isNaN(w) || w < 0 || w > 100) return 'Waste must be between 0 and 100 percent.'
  if (lines.length === 0) return 'Add at least one cost.'
  for (const l of lines) {
    if (l.kind === 'material' && (!l.material_id || !(num(l.qty) > 0)))
      return 'Choose a material and a quantity above zero.'
    if (l.kind === 'extra' && (!String(l.label ?? '').trim() || l.cost === '' || l.cost == null || num(l.cost) < 0))
      return 'Give each other cost a name and an amount.'
    if (l.kind === 'equipment' &&
        (!String(l.label ?? '').trim() || l.cost === '' || l.cost == null || num(l.cost) < 0 || !(num(l.lifetime_uses) > 0)))
      return 'Equipment needs a name, a price, and how many uses it lasts.'
  }
  return null
}

// Small costs need more than 2 decimals (N0.0832 a ml), so show up to 4
export function perUnitMoney(amount, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(num(amount))
}
