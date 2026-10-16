// Small building blocks shared across screens.
// Colours come from the tokens in src/index.css.

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold md:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-ink/65">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}

export function Stat({ label, value, hint, tone }) {
  const toneClass = tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : ''
  return (
    <div className="card p-4">
      <p className="text-sm text-ink/65">{label}</p>
      <p className={`num mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink/65">{hint}</p>}
    </div>
  )
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="card flex flex-col items-center gap-2 border-dashed px-6 py-10 text-center">
      {Icon && (
        <span className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-accent/20">
          <Icon size={24} />
        </span>
      )}
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <p className="max-w-sm text-sm text-ink/65">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

const badgeTones = {
  neutral: 'bg-ink/10 text-ink',
  accent: 'bg-accent/25 text-ink',
  warning: 'bg-warning/20 text-ink',
  danger: 'bg-danger/15 text-danger',
  success: 'bg-success/15 text-success',
}

export function Badge({ tone = 'neutral', children }) {
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>
      {children}
    </span>
  )
}

// A row of options where exactly one is chosen (replaces ad-hoc chip rows)
export function Segmented({ options, value, onChange, label }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-xl border border-line bg-surface-2 p-1"
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium ${
              active ? 'bg-brand text-brand-fg' : 'text-ink/70 hover:text-ink'
            }`}
          >
            {o.icon && <o.icon size={16} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// A visible label above a form control. The label wraps the control, so
// screen readers and tapping the label both reach the right field.
export function Field({ label, hint, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex flex-wrap items-baseline gap-x-1.5 text-sm font-medium">
        {label}
        {hint && <span className="text-xs font-normal text-ink/65">{hint}</span>}
      </span>
      {children}
    </label>
  )
}
