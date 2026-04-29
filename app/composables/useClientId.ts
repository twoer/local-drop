// design.md ADR-008：clientId 存 sessionStorage（每 tab 独立）
const KEY = 'local-drop:clientId'

export function getOrCreateClientId(): string {
  if (typeof sessionStorage === 'undefined') {
    throw new Error('clientId is only available on client')
  }
  let id = sessionStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(KEY, id)
  }
  return id
}
