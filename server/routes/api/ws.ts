import type { Peer } from 'crossws'
import type {
  ClientMessage,
  ClientMessageOf,
  ServerMessage,
} from '../../../shared/types/signaling'
import type { ClientId, RoomId } from '../../../shared/types/domain'
import { codePool } from '../../utils/codePool'
import { dedupName, formatDeviceName } from '../../utils/deviceName'
import { extractPublicIp, lanRoomIdOf } from '../../utils/lanMatcher'
import { logger } from '../../utils/logger'
import { roomStore } from '../../utils/roomStore'

const GRACE_PERIOD_MS = Number(process.env.LD_GRACE_PERIOD_MS ?? 15_000)

// 只活跃的连接：clientId → peer。断线即移除，重连重新绑定
const peers = new Map<ClientId, Peer>()

function send(clientId: ClientId, msg: ServerMessage): void {
  const peer = peers.get(clientId)
  if (!peer) return
  peer.send(JSON.stringify(msg))
}

function broadcast(roomId: RoomId, msg: ServerMessage, exclude?: ClientId): void {
  const room = roomStore.rooms.get(roomId)
  if (!room) return
  for (const id of room.members) {
    if (id !== exclude) send(id, msg)
  }
}

function removeFromLanRooms(clientId: ClientId): void {
  const client = roomStore.getClient(clientId)
  if (!client) return
  for (const rid of [...client.rooms]) {
    const room = roomStore.rooms.get(rid)
    if (!room || room.kind !== 'lan') continue
    room.members.delete(clientId)
    client.rooms.delete(rid)
    broadcast(rid, { type: 'peer-left', roomId: rid, clientId })
    if (room.members.size === 0) roomStore.destroyRoom(rid)
  }
}

function leaveJoinedPairingRooms(clientId: ClientId, exceptRoomId?: RoomId): void {
  const client = roomStore.getClient(clientId)
  if (!client) return
  for (const rid of [...client.rooms]) {
    if (rid === exceptRoomId) continue
    const room = roomStore.rooms.get(rid)
    if (!room || room.kind !== 'pairing') continue
    if (room.ownerClientId === clientId) continue // 不动自己创建的房间
    room.members.delete(clientId)
    client.rooms.delete(rid)
    broadcast(rid, { type: 'peer-left', roomId: rid, clientId })
  }
}

function destroyPairingRoom(clientId: ClientId, room: { id: RoomId; code?: string; members: Set<ClientId> }): void {
  for (const memberId of room.members) {
    if (memberId === clientId) continue
    const m = roomStore.getClient(memberId)
    if (m) m.rooms.delete(room.id)
    send(memberId, { type: 'room-closed', roomId: room.id })
  }
  if (room.code) codePool.release(room.code)
  roomStore.destroyRoom(room.id)
}

// =============== 协议处理 ===============

