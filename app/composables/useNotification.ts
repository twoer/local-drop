import type { MessageRecord } from '~/composables/useIndexedDB'

const unreadCount = ref(0)
const permission = ref<NotificationPermission>('default')
const isSupported = ref(false)
let initialized = false

function updateTitle() {
  document.title = unreadCount.value > 0 ? `(${unreadCount.value}) LocalDrop` : 'LocalDrop'
}

function init() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  isSupported.value = typeof Notification !== 'undefined'
  if (isSupported.value) {
    permission.value = Notification.permission
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      unreadCount.value = 0
      updateTitle()
    }
  })
}

async function requestPermission(): Promise<boolean> {
  if (!isSupported.value) return false
  if (permission.value === 'granted') return true
  if (permission.value === 'denied') return false
  const result = await Notification.requestPermission()
  permission.value = result
  return result === 'granted'
}

function showNotification(title: string, body: string, tag?: string) {
  if (!isSupported.value || permission.value !== 'granted') return
  if (!document.hidden) return
  try {
    const n = new Notification(title, { body, tag, silent: false })
    n.onclick = () => { window.focus(); n.close() }
  }
  catch (e) {
    console.warn('Notification failed', e)
  }
}

function notifyMessage(record: MessageRecord) {
  if (record.direction !== 'received') return
  unreadCount.value++
  updateTitle()
  const title = record.senderName
  const body = record.kind === 'file'
    ? `发送了文件: ${record.fileName ?? '未知文件'}`
    : (record.text?.slice(0, 100) ?? '发送了一条消息')
  showNotification(title, body, record.id)
}

export function useNotification() {
  init()
  return {
    permission: readonly(permission),
    isSupported: readonly(isSupported),
    unreadCount: readonly(unreadCount),
    requestPermission,
    notifyMessage,
  }
}
