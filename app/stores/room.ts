import { defineStore } from 'pinia'
import type { ClientId, DeviceInfo, RoomContext, RoomId } from '~~/shared/types/domain'

export type RoomRecord = {
  roomId: RoomId
  context: RoomContext
  code?: string
  members: DeviceInfo[]
}

// 用 sessionStorage 记住自创配对码，刷新后用于区分 room-restored 是 owner 还是 member
const KEY_MY_PAIRING_CODE = 'local-drop:myPairingCode'

function persistMyCode(code: string | null) {
  if (typeof sessionStorage === 'undefined') return
  if (code) sessionStorage.setItem(KEY_MY_PAIRING_CODE, code)
  else sessionStorage.removeItem(KEY_MY_PAIRING_CODE)
}

function readMyCode(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  return sessionStorage.getItem(KEY_MY_PAIRING_CODE)
}

export const useRoomStore = defineStore('room', () => {
  const lan = ref<RoomRecord | null>(null)
  const myPairing = ref<RoomRecord | null>(null)
  const joinedPairing = ref<RoomRecord | null>(null)

  // 房间内全部 device（按 clientId 去重）
  const allMembers = computed<DeviceInfo[]>(() => {
    const map = new Map<ClientId, DeviceInfo>()
    for (const r of [lan.value, myPairing.value, joinedPairing.value]) {
      if (r) for (const d of r.members) map.set(d.clientId, d)
    }
    return [...map.values()]
  })

  function findRoomById(id: RoomId): RoomRecord | null {
    if (lan.value?.roomId === id) return lan.value
    if (myPairing.value?.roomId === id) return myPairing.value
    if (joinedPairing.value?.roomId === id) return joinedPairing.value
    return null
  }

  function setLan(roomId: RoomId, members: DeviceInfo[]) {
    lan.value = { roomId, context: 'lan', members: [...members] }
  }

  function clearLan() {
    lan.value = null
  }

  function setMyPairing(roomId: RoomId, code: string, members: DeviceInfo[]) {
    myPairing.value = { roomId, context: 'my-pairing', code, members: [...members] }
    persistMyCode(code)
  }

  function clearMyPairing() {
    myPairing.value = null
    persistMyCode(null)
  }

  function setJoinedPairing(roomId: RoomId, code: string, members: DeviceInfo[]) {
    joinedPairing.value = { roomId, context: 'joined-pairing', code, members: [...members] }
  }

  function clearJoinedPairing() {
    joinedPairing.value = null
  }

  // restored 时用：根据 code 决定是 my-pairing 还是 joined-pairing
  function wasMyPairingCode(code: string | undefined): boolean {
    if (!code) return false
    if (myPairing.value?.code === code) return true
    return readMyCode() === code
  }

  function addMember(roomId: RoomId, peer: DeviceInfo) {
    const room = findRoomById(roomId)
    if (!room) return
    if (room.members.some(m => m.clientId === peer.clientId)) return
    room.members.push(peer)
  }

  function removeMember(roomId: RoomId, clientId: ClientId) {
    const room = findRoomById(roomId)
    if (!room) return
    room.members = room.members.filter(m => m.clientId !== clientId)
  }

  function dropRoom(roomId: RoomId) {
    if (lan.value?.roomId === roomId) lan.value = null
    if (myPairing.value?.roomId === roomId) {
      myPairing.value = null
      persistMyCode(null)
    }
    if (joinedPairing.value?.roomId === roomId) joinedPairing.value = null
  }

  function reset() {
    lan.value = null
    myPairing.value = null
    joinedPairing.value = null
    persistMyCode(null)
  }

  // 当前给定 clientId 还属于哪个房间（用于 cleanup orphan peers）
  function roomsContaining(clientId: ClientId): RoomRecord[] {
    return [lan.value, myPairing.value, joinedPairing.value]
      .filter((r): r is RoomRecord => !!r && r.members.some(m => m.clientId === clientId))
  }

  return {
    lan,
    myPairing,
    joinedPairing,
    allMembers,
    findRoomById,
    setLan,
    clearLan,
    setMyPairing,
    clearMyPairing,
    setJoinedPairing,
    clearJoinedPairing,
    wasMyPairingCode,
    addMember,
    removeMember,
    dropRoom,
    reset,
    roomsContaining,
  }
})