function handleHello(peer: Peer, msg: ClientMessageOf<'hello'>): void {
  const publicIp = extractPublicIp(peer.request?.headers ?? {}, peer.remoteAddress ?? null)

  // TODO(debug): 排查"同 WiFi 看不到对方"，临时打印原始 IP 来源。诊断完毕后删除。
  if (process.env.LD_DEBUG_IP === '1') {
    const headers = peer.request?.headers
    const get = (k: string) => headers instanceof Headers ? headers.get(k) : (headers as Record<string, string | undefined> | undefined)?.[k]
    logger.info('debug.hello-ip', {
      clientId: msg.clientId,
      resolved: publicIp,
      remoteAddress: peer.remoteAddress ?? null,
      xForwardedFor: get('x-forwarded-for') ?? null,
      xRealIp: get('x-real-ip') ?? null,
    })
  }

  // 防伪造：拒绝同 clientId 已有活跃会话的重复 hello
  // 否则攻击者发任意已知 clientId 会清空目标用户 rooms
  const existing = roomStore.getClient(msg.clientId)
  if (existing && existing.disconnectedAt === null) {
    logger.warn('hello.duplicate-active', { clientId: msg.clientId, peerId: peer.id })
    try {
      peer.close(4000, 'duplicate clientId')
    }
    catch {
      // ignore
    }
    return
  }

  peer.context.clientId = msg.clientId
  peers.set(msg.clientId, peer)

  if (existing && existing.disconnectedAt !== null) {
    // 宽限期内重连：复用 Client，rooms 集合保留
    existing.disconnectedAt = null
    existing.publicIp = publicIp
    if (existing.graceTimer) {
      clearTimeout(existing.graceTimer)
      existing.graceTimer = null
    }

    const lanRoomId = existing.lanOptOut ? null : lanRoomIdOf(publicIp)
    send(msg.clientId, {
      type: 'hello-ack',
      assignedName: existing.device.name,
      lanRoomId,
      lanPeers: lanRoomId ? roomStore.peersOf(lanRoomId, msg.clientId) : [],
    })

    for (const rid of existing.rooms) {
      const room = roomStore.rooms.get(rid)
      if (!room) continue
      send(msg.clientId, {
        type: 'room-restored',
        roomId: rid,
        kind: room.kind,
        code: room.code,
        peers: roomStore.peersOf(rid, msg.clientId),
      })
    }

    logger.info('client.restored', { clientId: msg.clientId, rooms: existing.rooms.size })
    return
  }

  // 新 client
  const baseName = formatDeviceName(msg.device.os, msg.device.browser)
  const lanRoomId = lanRoomIdOf(publicIp)
  const willJoinLan = msg.mode !== 'wan'
  const taken = willJoinLan ? roomStore.takenNamesIn(lanRoomId) : []
  const assignedName = dedupName(baseName, taken)

  roomStore.upsertClient({
    clientId: msg.clientId,
    device: {
      clientId: msg.clientId,
      name: assignedName,
      os: msg.device.os,
      browser: msg.device.browser,
    },
    disconnectedAt: null,
    publicIp,
    lanOptOut: false,
    rooms: new Set(),
    graceTimer: null,
  })

  if (!willJoinLan) {
    send(msg.clientId, {
      type: 'hello-ack',
      assignedName,
      lanRoomId: null,
      lanPeers: [],
    })
    logger.info('client.hello', { clientId: msg.clientId, mode: msg.mode, lan: 'skipped' })
    return
  }

  roomStore.ensureLanRoom(lanRoomId)
  const lanPeersBefore = roomStore.peersOf(lanRoomId, msg.clientId)
  const room = roomStore.rooms.get(lanRoomId)!
  room.members.add(msg.clientId)
  const client = roomStore.getClient(msg.clientId)!
  client.rooms.add(lanRoomId)

  send(msg.clientId, {
    type: 'hello-ack',
    assignedName,
    lanRoomId,
    lanPeers: lanPeersBefore,
  })
  broadcast(lanRoomId, { type: 'peer-joined', roomId: lanRoomId, peer: client.device }, msg.clientId)

  logger.info('client.hello', { clientId: msg.clientId, mode: msg.mode, lan: lanRoomId })
}

function handleLeaveLan(peer: Peer): void {
  const clientId = peer.context.clientId as ClientId | undefined
  if (!clientId) return
  const client = roomStore.getClient(clientId)
  if (!client || client.lanOptOut) return // 幂等
  client.lanOptOut = true
  removeFromLanRooms(clientId)
  logger.info('client.leave-lan', { clientId })
}

function handleCreateRoom(peer: Peer): void {
  const clientId = peer.context.clientId as ClientId | undefined
  if (!clientId) return
  const client = roomStore.getClient(clientId)
  if (!client) return

  const code = codePool.alloc()
  if (!code) {
    send(clientId, { type: 'room-error', reason: 'pool-exhausted' })
    return
  }
  const roomId = `pair-${code}`
  roomStore.createPairingRoom(roomId, code, clientId)
  client.rooms.add(roomId)
  send(clientId, { type: 'room-created', roomId, code })
  logger.info('room.created', { roomId, code, owner: clientId })
}

function handleJoinRoom(peer: Peer, msg: ClientMessageOf<'join-room'>): void {
  const clientId = peer.context.clientId as ClientId | undefined
  if (!clientId) return
  const client = roomStore.getClient(clientId)
  if (!client) return

  if (!/^\d{4}$/.test(msg.code)) {
    send(clientId, { type: 'room-error', reason: 'invalid-code' })
    return
  }
  const room = roomStore.getRoomByCode(msg.code)
  if (!room) {
    send(clientId, { type: 'room-error', reason: 'not-found' })
    return
  }

  // 重复加入同房间：直接返回当前成员
  if (room.members.has(clientId)) {
    send(clientId, {
      type: 'room-joined',
      roomId: room.id,
      peers: roomStore.peersOf(room.id, clientId),
    })
    return
  }

  // 决议 #1：先 leave 已加入的其他远程房间（不是自己创建的）
  leaveJoinedPairingRooms(clientId, room.id)

  const peersBefore = roomStore.peersOf(room.id, clientId)
  room.members.add(clientId)
  client.rooms.add(room.id)

  send(clientId, { type: 'room-joined', roomId: room.id, peers: peersBefore })
  broadcast(room.id, { type: 'peer-joined', roomId: room.id, peer: client.device }, clientId)
  logger.info('room.joined', { roomId: room.id, clientId })
}

