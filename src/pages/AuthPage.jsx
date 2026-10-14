import { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { APP_NAME } from '../lib/brand'
import { Segmented } from '../components/ui'

// A decorative receipt that shows what the app does at a glance
function ReceiptArt() {
  const rows = [
    ['2 x Bottled water', '1,000'],
    ['1 x Jollof rice', '2,500'],
    ['1 hr Browsing', '500'],
    ['3 x Printing', '150'],
  ]
  return (
    <div
      aria-hidden="true"
      className="w-72 rotate-[-3deg] rounded-2xl bg-surface p-6 font-display text-ink shadow-2xl"
    >
      <p className="text-center text-lg font-semibold">Mama T Kitchen</p>
      <p className="mb-4 text-center text-xs text-ink/65">Receipt #A4F92C</p>
      <ul className="space-y-1.5 border-y border-dashed border-ink/30 py-3 text-sm">
        {rows.map(([name, price]) => (
          <li key={name} className="flex justify-between">
            <span>{name}</span>
            <span className="tabular-nums">{price}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex justify-between text-base font-semibold">
        <span>Total</span>
        <span className="tabular-nums">4,150</span>
      </p>
      <p className="mt-1 flex justify-between text-sm text-ink/65">
        <span>Paid by</span>
        <span>Transfer</span>
      </p>
      <p className="mt-4 text-center text-xs text-ink/65">Thank you for your patronage!</p>
    </div>
  )
}

export default function AuthPage() {
  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const isLogin = mode === 'login'

  function switchMode(next) {
    setMode(next)
    setError('')
    setNotice('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      })
      if (error) setError(error.message)
      else if (!data.session)
        setNotice('Check your email and click the confirmation link, then log in.')
    }
    setBusy(false)
  }

  async function forgotPassword() {
    setError('')
    setNotice('')
    if (!email) return setError('Type your email above first, then click Forgot password.')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    if (error) setError(error.message)
    else setNotice('If that email has an account, a reset link is on its way. Check your inbox and spam folder.')
  }

  return (
    <div className="grid min-h-dvh bg-page text-ink lg:grid-cols-[1.1fr_1fr]">
      {/* Brand side (desktop only) */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand p-12 text-brand-fg lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-display text-xl font-bold text-accent-fg">
            {APP_NAME[0]}
          </span>
          <span className="font-display text-2xl font-semibold tracking-tight">{APP_NAME}</span>
        </div>

        <div className="relative z-10">
          <h1 className="max-w-md font-display text-5xl font-semibold leading-[1.05] tracking-tight">
            Know what you sold, what is left, and what you earned.
          </h1>
          <p className="mt-5 max-w-sm text-lg text-brand-fg/70">
            Sales, stock, customers and profit for shops, restaurants, cyber cafes and everything in between.
          </p>
        </div>

        <div className="absolute -right-6 bottom-10">
          <ReceiptArt />
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center px-5 py-10 pt-[calc(2.5rem+env(safe-area-inset-top,0px))]">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent font-display text-xl font-bold text-accent-fg">
              {APP_NAME[0]}
            </span>
            <span className="font-display text-2xl font-semibold tracking-tight">{APP_NAME}</span>
          </div>

          <Segmented
            label="Log in or create an account"
            value={mode}
            onChange={switchMode}
            options={[
              { value: 'login', label: 'Log in' },
              { value: 'signup', label: 'Create account' },
            ]}
          />

          <h2 className="mb-1 mt-6 text-3xl font-semibold">
            {isLogin ? 'Welcome back' : 'Start your business'}
          </h2>
          <p className="mb-6 text-ink/65">
            {isLogin ? 'Log in to see how today is going.' : 'It takes a minute. No card needed.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
                  Your name
                </label>
                <input
                  id="name"
                  className="field"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                Email address
              </label>
              <input
                id="email"
                className="field"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                {isLogin && (
                  <button type="button" onClick={forgotPassword} className="text-sm underline">
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="password"
                  className="field pr-11"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-0 top-0 grid h-full w-12 place-items-center rounded-r-xl text-ink/65 hover:text-ink"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {!isLogin && <p className="mt-1.5 text-xs text-ink/65">At least 6 characters.</p>}
            </div>

            {error && (
              <p role="alert" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}
            {notice && <p className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success">{notice}</p>}

            <button
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-base font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
            >
              {busy && <Loader2 size={18} className="animate-spin" />}
              {isLogin ? 'Log in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
