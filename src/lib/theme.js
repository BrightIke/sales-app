import { useEffect, useState } from 'react'

// ---------- Accent colour per business type ----------
const accents = {
  retail: ['#E8A317', '#F0B13A'], // amber
  restaurant: ['#F08A5D', '#F59A72'], // coral
  cyber_cafe: ['#4FD1C5', '#6BDCD2'], // teal
  other: ['#A78BFA', '#B9A1FB'], // violet
}

export function applyTheme(type) {
  const [accent, hover] = accents[type] ?? accents.other
  const style = document.documentElement.style
  style.setProperty('--accent', accent)
  style.setProperty('--accent-hover', hover)
}

// ---------- Light / dark / follow-the-phone ----------
const KEY = 'tally-theme'

export function getMode() {
  try {
    return localStorage.getItem(KEY) || 'system'
  } catch {
    return 'system'
  }
}

function systemIsDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveMode(mode = getMode()) {
  return mode === 'system' ? (systemIsDark() ? 'dark' : 'light') : mode
}

export function applyMode(mode = getMode()) {
  const resolved = resolveMode(mode)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  // The phone's status bar takes the colour of the top bar
  document
    .getElementById('theme-color')
    ?.setAttribute('content', resolved === 'dark' ? '#141F1A' : '#FFFFFF')
}

export function setMode(mode) {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    /* private browsing: the choice just lasts this visit */
  }
  applyMode(mode)
  window.dispatchEvent(new Event('theme-change'))
}

// React hook: { mode: 'system' | 'light' | 'dark', resolved: 'light' | 'dark' }
export function useThemeMode() {
  const [state, setState] = useState(() => ({ mode: getMode(), resolved: resolveMode() }))

  useEffect(() => {
    applyMode()
    const sync = () => {
      applyMode()
      setState({ mode: getMode(), resolved: resolveMode() })
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    window.addEventListener('theme-change', sync)
    mq.addEventListener('change', sync)
    return () => {
      window.removeEventListener('theme-change', sync)
      mq.removeEventListener('change', sync)
    }
  }, [])

  return state
}