function handleLeaveRoom(peer: Peer, msg: ClientMessageOf<'leave-room'>): void {
  const clientId = peer.context.clientId as ClientId | undefined
  if (!clientId) return
  const client = roomStore.getClient(clientId)
  if (!client) return
  const room = roomStore.rooms.get(msg.roomId)
  if (!room || !client.rooms.has(msg.roomId)) return

  const isOwner = room.kind === 'pairing' && room.ownerClientId === clientId
  if (isOwner) {
    destroyPairingRoom(clientId, room)
  } else {
    room.members.delete(clientId)
    broadcast(room.id, { type: 'peer-left', roomId: room.id, clientId })
    if (room.kind === 'lan' && room.members.size === 0) {
      roomStore.destroyRoom(room.id)
    }
  }
  client.rooms.delete(room.id)
  logger.info('room.left', { roomId: room.id, clientId, isOwner })
}

function handleSignal(peer: Peer, msg: ClientMessageOf<'signal'>): void {
  const fromClientId = peer.context.clientId as ClientId | undefined
  if (!fromClientId) return

  // 校验：from/to 必须至少共享一个房间，避免跨房间信令探测
  const fromClient = roomStore.getClient(fromClientId)
  const toClient = roomStore.getClient(msg.toClientId)
  if (!fromClient || !toClient) return

  let shared = false
  for (const rid of fromClient.rooms) {
    if (toClient.rooms.has(rid)) {
      shared = true
      break
    }
  }
  if (!shared) {
    logger.warn('signal.cross-room-rejected', { from: fromClientId, to: msg.toClientId })
    return
  }

  send(msg.toClientId, { type: 'signal', fromClientId, payload: msg.payload })
}

function handleClose(clientId: ClientId): void {
  const client = roomStore.getClient(clientId)
  if (!client) return
  if (peers.get(clientId)?.context.clientId === clientId) {
    peers.delete(clientId)
  }
  client.disconnectedAt = Date.now()
  logger.info('client.disconnected', { clientId })

  // 重连会 clearTimeout 这个句柄，避免 timer 累积
  if (client.graceTimer) clearTimeout(client.graceTimer)
  client.graceTimer = setTimeout(() => {
    const c = roomStore.getClient(clientId)
    if (!c) return
    c.graceTimer = null
    if (c.disconnectedAt === null) return // 已重连
    if (Date.now() - c.disconnectedAt < GRACE_PERIOD_MS) return

    for (const rid of [...c.rooms]) {
      const room = roomStore.rooms.get(rid)
      if (!room) continue
      const isOwner = room.kind === 'pairing' && room.ownerClientId === clientId
      if (isOwner) {
        destroyPairingRoom(clientId, room)
      } else {
        room.members.delete(clientId)
        broadcast(rid, { type: 'peer-left', roomId: rid, clientId })
        if (room.kind === 'lan' && room.members.size === 0) {
          roomStore.destroyRoom(rid)
        }
      }
    }
    roomStore.deleteClient(clientId)
    logger.info('client.removed', { clientId })
  }, GRACE_PERIOD_MS + 100)
}

// =============== crossws handler ===============

export default defineWebSocketHandler({
  open(_peer) {
    // 等待 hello；不在此分配身份
  },

  message(peer, packet) {
    const text = typeof packet === 'string' ? packet : packet.text()
    let msg: ClientMessage
    try {
      msg = JSON.parse(text) as ClientMessage
    } catch {
      logger.warn('ws.invalid-json', { peerId: peer.id })
      return
    }

    switch (msg.type) {
      case 'hello':
        handleHello(peer, msg)
        break
      case 'leave-lan':
        handleLeaveLan(peer)
        break
      case 'create-room':
        handleCreateRoom(peer)
        break
      case 'join-room':
        handleJoinRoom(peer, msg)
        break
      case 'leave-room':
        handleLeaveRoom(peer, msg)
        break
      case 'signal':
        handleSignal(peer, msg)
        break
      case 'ping':
        peer.send(JSON.stringify({ type: 'pong' } satisfies ServerMessage))
        break
    }
  },

  close(peer) {
    const clientId = peer.context.clientId as ClientId | undefined
    if (clientId) handleClose(clientId)
  },

  error(peer, error) {
    logger.warn('ws.error', { peerId: peer.id, error: String(error) })
  },
})
