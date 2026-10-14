// Used to turn local numbers like 0803... into WhatsApp links (234 = Nigeria).
// Change this if your customers are in another country.
const DEFAULT_COUNTRY_CODE = '234'

export function money(amount, currency = 'NGN') {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0)
}

export function daysSince(date) {
  if (!date) return null
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
}

export function lastSeen(date) {
  const d = daysSince(date)
  if (d === null) return 'No purchases yet'
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d} days ago`
  const months = Math.floor(d / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

export function whatsappLink(phone, text) {
  let n = String(phone || '').replace(/\D/g, '')
  if (!n) return null
  if (n.startsWith('0')) n = DEFAULT_COUNTRY_CODE + n.slice(1)
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}

// Share any text on WhatsApp. With a phone number it opens that chat;
// without one, WhatsApp lets you pick who to send it to.
export function whatsappShare(text, phone) {
  let n = String(phone || '').replace(/\D/g, '')
  if (n.startsWith('0')) n = DEFAULT_COUNTRY_CODE + n.slice(1)
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}
