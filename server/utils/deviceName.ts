import type { Browser, Os } from '../../shared/types/domain'

export function formatDeviceName(os: Os, browser: Browser): string {
  return `${os} + ${browser}`
}

// 在已有名字集合中给新设备分配去重序号（macOS + Chrome → macOS + Chrome (2)）
export function dedupName(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing)
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base} (${i})`
    if (!taken.has(candidate)) return candidate
  }
  return `${base} (?)`
}
