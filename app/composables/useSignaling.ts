import type {
  ClientMessage,
  ServerMessage,
  ServerMessageOf,
  ServerMessageType,
} from '~~/shared/types/signaling'

export type SignalingState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

// design.md §13.2：重连指数退避序列
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]
const MAX_ATTEMPTS = 5
const PING_INTERVAL_MS = 30_000

type Listener<T extends ServerMessageType> = (msg: ServerMessageOf<T>) => void

export type SignalingClient = {
  state: Readonly<Ref<SignalingState>>
  start: () => void
  stop: () => void
  send: (msg: ClientMessage) => void
  on: <T extends ServerMessageType>(type: T, fn: Listener<T>) => () => void
}

export function createSignalingClient(opts: {
  url: string
  helloPayload: () => Extract<ClientMessage, { type: 'hello' }>
}): SignalingClient {
  const state = ref<SignalingState>('idle')
  const listeners = new Map<ServerMessageType, Set<(m: ServerMessage) => void>>()
  let ws: WebSocket | null = null
  let attempt = 0
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  function on<T extends ServerMessageType>(type: T, fn: Listener<T>): () => void {
    let set = listeners.get(type)
    if (!set) {
      set = new Set()
      listeners.set(type, set)
    }
    const wrapped = fn as unknown as (m: ServerMessage) => void
    set.add(wrapped)
    return () => {
      set!.delete(wrapped)
    }
  }

  function emit(msg: ServerMessage) {
    const set = listeners.get(msg.type)
    if (!set) return
    for (const fn of set) fn(msg)
  }

  function send(msg: ClientMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }

  function startPing() {
    stopPing()
    pingTimer = setInterval(() => send({ type: 'ping' }), PING_INTERVAL_MS)
  }
  function stopPing() {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  function connect() {
    state.value = attempt > 0 ? 'reconnecting' : 'connecting'
    ws = new WebSocket(opts.url)
    ws.onopen = () => {
      attempt = 0
      state.value = 'connected'
      send(opts.helloPayload())
      startPing()
    }
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return
      try {
        emit(JSON.parse(ev.data) as ServerMessage)
      }
      catch {
        // 静默忽略损坏消息
      }
    }
    ws.onerror = () => {
      // 由 onclose 接力重连
    }
    ws.onclose = () => {
      stopPing()
      ws = null
      if (stopped) {
        state.value = 'idle'
        return
      }
      if (attempt >= MAX_ATTEMPTS) {
        state.value = 'failed'
        return
      }
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]!
      attempt++
      state.value = 'reconnecting'
      reconnectTimer = setTimeout(connect, delay)
    }
  }

  function start() {
    if (typeof WebSocket === 'undefined') return
    if (ws) return
    stopped = false
    attempt = 0
    connect()
  }

  function stop() {
    stopped = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    stopPing()
    try {
      ws?.close()
    }
    catch {
      // ignore
    }
    ws = null
    state.value = 'idle'
  }

  return { state: readonly(state) as Readonly<Ref<SignalingState>>, start, stop, send, on }
}

// 同源默认 ws URL（HTTPS → wss，HTTP → ws）
// 走 Nuxt baseURL 拼接，部署到子路径（如 /local-drop）时会得到 /local-drop/api/ws
export function defaultSignalingUrl(): string {
  if (typeof window === 'undefined') return ''
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const baseURL = useRuntimeConfig().app.baseURL
  // 规范化：baseURL 默认 '/'，自定义可能是 '/local-drop' 或 '/local-drop/'
  const cleaned = baseURL === '/' ? '' : baseURL.replace(/\/$/, '')
  return `${proto}://${window.location.host}${cleaned}/api/ws`
}
