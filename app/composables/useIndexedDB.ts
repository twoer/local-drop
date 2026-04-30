import Dexie, { type Table } from 'dexie'
import type { RoomContext } from '~~/shared/types/domain'

export type MessageRecord = {
  id: string
  contextKind: RoomContext
  contextCode?: string
  direction: 'sent' | 'received'
  senderClientId: string
  senderName: string
  kind: 'text' | 'file'
  timestamp: number
  text?: string
  fileId?: string
  fileName?: string
  fileSize?: number
  fileMime?: string
  fileVerified?: boolean | null
}

export type FileRecord = {
  id: string
  blob: Blob
  name: string
  mime: string
  size: number
  storedAt: number
  hash?: string
}

export type PartialTransferRecord = {
  id: string
  name: string
  size: number
  mime: string
  chunks: number
  chunkSize: number
  receivedChunks: number[]
  timestamp: number
  hash?: string
  senderClientId?: string
}

class LocalDropDB extends Dexie {
  messages!: Table<MessageRecord, string>
  files!: Table<FileRecord, string>
  partialTransfers!: Table<PartialTransferRecord, string>

  constructor() {
    super('local-drop')
    this.version(1).stores({
      messages: 'id, [contextKind+contextCode], timestamp',
      files: 'id',
    })
    this.version(2).stores({
      messages: 'id, [contextKind+contextCode], timestamp',
      files: 'id, hash',
    })
    this.version(3).stores({
      messages: 'id, [contextKind+contextCode], timestamp',
      files: 'id, hash',
      partialTransfers: 'id, senderClientId, timestamp',
    })
  }
}

let _db: LocalDropDB | null = null

export function useDB(): LocalDropDB {
  if (typeof indexedDB === 'undefined') {
    throw new Error('IndexedDB is only available on client')
  }
  if (!_db) _db = new LocalDropDB()
  return _db
}

export async function clearAllHistory(): Promise<void> {
  const db = useDB()
  await db.transaction('rw', db.messages, db.files, db.partialTransfers, async () => {
    await db.messages.clear()
    await db.files.clear()
    await db.partialTransfers.clear()
  })
}

const PARTIAL_TRANSFER_TTL_MS = 24 * 60 * 60 * 1000

export async function cleanupStalePartials(): Promise<void> {
  const db = useDB()
  const cutoff = Date.now() - PARTIAL_TRANSFER_TTL_MS
  await db.partialTransfers.where('timestamp').below(cutoff).delete()
}
