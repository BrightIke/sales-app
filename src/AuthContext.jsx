import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [business, setBusiness] = useState(null)
  const [businesses, setBusinesses] = useState([])
  const [modules, setModules] = useState(new Set())
  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  const loadAll = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      setBusiness(null)
      setBusinesses([])
      setModules(new Set())
      setInvites([])
      return
    }

    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()

    const { data: m } = await supabase
      .from('memberships')
      .select('role, businesses(*)')
      .eq('user_id', userId)
    const list = (m ?? [])
      .filter((x) => x.businesses)
      .map((x) => ({ ...x.businesses, role: x.role }))
      .sort((a, b) => a.name.localeCompare(b.name))

    let b = null
    let mods = new Set()
    if (p?.business_id) {
      const [bRes, modRes] = await Promise.all([
        supabase.from('businesses').select('*').eq('id', p.business_id).maybeSingle(),
        supabase.from('business_modules').select('module, enabled').eq('business_id', p.business_id),
      ])
      b = bRes.data
      mods = new Set((modRes.data ?? []).filter((x) => x.enabled).map((x) => x.module))
    }

    const { data: inv } = await supabase.rpc('my_invites')

    setProfile(p)
    setInvites(inv ?? [])
    setBusinesses(list)
    setBusiness(b)
    setModules(mods)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await loadAll(data.session?.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(s)
      setTimeout(() => loadAll(s?.user.id), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [loadAll])

  const value = {
    session,
    profile,
    business,
    businesses,
    invites,
    loading,
    recovery,
    clearRecovery: () => setRecovery(false),
    hasModule: (name) => modules.has(name),
    refresh: () => loadAll(session?.user.id),
    switchBusiness: async (id) => {
      const { error } = await supabase.rpc('switch_business', { p_business_id: id })
      if (!error) await loadAll(session?.user.id)
      return error
    },
    signOut: () => supabase.auth.signOut(),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
