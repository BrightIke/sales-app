import { useState } from 'react'
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Tag,
  Boxes,
  Layers,
  Wallet,
  BarChart3,
  UserCog,
  Settings,
  ChevronsUpDown,
  Check,
  LogOut,
  Plus,
  MoreHorizontal,
  Sun,
  Moon,
} from 'lucide-react'
import { useAuth } from '../AuthContext'
import { APP_NAME } from '../lib/brand'
import Logo from './Logo'
import { setMode, useThemeMode } from '../lib/theme'

const nav = [
  { id: 'home', label: 'Home', icon: LayoutDashboard, group: 'Daily' },
  { id: 'sales', label: 'Sales', icon: ShoppingCart, group: 'Daily' },
  { id: 'customers', label: 'Customers', icon: Users, module: 'customers', group: 'Daily' },
  { id: 'items', label: 'Items', icon: Tag, group: 'Daily' },
  { id: 'stock', label: 'Stock', icon: Boxes, module: 'inventory', managerOnly: true, group: 'Back office' },
  { id: 'materials', label: 'Materials', icon: Layers, module: 'costing', managerOnly: true, group: 'Back office' },
  { id: 'money', label: 'Money', icon: Wallet, module: 'money', managerOnly: true, group: 'Back office' },
  { id: 'analytics', label: 'Analytics', icon: BarChart3, module: 'analytics', managerOnly: true, group: 'Back office' },
  { id: 'team', label: 'Team', icon: UserCog, ownerOnly: true, group: 'Admin' },
  { id: 'settings', label: 'Settings', icon: Settings, group: 'Admin' },
]

function Switcher({ dark, onAdd }) {
  const { business, businesses, switchBusiness } = useAuth()
  const [open, setOpen] = useState(false)
  const role = businesses.find((b) => b.id === business.id)?.role

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl p-2 text-left ${
          dark ? 'bg-white/10 hover:bg-white/15' : 'hover:bg-ink/5'
        }`}
      >
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-sm font-bold ${
            dark ? 'bg-accent-bright text-brand' : 'bg-accent text-accent-fg'
          }`}
        >
          {business.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{business.name}</span>
          <span className={`block text-xs capitalize ${dark ? 'text-brand-fg/60' : 'text-ink/65'}`}>
            {role}
          </span>
        </span>
        <ChevronsUpDown size={16} className="shrink-0 opacity-60" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fade-in absolute left-0 right-0 z-50 mt-2 min-w-[15rem] rounded-xl border border-line bg-surface p-1 text-ink shadow-xl">
            {businesses.map((b) => (
              <button
                key={b.id}
                onClick={async () => {
                  setOpen(false)
                  if (b.id !== business.id) await switchBusiness(b.id)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-surface-2"
              >
                <span className="flex-1 truncate">{b.name}</span>
                {b.id === business.id && <Check size={16} />}
              </button>
            ))}
            <button
              onClick={() => {
                setOpen(false)
                onAdd()
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-line px-3 py-2.5 text-left text-sm font-medium hover:bg-surface-2"
            >
              <Plus size={16} /> Add a business
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function Layout({ page, setPage, children }) {
  const { profile, signOut, hasModule } = useAuth()
  const { resolved } = useThemeMode()
  const [moreOpen, setMoreOpen] = useState(false)

  const items = nav.filter(
    (n) =>
      (!n.module || hasModule(n.module)) &&
      (!n.managerOnly || profile?.role !== 'cashier') &&
      (!n.ownerOnly || profile?.role === 'owner')
  )

  // Sidebar sections, in order
  const groups = items.reduce((acc, n) => {
    const g = acc.find((x) => x.name === n.group)
    if (g) g.items.push(n)
    else acc.push({ name: n.group, items: [n] })
    return acc
  }, [])

  // On phones: at most 4 tabs plus "More" (5 in total), the most a thumb can hit reliably
  const primary = items.slice(0, 4)
  const rest = items.slice(4)
  const restActive = rest.some((n) => n.id === page)

  const toggleTheme = () => setMode(resolved === 'dark' ? 'light' : 'dark')

  return (
    <div className="min-h-dvh bg-page text-ink">
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-brand p-4 text-brand-fg md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <Logo size={30} onDark className="text-brand-fg" />
          <span className="font-display text-xl font-semibold tracking-tight">{APP_NAME}</span>
        </div>

        <Switcher dark onAdd={() => setPage('settings')} />

        <nav className="mt-6 flex-1 space-y-5 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.name}>
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-brand-fg/65">
                {g.name}
              </p>
              <div className="space-y-0.5">
                {g.items.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setPage(id)}
                    aria-current={page === id ? 'page' : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      page === id
                        ? 'bg-white/10 text-brand-fg shadow-[inset_3px_0_0_var(--accent-bright)]'
                        : 'text-brand-fg/65 hover:bg-white/5 hover:text-brand-fg'
                    }`}
                  >
                    <Icon size={18} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
          <button
            onClick={signOut}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-brand-fg/65 hover:bg-white/5 hover:text-brand-fg"
          >
            <LogOut size={18} /> Log out
          </button>
          <button
            onClick={toggleTheme}
            aria-label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded-lg p-2 text-brand-fg/65 hover:bg-white/5 hover:text-brand-fg"
          >
            {resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </aside>

      {/* ---------- Phone top bar ---------- */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-surface px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] md:hidden">
        <div className="flex-1">
          <Switcher onAdd={() => setPage('settings')} />
        </div>
        <button onClick={signOut} aria-label="Log out" className="rounded-lg p-2.5 text-ink/65">
          <LogOut size={20} />
        </button>
      </header>

      <div className="md:pl-64">
        <main className="mx-auto max-w-6xl px-4 pb-32 pt-5 sm:px-6 md:px-8 md:py-8 md:pb-10">
          {children}
        </main>
      </div>

      {/* ---------- Phone bottom navigation ---------- */}
      {moreOpen && (
        <div className="fade-in fixed inset-0 z-20 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="pop-in absolute inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] origin-bottom rounded-2xl border border-line bg-surface p-2 shadow-xl">
            {rest.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => {
                  setPage(id)
                  setMoreOpen(false)
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium ${
                  page === id ? 'bg-surface-2' : ''
                }`}
              >
                <Icon size={20} />
                {label}
              </button>
            ))}
            <button
              onClick={() => {
                toggleTheme()
                setMoreOpen(false)
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium"
            >
              {resolved === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              {resolved === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-line bg-surface pb-[env(safe-area-inset-bottom,0px)] md:hidden"
        style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}
      >
        {primary.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            aria-current={page === id ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
              page === id ? 'text-ink shadow-[inset_0_2px_0_var(--accent)]' : 'text-ink/65'
            }`}
          >
            <Icon size={21} />
            {label}
          </button>
        ))}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
            restActive ? 'text-ink shadow-[inset_0_2px_0_var(--accent)]' : 'text-ink/65'
          }`}
        >
          <MoreHorizontal size={21} />
          More
        </button>
      </nav>
    </div>
  )
}
