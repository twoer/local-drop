import {
  DEFAULT_CHUNK_SIZE,
  type ControlFrame,
  type ControlFrameOf,
  type FileId,
} from '~~/shared/types/datachannel'
import type { ClientId } from '~~/shared/types/domain'
import { encodeDataFrame } from '~~/shared/utils/dataframe'
import { computeSha256 } from '~~/shared/utils/hash'
import { resolveMime } from '~~/shared/utils/mime'
import type { DcEvent, WebRTCPeer } from './useWebRTC'

export type AbortSignal = { aborted: boolean }

class TransferCancelled extends Error {
  constructor() {
    super('transfer cancelled')
  }
}

export function isTransferCancelled(err: unknown): boolean {
  return err instanceof TransferCancelled
}

export function generateFileId(): FileId {
  return crypto.randomUUID().replace(/-/g, '')
}

// =============== 发送 ===============

export type SendState = 'pending' | 'sending' | 'done' | 'failed'

export type PerPeerProgress = {
  sent: number
  total: number
  state: SendState
  error?: string
}

export type SendProgress = {
  fileId: FileId
  fileName: string
  fileSize: number
  perPeer: Map<ClientId, PerPeerProgress>
  startedAt: number
  hash?: string
}

const DEDUP_WAIT_MS = 300

export async function sendFileToPeers(opts: {
  file: File
  fileId: FileId
  peers: Map<ClientId, WebRTCPeer>
  chunkSize?: number
  timestamp?: number
  signal?: AbortSignal
  onProgress?: (p: SendProgress) => void
  senderName?: string
  dedupedPeers?: Set<ClientId>
  getSkipChunks?: (fileId: FileId, clientId: ClientId) => Set<number>
}): Promise<SendProgress> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE
  const total = opts.file.size
  const chunks = Math.max(1, Math.ceil(total / chunkSize))
  const mime = resolveMime(opts.file)
  const timestamp = opts.timestamp ?? Date.now()

  let hash: string | undefined
  try {
    const fileBuffer = await opts.file.arrayBuffer()
    hash = await computeSha256(fileBuffer)
  }
  catch (e) {
    console.warn('Failed to compute file hash', e)
  }

  const meta: ControlFrame = {
    type: 'file-meta',
    id: opts.fileId,
    name: opts.file.name,
    size: total,
    mime,
    chunks,
    chunkSize,
    timestamp,
    ...(hash ? { hash } : {}),
    ...(opts.senderName ? { senderName: opts.senderName } : {}),
  }

  const progress: SendProgress = {
    fileId: opts.fileId,
    fileName: opts.file.name,
    fileSize: total,
    perPeer: new Map(),
    startedAt: Date.now(),
    ...(hash ? { hash } : {}),
  }
  for (const [id] of opts.peers) {
    progress.perPeer.set(id, { sent: 0, total, state: 'pending' })
  }
  opts.onProgress?.(progress)

  for (const peer of opts.peers.values()) {
    peer.sendControl(meta)
  }

  // 等待接收方去重/续传回复
  const dedupedPeers = opts.dedupedPeers ?? new Set<ClientId>()
  // 始终等待 dedup/resume 回复，除非所有 peer 已确认去重（秒传已命中）
  if (dedupedPeers.size < opts.peers.size) {
    await new Promise(resolve => setTimeout(resolve, DEDUP_WAIT_MS))
  }

  const tasks: Promise<void>[] = []
  for (const [clientId, peer] of opts.peers) {
    // 去重命中：跳过数据发送
    if (dedupedPeers.has(clientId)) {
      const entry = progress.perPeer.get(clientId)!
      entry.sent = total
      entry.state = 'done'
      opts.onProgress?.(progress)
      continue
    }

    const entry = progress.perPeer.get(clientId)!
    entry.state = 'sending'
    if (!opts.signal?.aborted) opts.onProgress?.(progress)

    const skipChunks: Set<number> = opts.getSkipChunks
      ? opts.getSkipChunks(opts.fileId, clientId)
      : new Set<number>()

    tasks.push(
      sendOnePeer({
        file: opts.file,
        fileId: opts.fileId,
        chunkSize,
        chunks,
        peer,
        signal: opts.signal,
        skipChunks,
        onChunk: (sent) => {
          if (opts.signal?.aborted) return
          entry.sent = sent
          opts.onProgress?.(progress)
        },
      })
        .then(() => {
          if (opts.signal?.aborted) throw new TransferCancelled()
          entry.sent = total
          entry.state = 'done'
          peer.sendControl({ type: 'file-complete', id: opts.fileId })
          opts.onProgress?.(progress)
        })
        .catch((err) => {
          entry.state = 'failed'
          entry.error = String(err)
          try {
            if (isTransferCancelled(err)) {
              peer.sendControl({ type: 'file-cancel', id: opts.fileId })
            }
            else {
              peer.sendControl({ type: 'file-error', id: opts.fileId, reason: String(err) })
            }
          }
          catch {
            // ignore
          }
          if (!isTransferCancelled(err)) {
            opts.onProgress?.(progress)
          }
        }),
    )
  }

  await Promise.allSettled(tasks)
  return progress
}

