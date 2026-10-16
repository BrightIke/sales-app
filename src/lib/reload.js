// After you publish an update, a phone that still has the OLD app open can
// fail to load a page that was renamed. Reloading once fixes it. The flag
// stops this from ever looping.
const FLAG = 'tilly-reloaded'

export function reloadOnce(reload = () => window.location.reload()) {
  try {
    if (sessionStorage.getItem(FLAG)) return false
    sessionStorage.setItem(FLAG, '1')
  } catch {
    return false
  }
  reload()
  return true
}

export function clearReloadFlag() {
  try {
    sessionStorage.removeItem(FLAG)
  } catch {
    /* ignore */
  }
}
