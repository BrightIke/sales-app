import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../AuthContext'

export default function InviteList() {
  const { invites, refresh } = useAuth()
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  async function accept(id) {
    setError('')
    setBusyId(id)
    const { error } = await supabase.rpc('accept_invite', { p_invite_id: id })
    if (error) {
      setError(error.message)
      setBusyId('')
      return
    }
    await refresh()
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-ink/10 rounded-xl border border-ink/15 bg-surface">
        {invites.map((i) => (
          <li key={i.invite_id} className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium">{i.business_name}</p>
              <p className="text-sm capitalize text-ink/65">Join as {i.invite_role}</p>
            </div>
            <button
              disabled={busyId === i.invite_id}
              onClick={() => accept(i.invite_id)}
              className="rounded-xl bg-accent px-4 py-2 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
            >
              {busyId === i.invite_id ? 'Joining...' : 'Accept'}
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
