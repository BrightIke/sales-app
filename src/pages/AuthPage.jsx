import { useState } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { APP_NAME, TAGLINE } from '../lib/brand'
import Logo from '../components/Logo'
import GeoBand from '../components/GeoBand'
import { Segmented } from '../components/ui'

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
          <Logo size={34} onDark className="text-brand-fg" />
          <span className="font-display text-2xl font-semibold tracking-tight">{APP_NAME}</span>
        </div>

        <div className="relative z-10 pb-28">
          <h1 className="max-w-lg font-display text-5xl font-semibold leading-[1.05] tracking-tight xl:text-6xl">
            {TAGLINE}
          </h1>
          <p className="mt-5 max-w-md text-lg text-brand-fg/70">
            Sales, stock, customers and profit, for shops, entrepreneurs and growing businesses.
          </p>
        </div>

        <GeoBand height={104} className="pointer-events-none absolute inset-x-0 bottom-0 text-brand-fg" />
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center px-5 py-10 pt-[calc(2.5rem+env(safe-area-inset-top,0px))]">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <div className="flex items-center gap-2.5">
              <Logo size={34} className="text-ink" />
              <span className="font-display text-2xl font-semibold tracking-tight">{APP_NAME}</span>
            </div>
            <p className="mt-2 text-sm text-ink/65">{TAGLINE}</p>
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
