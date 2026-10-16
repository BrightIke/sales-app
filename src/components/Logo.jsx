// The Tilly mark: a "T" made of two rounded pills. The top bar takes the
// surrounding text colour (so it works on light, dark and black backgrounds),
// and the stem uses the accent blue of the current business.
export default function Logo({ size = 32, className = '' }) {
  return (
    <svg
      viewBox="22 22 56 58"
      width={Math.round((size * 56) / 58)}
      height={size}
      role="img"
      aria-label="Tilly"
      className={className}
    >
      <rect x="24" y="24" width="52" height="16" rx="8" fill="currentColor" />
      <rect x="42" y="46" width="16" height="32" rx="8" style={{ fill: 'var(--accent)' }} />
    </svg>
  )
}
