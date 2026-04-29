import {
  DEFAULT_CHUNK_SIZE,
  type ControlFrame,
  type ControlFrameOf,
  type FileId,
} from '~~/shared/types/datachannel'
import type { ClientId } from '~~/shared/types/domain'
import { encodeDataFrame } from '~~/shared/utils/dataframe'
import { resolveMime } from '~~/shared/utils/mime'
import type { DcEvent, WebRTCPeer } from './useWebRTC'

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
}

export async function sendFileToPeers(opts: {
  file: File
  fileId: FileId
  peers: Map<ClientId, WebRTCPeer>
  chunkSize?: number
  timestamp?: number
  onProgress?: (p: SendProgress) => void
}): Promise<SendProgress> {
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE
  const total = opts.file.size
  const chunks = Math.max(1, Math.ceil(total / chunkSize))
  const mime = resolveMime(opts.file)
  const timestamp = opts.timestamp ?? Date.now()

  const meta: ControlFrame = {
    type: 'file-meta',
    id: opts.fileId,
    name: opts.file.name,
    size: total,
    mime,
    chunks,
    chunkSize,
    timestamp,
  }

  const progress: SendProgress = {
    fileId: opts.fileId,
    fileName: opts.file.name,
    fileSize: total,
    perPeer: new Map(),
  }
  for (const [id] of opts.peers) {
    progress.perPeer.set(id, { sent: 0, total, state: 'pending' })
  }
  opts.onProgress?.(progress)

  for (const peer of opts.peers.values()) {
    peer.sendControl(meta)
  }

  const tasks: Promise<void>[] = []
  for (const [clientId, peer] of opts.peers) {
    const entry = progress.perPeer.get(clientId)!
    entry.state = 'sending'
    opts.onProgress?.(progress)

    tasks.push(
      sendOnePeer({
        file: opts.file,
        fileId: opts.fileId,
        chunkSize,
        chunks,
        peer,
        onChunk: (sent) => {
          entry.sent = sent
          opts.onProgress?.(progress)
        },
      })
        .then(() => {
          entry.sent = total
          entry.state = 'done'
          peer.sendControl({ type: 'file-complete', id: opts.fileId })
          opts.onProgress?.(progress)
        })
        .catch((err) => {
          entry.state = 'failed'
          entry.error = String(err)
          try {
            peer.sendControl({ type: 'file-error', id: opts.fileId, reason: String(err) })
          }
          catch {
            // ignore
          }
          opts.onProgress?.(progress)
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
  onChunk?: (sentBytes: number) => void
}) {
  let sent = 0
  for (let i = 0; i < args.chunks; i++) {
    const start = i * args.chunkSize
    const end = Math.min(start + args.chunkSize, args.file.size)
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

export type FileReceiver = {
  feed: (ev: DcEvent) => ReceivedFile | null
  cancel: (fileId: FileId) => void
  inflight: () => Iterable<FileId>
}

export function createFileReceiver(): FileReceiver {
  type Pending = {
    meta: ControlFrameOf<'file-meta'>
    chunks: (Uint8Array | null)[]
    receivedCount: number
  }
  const pendings = new Map<FileId, Pending>()

  return {
    feed(ev) {
      if (ev.kind === 'control') {
        const f = ev.frame
        if (f.type === 'file-meta') {
          pendings.set(f.id, {
            meta: f,
            chunks: Array.from({ length: f.chunks }, () => null),
            receivedCount: 0,
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
      return null
    },

    cancel(fileId) {
      pendings.delete(fileId)
    },

    inflight() {
      return pendings.keys()
    },
  }
}
