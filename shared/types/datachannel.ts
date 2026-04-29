export type MessageId = string

// fileId：32 字节 hex（16-byte UUID 去连字符），便于直接写入数据帧头部
export type FileId = string

import type { RoomContext } from './domain'

// 协议版本：发送方在每帧注入 v；接收方收到 v > PROTOCOL_VERSION 时拒绝（可识别"对方版本过新"）
export const PROTOCOL_VERSION = 1

// DataChannel 控制帧（JSON string 帧）
// 帧上 v 由 sendControl 自动注入，调用方不必显式填
export type ControlFrame =
  | {
      type: 'text'
      id: MessageId
      content: string
      timestamp: number
      // sender 主观选择的会话上下文。可选（兼容旧客户端），缺省时接收方按"sender 在哪些房间共有"推断
      contextKind?: RoomContext
      contextCode?: string
    }
  | {
      type: 'file-meta'
      id: FileId
      name: string
      size: number
      mime: string
      chunks: number
      chunkSize: number
      timestamp: number
    }
  | {
      type: 'file-complete'
      id: FileId
    }
  | {
      type: 'file-error'
      id: FileId
      reason: string
    }

export type ControlFrameType = ControlFrame['type']
export type ControlFrameOf<T extends ControlFrameType> = Extract<ControlFrame, { type: T }>

// 数据帧（ArrayBuffer）头部布局：
//   [0..16):  fileId    16 字节二进制（UUID v4 的原始字节）
//   [16..20): chunkIndex uint32, big-endian
//   [20..):   分片二进制数据
// FileId 在 ControlFrame / IDB 等外部表示仍为 32 hex chars（编码层 hex ↔ binary 互转）
export const FILE_ID_BYTES = 16
export const CHUNK_INDEX_OFFSET = 16
export const CHUNK_INDEX_BYTES = 4
export const DATA_FRAME_HEADER_BYTES = FILE_ID_BYTES + CHUNK_INDEX_BYTES

// 分片大小（ADR-002）
export const DEFAULT_CHUNK_SIZE = 16 * 1024

// 背压阈值（design.md §5.4）
export const BUFFERED_AMOUNT_LOW_THRESHOLD = 256 * 1024
export const BUFFERED_AMOUNT_PAUSE_THRESHOLD = 1024 * 1024
