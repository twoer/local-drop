import type { ClientId, DeviceInfo, RoomId, RoomKind } from '../../shared/types/domain'

// 一个 WebSocket 会话 = 一个 Client（同 clientId 重连复用同一对象）
export type Client = {
  clientId: ClientId
  device: DeviceInfo
  // 断线时置为 null，进入宽限期；重连后再绑定新 peer
  disconnectedAt: number | null
  publicIp: string
  lanOptOut: boolean
  rooms: Set<RoomId>
  // 宽限期 timer 句柄；重连时 clearTimeout 释放，避免累积无效回调
  graceTimer: ReturnType<typeof setTimeout> | null
}

export type Room = {
  id: RoomId
  kind: RoomKind
  code?: string
  ownerClientId?: ClientId
  members: Set<ClientId>
  createdAt: number
}

class RoomStore {
  readonly clients = new Map<ClientId, Client>()
  readonly rooms = new Map<RoomId, Room>()
  readonly codeToRoom = new Map<string, RoomId>()

  // === Client ===
  upsertClient(c: Client): void {
    this.clients.set(c.clientId, c)
  }

  getClient(id: ClientId): Client | undefined {
    return this.clients.get(id)
  }

  deleteClient(id: ClientId): void {
    this.clients.delete(id)
  }

  // === LAN 房间 ===
  ensureLanRoom(id: RoomId): Room {
    let room = this.rooms.get(id)
    if (!room) {
      room = { id, kind: 'lan', members: new Set(), createdAt: Date.now() }
      this.rooms.set(id, room)
    }
    return room
  }

  // === Pairing 房间 ===
  createPairingRoom(id: RoomId, code: string, owner: ClientId): Room {
    const room: Room = {
      id,
      kind: 'pairing',
      code,
      ownerClientId: owner,
      members: new Set([owner]),
      createdAt: Date.now(),
    }
    this.rooms.set(id, room)
    this.codeToRoom.set(code, id)
    return room
  }

  getRoomByCode(code: string): Room | undefined {
    const id = this.codeToRoom.get(code)
    return id ? this.rooms.get(id) : undefined
  }

  destroyRoom(id: RoomId): void {
    const room = this.rooms.get(id)
    if (!room) return
    if (room.code) this.codeToRoom.delete(room.code)
    this.rooms.delete(id)
  }

  // 取房间成员的 DeviceInfo（不含 excluded）
  peersOf(roomId: RoomId, excluding?: ClientId): DeviceInfo[] {
    const room = this.rooms.get(roomId)
    if (!room) return []
    const out: DeviceInfo[] = []
    for (const id of room.members) {
      if (id === excluding) continue
      const c = this.clients.get(id)
      if (c) out.push(c.device)
    }
    return out
  }

  // 收集成员当前已用的设备名（用于服务端去重）
  takenNamesIn(roomId: RoomId): string[] {
    const room = this.rooms.get(roomId)
    if (!room) return []
    const out: string[] = []
    for (const id of room.members) {
      const c = this.clients.get(id)
      if (c) out.push(c.device.name)
    }
    return out
  }
}

export const roomStore = new RoomStore()
