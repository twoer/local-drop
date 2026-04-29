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
}

export type FileRecord = {
  id: string
  blob: Blob
  name: string
  mime: string
  size: number
  storedAt: number
}

class LocalDropDB extends Dexie {
  messages!: Table<MessageRecord, string>
  files!: Table<FileRecord, string>

  constructor() {
    super('local-drop')
    this.version(1).stores({
      messages: 'id, [contextKind+contextCode], timestamp',
      files: 'id',
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
  await db.transaction('rw', db.messages, db.files, async () => {
    await db.messages.clear()
    await db.files.clear()
  })
}
