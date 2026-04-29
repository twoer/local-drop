import { defineStore } from 'pinia'
import type { FileId } from '~~/shared/types/datachannel'
import type { SendProgress } from '~/composables/useTransfer'

type IncomingEntry = {
  name: string
  size: number
  mime: string
  received: number
}

export const useTransferStore = defineStore('transfer', () => {
  const outgoing = reactive(new Map<FileId, SendProgress>())
  const incoming = reactive(new Map<FileId, IncomingEntry>())
  // 非响应式：保留 File 引用以便重试（File 不需要进入响应式系统）
  const outgoingFiles = new Map<FileId, File>()

  function trackOutgoing(p: SendProgress, file?: File) {
    outgoing.set(p.fileId, p)
    if (file) outgoingFiles.set(p.fileId, file)
  }

  function removeOutgoing(id: FileId) {
    outgoing.delete(id)
    outgoingFiles.delete(id)
  }

  function getOutgoingFile(id: FileId): File | undefined {
    return outgoingFiles.get(id)
  }

  function trackIncoming(meta: { id: FileId; name: string; size: number; mime: string }) {
    incoming.set(meta.id, {
      name: meta.name,
      size: meta.size,
      mime: meta.mime,
      received: 0,
    })
  }

  function progressIncoming(id: FileId, received: number) {
    const e = incoming.get(id)
    if (e) e.received = received
  }

  function removeIncoming(id: FileId) {
    incoming.delete(id)
  }

  function clear() {
    outgoing.clear()
    incoming.clear()
    outgoingFiles.clear()
  }

  return {
    outgoing,
    incoming,
    trackOutgoing,
    removeOutgoing,
    getOutgoingFile,
    trackIncoming,
    progressIncoming,
    removeIncoming,
    clear,
  }
})
