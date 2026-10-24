import { Check, MessageCircle, Printer } from 'lucide-react'
import { useAuth } from '../AuthContext'
import { money, whatsappShare } from '../lib/format'

const methodLabel = { cash: 'Cash', transfer: 'Transfer', card: 'Card', credit: 'On credit' }

export default function Receipt({ receipt: r, onClose }) {
  const { business } = useAuth()
  const cur = business.currency
  const no = String(r.id ?? '').slice(0, 6).toUpperCase()
  const when = new Date(r.date).toLocaleString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const owed = r.total - r.paid

  // Plain-text version for WhatsApp
  const text = [
    `*${business.name}*`,
    `Receipt #${no}`,
    when,
    '',
    ...r.lines.map((l) => `${l.qty} x ${l.name}: ${money(l.qty * l.price, cur)}`),
    '',
    `Total: ${money(r.total, cur)}`,
    `Paid by: ${methodLabel[r.method]}`,
    owed > 0 ? `Balance owed: ${money(owed, cur)}` : null,
    '',
    'Thank you for your patronage!',
  ]
    .filter((x) => x !== null)
    .join('\n')

  return (
    <div className="fade-in fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="pop-in max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-surface shadow-2xl">
        <div className="flex items-center gap-2 rounded-t-2xl bg-brand px-5 py-3 font-medium text-white">
          <Check size={18} className="text-accent-bright" /> Sale recorded
        </div>

        <div className="print-area p-5 text-sm">
          <p className="text-center text-lg font-semibold">{business.name}</p>
          <p className="text-center text-xs text-ink/65">
            Receipt #{no}
            <br />
            {when}
          </p>
          {r.customer && <p className="mt-2 text-center text-xs">Customer: {r.customer.name}</p>}

          <ul className="my-4 space-y-1 border-y border-dashed border-ink/30 py-3">
            {r.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {l.qty} x {l.name}
                </span>
                <span>{money(l.qty * l.price, cur)}</span>
              </li>
            ))}
          </ul>

          <p className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{money(r.total, cur)}</span>
          </p>
          <p className="mt-1 flex justify-between">
            <span>Paid by</span>
            <span>{methodLabel[r.method]}</span>
          </p>
          {owed > 0 && (
            <p className="flex justify-between font-medium">
              <span>Balance owed</span>
              <span>{money(owed, cur)}</span>
            </p>
          )}
          <p className="mt-4 text-center text-xs">Thank you for your patronage!</p>
        </div>

        <div className="grid grid-cols-2 gap-2 px-5 pb-3">
          <button
            onClick={() => window.print()}
            className="flex items-center justify-center gap-2 rounded-xl border border-ink/25 py-2.5 text-sm font-medium"
          >
            <Printer size={16} /> Print
          </button>
          <a
            href={whatsappShare(text, r.customer?.phone)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-xl border border-ink/25 py-2.5 text-sm font-medium"
          >
            <MessageCircle size={16} /> WhatsApp
          </a>
        </div>
        <div className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-accent py-2.5 font-semibold text-accent-fg hover:bg-accent-hover"
          >
            New sale
          </button>
        </div>
      </div>
    </div>
  )
}
