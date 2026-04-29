import { defineStore } from 'pinia'
import type { Mode } from '~~/shared/types/domain'

const KEY_MODE = 'local-drop:mode'
const KEY_REMEMBER = 'local-drop:rememberMode'

function isMode(v: unknown): v is Mode {
  return v === 'lan' || v === 'wan' || v === 'smart'
}

export const useModeStore = defineStore('mode', () => {
  const mode = ref<Mode | null>(null)
  const remember = ref(true)

  function init() {
    if (typeof localStorage === 'undefined') {
      mode.value = mode.value ?? 'smart'
      return
    }
    remember.value = localStorage.getItem(KEY_REMEMBER) !== 'false'
    if (remember.value) {
      const stored = localStorage.getItem(KEY_MODE)
      if (isMode(stored)) mode.value = stored
    }
    // 没有有效记忆值时默认 smart：「打开就能用」
    if (!mode.value) mode.value = 'smart'
  }

  function setMode(m: Mode, persist?: boolean) {
    mode.value = m
    if (persist !== undefined) remember.value = persist
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(KEY_REMEMBER, String(remember.value))
    if (remember.value) localStorage.setItem(KEY_MODE, m)
    else localStorage.removeItem(KEY_MODE)
  }

  function clear() {
    mode.value = null
    if (typeof localStorage !== 'undefined') localStorage.removeItem(KEY_MODE)
  }

  return { mode, remember, init, setMode, clear }
})
