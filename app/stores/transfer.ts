import { defineStore } from 'pinia'
import type { ClientId } from '~~/shared/types/domain'
import type { FileId } from '~~/shared/types/datachannel'
import type { AbortSignal, SendProgress } from '~/composables/useTransfer'

type IncomingEntry = {
  name: string
  size: number
  mime: string
  received: number
  startedAt: number
  lastSampleAt: number
  lastReceived: number
  speed: number
}

export const useTransferStore = defineStore('transfer', () => {
  const outgoing = reactive(new Map<FileId, SendProgress>())
  const incoming = reactive(new Map<FileId, IncomingEntry>())
  const outgoingFiles = new Map<FileId, File>()
  const outgoingSignals = new Map<FileId, AbortSignal>()
  const dedupedPeers = new Map<FileId, Set<ClientId>>()
  const skipChunksMap = new Map<FileId, Map<ClientId, Set<number>>>()

  // 版本计数器：每次 trackOutgoing 递增，供 computed 建立响应式依赖
  // 解决 reactive Map 的 set(key, sameRef) 不触发更新的问题，同时避免 delete+set 的中间状态闪烁
  const _outgoingVer = ref(0)
  const outgoingVersion = computed(() => _outgoingVer.value)

  function trackOutgoing(p: SendProgress, file?: File, signal?: AbortSignal) {
    outgoing.set(p.fileId, p)
    _outgoingVer.value++
    if (file) outgoingFiles.set(p.fileId, file)
    if (signal) outgoingSignals.set(p.fileId, signal)
  }

  function removeOutgoing(id: FileId) {
    outgoing.delete(id)
    outgoingFiles.delete(id)
    outgoingSignals.delete(id)
    dedupedPeers.delete(id)
    skipChunksMap.delete(id)
  }

  function getOutgoingSignal(id: FileId): AbortSignal | undefined {
    return outgoingSignals.get(id)
  }

  function cancelOutgoing(id: FileId) {
    const sig = outgoingSignals.get(id)
    if (sig) sig.aborted = true
    outgoing.delete(id)
    outgoingFiles.delete(id)
    outgoingSignals.delete(id)
    dedupedPeers.delete(id)
    skipChunksMap.delete(id)
  }

  function getOutgoingFile(id: FileId): File | undefined {
    return outgoingFiles.get(id)
  }

  function markPeerDeduped(fileId: FileId, clientId: ClientId) {
    let set = dedupedPeers.get(fileId)
    if (!set) {
      set = new Set()
      dedupedPeers.set(fileId, set)
    }
    set.add(clientId)
  }

  function getDedupedPeers(fileId: FileId): Set<ClientId> {
    let set = dedupedPeers.get(fileId)
    if (!set) {
      set = new Set()
      dedupedPeers.set(fileId, set)
    }
    return set
  }

  function setSkipChunks(fileId: FileId, clientId: ClientId, chunks: Set<number>) {
    let perFile = skipChunksMap.get(fileId)
    if (!perFile) {
      perFile = new Map()
      skipChunksMap.set(fileId, perFile)
    }
    perFile.set(clientId, chunks)
  }

  function getSkipChunksMap(fileId: FileId): Map<ClientId, Set<number>> {
    return skipChunksMap.get(fileId) ?? new Map()
  }

  function trackIncoming(meta: { id: FileId; name: string; size: number; mime: string }) {
    const now = Date.now()
    incoming.set(meta.id, {
      name: meta.name,
      size: meta.size,
      mime: meta.mime,
      received: 0,
      startedAt: now,
      lastSampleAt: now,
      lastReceived: 0,
      speed: 0,
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
    outgoingSignals.clear()
    dedupedPeers.clear()
    skipChunksMap.clear()
  }

  return {
    outgoing,
    outgoingVersion,
    incoming,
    trackOutgoing,
    removeOutgoing,
    getOutgoingFile,
    getOutgoingSignal,
    cancelOutgoing,
    markPeerDeduped,
    getDedupedPeers,
    setSkipChunks,
    getSkipChunksMap,
    trackIncoming,
    progressIncoming,
    removeIncoming,
    clear,
  }
})
