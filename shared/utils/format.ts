export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return ''
  if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
}

export function formatEta(seconds: number): string {
  if (seconds < 0) return ''
  if (seconds < 60) return `~${seconds}s`
  if (seconds < 3600) return `~${Math.floor(seconds / 60)}m${(seconds % 60).toFixed(0)}s`
  return `~${Math.floor(seconds / 3600)}h${Math.floor((seconds % 3600) / 60)}m`
}
