import { APP_NAME } from '../lib/brand'

// The Akanti mark: a bold "A" with a cobalt crossbar.
// The two strokes take the surrounding text colour, so it works on light,
// dark and black backgrounds. On the always-black panels pass onDark, which
// uses the brighter cobalt (plain cobalt is too dim on black).
export default function Logo({ size = 32, className = '', onDark = false }) {
  return (
    <svg
      viewBox="16 16 68 70"
      width={Math.round((size * 68) / 70)}
      height={size}
      role="img"
      aria-label={APP_NAME}
      className={className}
    >
      <line
        x1="36"
        y1="62"
        x2="64"
        y2="62"
        strokeWidth="11"
        strokeLinecap="round"
        style={{ stroke: onDark ? 'var(--accent-bright)' : 'var(--accent)' }}
      />
      <path
        d="M26 76 L50 26 L74 76"
        fill="none"
        stroke="currentColor"
        strokeWidth="16"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