async function sendOnePeer(args: {
  file: File
  fileId: FileId
  chunkSize: number
  chunks: number
  peer: WebRTCPeer
  signal?: AbortSignal
  skipChunks?: Set<number>
  onChunk?: (sentBytes: number) => void
}) {
  const skip = args.skipChunks ?? new Set()
  let sent = 0
  for (let i = 0; i < args.chunks; i++) {
    if (args.signal?.aborted) throw new TransferCancelled()
    const start = i * args.chunkSize
    const end = Math.min(start + args.chunkSize, args.file.size)
    const chunkBytes = end - start
    if (skip.has(i)) {
      sent += chunkBytes
      args.onChunk?.(sent)
      continue
    }
    const buf = await args.file.slice(start, end).arrayBuffer()
    const frame = encodeDataFrame(args.fileId, i, buf)
    await args.peer.sendBinary(frame)
    sent += buf.byteLength
    args.onChunk?.(sent)
  }
}

// =============== 接收 ===============

export type ReceivedFile = {
  fileId: FileId
  blob: Blob
  meta: ControlFrameOf<'file-meta'>
}

export const FILE_CANCELLED = Symbol('file-cancelled')

export type ReceiverPersistCallback = (
  fileId: FileId,
  meta: ControlFrameOf<'file-meta'>,
  receivedIndices: number[],
) => void

const PERSIST_INTERVAL_CHUNKS = 64
const PERSIST_INTERVAL_MS = 2000

export type FileReceiver = {
  feed: (ev: DcEvent) => ReceivedFile | typeof FILE_CANCELLED | null
  cancel: (fileId: FileId) => void
  inflight: () => Iterable<FileId>
  getReceivedChunks: (fileId: FileId) => number[] | null
}

export function createFileReceiver(onPersist?: ReceiverPersistCallback): FileReceiver {
  type Pending = {
    meta: ControlFrameOf<'file-meta'>
    chunks: (Uint8Array | null)[]
    receivedCount: number
    lastPersistCount: number
    lastPersistAt: number
  }
  const pendings = new Map<FileId, Pending>()

  function maybePersist(p: Pending) {
    if (!onPersist) return
    const now = Date.now()
    const sinceLast = p.receivedCount - p.lastPersistCount
    if (sinceLast >= PERSIST_INTERVAL_CHUNKS
      || (now - p.lastPersistAt >= PERSIST_INTERVAL_MS && sinceLast > 0)) {
      const indices: number[] = []
      for (let i = 0; i < p.chunks.length; i++) {
        if (p.chunks[i] !== null) indices.push(i)
      }
      onPersist(p.meta.id, p.meta, indices)
      p.lastPersistCount = p.receivedCount
      p.lastPersistAt = now
    }
  }

  return {
    feed(ev) {
      if (ev.kind === 'control') {
        const f = ev.frame
        if (f.type === 'file-meta') {
          pendings.set(f.id, {
            meta: f,
            chunks: Array.from({ length: f.chunks }, () => null),
            receivedCount: 0,
            lastPersistCount: 0,
            lastPersistAt: Date.now(),
          })
          return null
        }
        if (f.type === 'file-complete') {
          const p = pendings.get(f.id)
          if (!p) {
            console.warn('file-complete without prior file-meta', { fileId: f.id })
            return null
          }
          if (p.receivedCount !== p.meta.chunks) {
            console.error('file incomplete on complete', {
              fileId: f.id,
              received: p.receivedCount,
              expected: p.meta.chunks,
            })
            pendings.delete(f.id)
            return null
          }
          const blob = new Blob(p.chunks as BlobPart[], { type: p.meta.mime })
          pendings.delete(f.id)
          return { fileId: f.id, blob, meta: p.meta }
        }
        if (f.type === 'file-error') {
          pendings.delete(f.id)
        }
        if (f.type === 'file-cancel') {
          if (pendings.delete(f.id)) return FILE_CANCELLED
        }
        return null
      }

      const p = pendings.get(ev.fileId)
      if (!p) return null
      if (ev.chunkIndex < 0 || ev.chunkIndex >= p.chunks.length) {
        console.warn('out-of-range chunk', {
          fileId: ev.fileId,
          chunkIndex: ev.chunkIndex,
          total: p.chunks.length,
        })
        return null
      }
      if (p.chunks[ev.chunkIndex] !== null) {
        console.warn('duplicate chunk', { fileId: ev.fileId, chunkIndex: ev.chunkIndex })
        return null
      }
      p.chunks[ev.chunkIndex] = ev.data.slice()
      p.receivedCount++
      maybePersist(p)
      return null
    },

    cancel(fileId) {
      pendings.delete(fileId)
    },

    inflight() {
      return pendings.keys()
    },

    getReceivedChunks(fileId) {
      const p = pendings.get(fileId)
      if (!p) return null
      const indices: number[] = []
      for (let i = 0; i < p.chunks.length; i++) {
        if (p.chunks[i] !== null) indices.push(i)
      }
      return indices
    },
  }
}
