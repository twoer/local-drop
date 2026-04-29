import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import type { MessageRecord } from '~/composables/useIndexedDB'

export const useMessagesStore = defineStore('messages', () => {
  const list = ref<MessageRecord[]>([])
  const loaded = ref(false)

  async function load() {
    if (loaded.value) return
    if (typeof indexedDB === 'undefined') return
    try {
      const db = useDB()
      list.value = await db.messages.orderBy('timestamp').toArray()
    }
    catch (e) {
      console.error('messages.load failed', e)
      toast.error('加载历史失败', { description: '可能是浏览器存储被清理或损坏' })
    }
    finally {
      loaded.value = true
    }
  }

  async function add(record: MessageRecord) {
    list.value.push(record)
    if (typeof indexedDB === 'undefined') return
    try {
      await useDB().messages.put(record)
    }
    catch (e) {
      console.error('messages.add failed', e)
      toast.error('本地存储已满', { description: '无法保存历史记录' })
    }
  }

  async function clear() {
    list.value = []
    if (typeof indexedDB === 'undefined') return
    try {
      await clearAllHistory()
      toast.success('历史已清空')
    }
    catch (e) {
      console.error('messages.clear failed', e)
      toast.error('清空历史失败')
    }
  }

  return { list, loaded, load, add, clear }
})
