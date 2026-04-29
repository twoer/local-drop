import { defineStore } from 'pinia'

const KEY_OPTOUT = 'local-drop:lanOptOut'
const KEY_ACK = 'local-drop:lanAck'
const TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天

type Record = { fingerprint: string; expiresAt: number }

export const useLanOptOutStore = defineStore('lanOptOut', () => {
  const records = ref<Record[]>([])
  // CGNAT 隐私：用户已确认"留在该 LAN 自动发现"的 fingerprint，期内不再询问
  const acknowledged = ref<Record[]>([])

  function saveOptOut() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(KEY_OPTOUT, JSON.stringify(records.value))
  }
  function saveAck() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(KEY_ACK, JSON.stringify(acknowledged.value))
  }

  function loadList(key: string): Record[] {
    if (typeof localStorage === 'undefined') return []
    try {
      const raw = localStorage.getItem(key)
      if (!raw) return []
      const parsed = JSON.parse(raw) as Record[]
      const now = Date.now()
      return parsed.filter(r => r.expiresAt > now)
    }
    catch {
      return []
    }
  }

  function load() {
    records.value = loadList(KEY_OPTOUT)
    acknowledged.value = loadList(KEY_ACK)
    saveOptOut()
    saveAck()
  }

  function isOptedOut(fingerprint: string): boolean {
    const now = Date.now()
    return records.value.some(r => r.fingerprint === fingerprint && r.expiresAt > now)
  }

  function isAcknowledged(fingerprint: string): boolean {
    const now = Date.now()
    return acknowledged.value.some(r => r.fingerprint === fingerprint && r.expiresAt > now)
  }

  function optOut(fingerprint: string, ttlMs = TTL_MS) {
    if (isOptedOut(fingerprint)) return
    records.value.push({ fingerprint, expiresAt: Date.now() + ttlMs })
    saveOptOut()
    // 撤销 ack 状态（如果之前 ack 过）
    acknowledged.value = acknowledged.value.filter(r => r.fingerprint !== fingerprint)
    saveAck()
  }

  function acknowledge(fingerprint: string, ttlMs = TTL_MS) {
    if (isAcknowledged(fingerprint)) return
    acknowledged.value.push({ fingerprint, expiresAt: Date.now() + ttlMs })
    saveAck()
  }

  function clearOne(fingerprint: string) {
    records.value = records.value.filter(r => r.fingerprint !== fingerprint)
    acknowledged.value = acknowledged.value.filter(r => r.fingerprint !== fingerprint)
    saveOptOut()
    saveAck()
  }

  return { records, acknowledged, load, isOptedOut, isAcknowledged, optOut, acknowledge, clearOne }
})
