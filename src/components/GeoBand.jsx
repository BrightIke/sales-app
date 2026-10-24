import { useId } from 'react'

// A band of bold interlocking triangles: confident, geometric, and purely
// decorative. Takes the surrounding text colour for the gray triangles and the
// bright cobalt for the blue ones.
export default function GeoBand({ height = 96, className = '' }) {
  const id = useId().replace(/:/g, '')
  const fade = 'linear-gradient(to top, black 30%, transparent)'
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="100%"
      height={height}
      className={className}
      style={{ maskImage: fade, WebkitMaskImage: fade }}
    >
      <defs>
        <pattern id={id} width="48" height="48" patternUnits="userSpaceOnUse">
          <polygon points="0,24 12,0 24,24" style={{ fill: 'var(--accent-bright)' }} />
          <polygon points="24,24 36,0 48,24" fill="currentColor" opacity="0.2" />
          <polygon points="0,24 24,24 12,48" fill="currentColor" opacity="0.2" />
          <polygon points="24,24 48,24 36,48" style={{ fill: 'var(--accent-bright)' }} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  )
}
