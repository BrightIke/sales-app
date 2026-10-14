import { useEffect, useState } from 'react'
import { MessageCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'
import { whatsappShare } from '../lib/format'
import { Field } from '../components/ui'

const roleHelp = {
  manager: 'Manages items, stock, expenses and customers. Can see costs, profit and analytics.',
  cashier: 'Records sales and customers. Cannot see costs, profit, expenses or analytics.',
}

const field =
  'w-full rounded-xl border border-ink/55 bg-surface px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent'

export default function Team() {
  const { business, session } = useAuth()

  const [team, setTeam] = useState([])
  const [invites, setInvites] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('cashier')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [t, i] = await Promise.all([
      supabase.rpc('list_team'),
      supabase
        .from('invites')
        .select('*')
        .is('accepted_at', null)
        .order('created_at', { ascending: false }),
    ])
    if (t.error || i.error) setError((t.error || i.error).message)
    setTeam(t.data ?? [])
    setInvites(i.data ?? [])
  }

  useEffect(() => {
    load()
  }, [])

  async function act(call, done) {
    setError('')
    setNotice('')
    setBusy(true)
    const { error } = await call
    setBusy(false)
    if (error) {
      setError(error.message)
      return false
    }
    if (done) toast.success(done)
    load()
    return true
  }

  async function invite(e) {
    e.preventDefault()
    const ok = await act(
      supabase.rpc('invite_staff', { p_email: email, p_role: role }),
      'Invitation saved. Now send them the message below so they can sign up.'
    )
    if (ok) setEmail('')
  }

  const inviteText = (addr) =>
    `Hi! I've added you to ${business.name}. Create an account at ${window.location.origin} using this email (${addr}), then accept the invitation.`

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold">Team</h2>
        <p className="text-sm text-ink/65">
          Give staff their own logins so you can see who did what, and keep costs and profit private.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm font-medium">{notice}</p>}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Invite someone</h3>
        <form onSubmit={invite} className="space-y-3 rounded-xl border border-ink/15 bg-surface p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Their email address" className="sm:col-span-2"><input
              className={field}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            /></Field>
            <Field label="Role"><select className={field} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
            </select></Field>
          </div>
          <p className="text-sm text-ink/65">{roleHelp[role]}</p>
          <button
            disabled={busy}
            className="rounded-xl bg-accent px-4 py-2 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
          >
            Invite
          </button>
        </form>
      </section>

      {invites.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">Waiting to join</h3>
          <ul className="divide-y divide-ink/10 rounded-xl border border-ink/15 bg-surface">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-medium">{i.email}</p>
                  <p className="capitalize text-ink/65">{i.role}</p>
                </div>
                <div className="flex items-center gap-4">
                  <a
                    href={whatsappShare(inviteText(i.email))}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 font-medium underline"
                  >
                    <MessageCircle size={16} /> Send on WhatsApp
                  </a>
                  <button
                    onClick={() => act(supabase.rpc('revoke_invite', { p_invite_id: i.id }), 'Invitation cancelled.')}
                    className="text-danger underline"
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink/65">
            They must sign up with exactly the email shown, then accept the invitation on the screen that appears.
          </p>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Your team</h3>
        <ul className="divide-y divide-ink/10 rounded-xl border border-ink/15 bg-surface">
          {team.map((m) => {
            const isSelf = m.member_id === session.user.id
            const isOwner = m.member_role === 'owner'
            return (
              <li key={m.member_id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {m.full_name || m.email}
                    {isSelf && <span className="ml-2 text-xs text-ink/65">(you)</span>}
                  </p>
                  <p className="truncate text-ink/65">{m.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {isOwner ? (
                    <span className="rounded bg-brand px-2 py-1 text-xs font-medium text-white">Owner</span>
                  ) : (
                    <>
                      <select
                        aria-label={`Role for ${m.full_name || m.email}`}
                        className="rounded-xl border border-ink/55 bg-surface px-2 py-1.5"
                        value={m.member_role}
                        disabled={busy}
                        onChange={(e) =>
                          act(
                            supabase.rpc('set_member_role', { p_user_id: m.member_id, p_role: e.target.value }),
                            'Role updated.'
                          )
                        }
                      >
                        <option value="cashier">Cashier</option>
                        <option value="manager">Manager</option>
                      </select>
                      <button
                        aria-label="Remove"
                        onClick={() => {
                          if (window.confirm(`Remove ${m.full_name || m.email} from ${business.name}?`))
                            act(supabase.rpc('remove_member', { p_user_id: m.member_id }), 'Team member removed.')
                        }}
                        className="p-1 text-danger"
                      >
                        <Trash2 size={18} />
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}
