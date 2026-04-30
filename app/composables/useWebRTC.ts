import {
  BUFFERED_AMOUNT_LOW_THRESHOLD,
  BUFFERED_AMOUNT_PAUSE_THRESHOLD,
  PROTOCOL_VERSION,
  type ControlFrame,
} from '~~/shared/types/datachannel'
import { decodeDataFrame } from '~~/shared/utils/dataframe'

export type ServerConfig = {
  iceServers: RTCIceServer[]
  wanMaxFileSize: number
}

let _config: ServerConfig | null = null
let _configPromise: Promise<ServerConfig> | null = null

export function fetchServerConfig(): Promise<ServerConfig> {
  if (_config) return Promise.resolve(_config)
  if (!_configPromise) {
    const baseURL = useRuntimeConfig().app.baseURL
    const cleaned = baseURL === '/' ? '' : baseURL.replace(/\/$/, '')
    _configPromise = fetch(`${cleaned}/api/config`)
      .then(r => r.json() as Promise<ServerConfig>)
      .then((c) => {
        _config = c
        return c
      })
  }
  return _configPromise
}

// 我们自己的 5 态简化（design.md §9.2.1）
export type PeerState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'disconnected'

export type DcEvent =
  | { kind: 'control'; frame: ControlFrame }
  | { kind: 'data'; fileId: string; chunkIndex: number; data: Uint8Array }

export type WebRTCPeer = {
  state: Readonly<Ref<PeerState>>
  createOffer: () => Promise<string>
  acceptOffer: (sdp: string) => Promise<string>
  acceptAnswer: (sdp: string) => Promise<void>
  acceptIce: (candidate: RTCIceCandidateInit) => Promise<void>
  sendControl: (frame: ControlFrame) => void
  sendBinary: (buf: ArrayBuffer) => Promise<void>
  // 返回新 offer sdp；caller 把它通过信令层发回对端
  restartIce: () => Promise<string>
  close: () => void
}

function deriveState(pc: RTCPeerConnection, dcOpen: boolean): PeerState {
  switch (pc.connectionState) {
    case 'closed':
      return 'disconnected'
    case 'failed':
      return 'failed'
    case 'connected':
      return dcOpen ? 'connected' : 'connecting'
    case 'disconnected':
      return 'reconnecting'
    case 'new':
      return 'disconnected'
    default:
      return 'connecting'
  }
}

export async function createWebRTCPeer(opts: {
  initiator: boolean
  onIceCandidate: (candidate: RTCIceCandidateInit) => void
  onMessage: (ev: DcEvent) => void
}): Promise<WebRTCPeer> {
  const { iceServers } = await fetchServerConfig()
  const pc = new RTCPeerConnection({ iceServers })
  const state = ref<PeerState>('connecting')
  let dc: RTCDataChannel | null = null
  let dcOpen = false

  function recompute() {
    state.value = deriveState(pc, dcOpen)
  }

  pc.onconnectionstatechange = recompute
  pc.onicecandidate = (ev) => {
    if (ev.candidate) opts.onIceCandidate(ev.candidate.toJSON())
  }

  function attach(channel: RTCDataChannel) {
    dc = channel
    dc.binaryType = 'arraybuffer'
    dc.bufferedAmountLowThreshold = BUFFERED_AMOUNT_LOW_THRESHOLD
    dc.onopen = () => {
      dcOpen = true
      recompute()
    }
    dc.onclose = () => {
      dcOpen = false
      recompute()
    }
    dc.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const parsed = JSON.parse(ev.data) as ControlFrame & { v?: number }
          if (parsed.v !== undefined && parsed.v > PROTOCOL_VERSION) {
            console.warn('protocol version too new, dropping frame', parsed.v)
            return
          }
          opts.onMessage({ kind: 'control', frame: parsed })
        }
        catch {
          // ignore
        }
      }
      else {
        try {
          const decoded = decodeDataFrame(ev.data as ArrayBuffer)
          opts.onMessage({ kind: 'data', ...decoded })
        }
        catch {
          // ignore
        }
      }
    }
  }

  if (opts.initiator) {
    attach(pc.createDataChannel('ld-data', { ordered: true }))
  }
  else {
    pc.ondatachannel = (ev) => attach(ev.channel)
  }

  async function waitForBackpressure() {
    if (!dc) return
    while (dc.bufferedAmount > BUFFERED_AMOUNT_PAUSE_THRESHOLD) {
      await new Promise<void>((resolve) => {
        // { once: true } 让监听器在一次触发后自动清理
        dc!.addEventListener('bufferedamountlow', () => resolve(), { once: true })
      })
    }
  }

  return {
    state: readonly(state) as Readonly<Ref<PeerState>>,

    async createOffer() {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      return offer.sdp ?? ''
    },

    async acceptOffer(sdp) {
      await pc.setRemoteDescription({ type: 'offer', sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      return answer.sdp ?? ''
    },

    async acceptAnswer(sdp) {
      await pc.setRemoteDescription({ type: 'answer', sdp })
    },

    async acceptIce(candidate) {
      try {
        await pc.addIceCandidate(candidate)
      }
      catch {
        // 协商窗口外的 ICE 静默忽略
      }
    },

    sendControl(frame) {
      if (dc?.readyState !== 'open') return
      // 自动注入协议版本号，调用方无需关心
      dc.send(JSON.stringify({ v: PROTOCOL_VERSION, ...frame }))
    },

    async sendBinary(buf) {
      await waitForBackpressure()
      if (dc?.readyState === 'open') dc.send(buf)
    },

    async restartIce() {
      pc.restartIce()
      const offer = await pc.createOffer({ iceRestart: true })
      await pc.setLocalDescription(offer)
      return offer.sdp ?? ''
    },

    close() {
      try {
        dc?.close()
      }
      catch {
        // ignore
      }
      try {
        pc.close()
      }
      catch {
        // ignore
      }
    },
  }
}

// 决定双方谁发起：clientId 字典序较小者是 initiator（design.md §3.1）
export function isInitiator(myClientId: string, otherClientId: string): boolean {
  return myClientId < otherClientId
}
