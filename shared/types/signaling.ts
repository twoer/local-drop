import type { ClientId, DeviceInfo, Mode, RoomId, RoomKind } from './domain'

export type SignalPayload =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }

export type ClientMessage =
  | {
      type: 'hello'
      clientId: ClientId
      device: Omit<DeviceInfo, 'name'>
      mode: Mode
    }
  | { type: 'leave-lan' }
  | { type: 'create-room' }
  | { type: 'join-room'; code: string }
  | { type: 'leave-room'; roomId: RoomId }
  | { type: 'signal'; toClientId: ClientId; payload: SignalPayload }
  | { type: 'ping' }

export type RoomErrorReason =
  | 'not-found'
  | 'closed'
  | 'pool-exhausted'
  | 'invalid-code'

export type ServerMessage =
  | {
      type: 'hello-ack'
      assignedName: string
      lanRoomId: RoomId | null
      lanPeers: DeviceInfo[]
    }
  | { type: 'room-created'; roomId: RoomId; code: string }
  | { type: 'room-joined'; roomId: RoomId; peers: DeviceInfo[] }
  | {
      type: 'room-restored'
      roomId: RoomId
      kind: RoomKind
      code?: string
      peers: DeviceInfo[]
    }
  | { type: 'room-error'; reason: RoomErrorReason }
  | { type: 'peer-joined'; roomId: RoomId; peer: DeviceInfo }
  | { type: 'peer-left'; roomId: RoomId; clientId: ClientId }
  | { type: 'signal'; fromClientId: ClientId; payload: SignalPayload }
  | { type: 'room-closed'; roomId: RoomId }
  | { type: 'pong' }

export type ClientMessageType = ClientMessage['type']
export type ServerMessageType = ServerMessage['type']

export type ClientMessageOf<T extends ClientMessageType> = Extract<ClientMessage, { type: T }>
export type ServerMessageOf<T extends ServerMessageType> = Extract<ServerMessage, { type: T }>
