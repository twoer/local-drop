import {
  CHUNK_INDEX_OFFSET,
  DATA_FRAME_HEADER_BYTES,
  FILE_ID_BYTES,
  type FileId,
} from '../types/datachannel'

// 32-hex string → 16-byte binary
function hexToBytes(hex: string): Uint8Array {
  if (hex.length !== FILE_ID_BYTES * 2) {
    throw new Error(`fileId must be ${FILE_ID_BYTES * 2} hex chars, got ${hex.length}`)
  }
  const bytes = new Uint8Array(FILE_ID_BYTES)
  for (let i = 0; i < FILE_ID_BYTES; i++) {
    const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error(`invalid hex at offset ${i * 2}: ${hex.slice(i * 2, i * 2 + 2)}`)
    bytes[i] = byte
  }
  return bytes
}

// 16-byte binary → 32-hex string
function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    out += bytes[i]!.toString(16).padStart(2, '0')
  }
  return out
}

export function encodeDataFrame(
  fileId: FileId,
  chunkIndex: number,
  payload: ArrayBuffer | Uint8Array,
): ArrayBuffer {
  const idBytes = hexToBytes(fileId)
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 0xffffffff) {
    throw new Error(`chunkIndex out of uint32 range: ${chunkIndex}`)
  }
  const data = payload instanceof Uint8Array ? payload : new Uint8Array(payload)
  const buffer = new ArrayBuffer(DATA_FRAME_HEADER_BYTES + data.byteLength)
  const out = new Uint8Array(buffer)
  out.set(idBytes, 0)
  new DataView(buffer).setUint32(CHUNK_INDEX_OFFSET, chunkIndex, false)
  out.set(data, DATA_FRAME_HEADER_BYTES)
  return buffer
}

export type DecodedDataFrame = {
  fileId: FileId
  chunkIndex: number
  data: Uint8Array
}

export function decodeDataFrame(buf: ArrayBuffer): DecodedDataFrame {
  if (buf.byteLength < DATA_FRAME_HEADER_BYTES) {
    throw new Error(`data frame too short: ${buf.byteLength} < ${DATA_FRAME_HEADER_BYTES}`)
  }
  const view = new Uint8Array(buf)
  const fileId = bytesToHex(view.subarray(0, FILE_ID_BYTES))
  const chunkIndex = new DataView(buf).getUint32(CHUNK_INDEX_OFFSET, false)
  const data = view.subarray(DATA_FRAME_HEADER_BYTES)
  return { fileId, chunkIndex, data }
}

// 把 UUID v4（含或不含连字符）规范化为 32 hex 字符串
export function normalizeFileId(uuid: string): FileId {
  const hex = uuid.replace(/-/g, '').toLowerCase()
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`invalid uuid: ${uuid}`)
  }
  return hex
}
