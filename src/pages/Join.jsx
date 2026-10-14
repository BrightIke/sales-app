import { useState } from 'react'
import { useAuth } from '../AuthContext'
import InviteList from '../components/InviteList'
import Setup from './Setup'

export default function Join() {
  const { signOut } = useAuth()
  const [own, setOwn] = useState(false)

  if (own) return <Setup />

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-6 text-ink">
      <div className="w-full max-w-md space-y-5">
        <h1 className="text-2xl font-semibold">You've been invited</h1>
        <p className="text-ink/70">
          Accept to join the team, or set up a business of your own instead.
        </p>
        <InviteList />
        <div className="flex gap-6 text-sm">
          <button onClick={() => setOwn(true)} className="underline">
            Set up my own business instead
          </button>
          <button onClick={signOut} className="underline">
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
