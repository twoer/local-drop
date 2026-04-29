export type ClientId = string

export type RoomId = string

export type Mode = 'lan' | 'wan' | 'smart'

export type RoomKind = 'lan' | 'pairing'

export type Os =
  | 'macOS'
  | 'Windows'
  | 'iOS'
  | 'Android'
  | 'Linux'
  | 'Unknown'

export type Browser =
  | 'Chrome'
  | 'Edge'
  | 'Safari'
  | 'Firefox'
  | 'Unknown'

export type DeviceInfo = {
  clientId: ClientId
  name: string
  os: Os
  browser: Browser
}

export type RoomContext = 'lan' | 'my-pairing' | 'joined-pairing'
