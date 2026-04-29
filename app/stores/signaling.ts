import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import type {
  ClientMessage,
  ServerMessageOf,
} from '~~/shared/types/signaling'
import type { ClientId, RoomContext } from '~~/shared/types/domain'
import {
  createSignalingClient,
  defaultSignalingUrl,
  type SignalingClient,
  type SignalingState,
} from '~/composables/useSignaling'
import {
  createWebRTCPeer,
  isInitiator,
  type DcEvent,
  type WebRTCPeer,
} from '~/composables/useWebRTC'
import { createFileReceiver, generateFileId, sendFileToPeers } from '~/composables/useTransfer'
import { resolveMime } from '~~/shared/utils/mime'

// 文字消息单帧（JSON.stringify 后）上限：DataChannel string 帧 SCTP 限制约 64KB，留 4KB 安全边
const MAX_TEXT_FRAME_BYTES = 60 * 1024

export const useSignalingStore = defineStore('signaling', () => {
  // 单例 file receiver：收到 file-meta/data/complete 都喂给它
  const receiver = createFileReceiver()
  const state = ref<SignalingState>('idle')
  const lastError = ref<string | null>(null)
  let client: SignalingClient | null = null

  // 推断 self 与 sender 之间的"主"房间上下文（LAN > my-pairing > joined-pairing）
  function contextFor(senderId: ClientId): RoomContext {
    const room = useRoomStore()
    if (room.lan?.members.some(m => m.clientId === senderId)) return 'lan'
    if (room.myPairing?.members.some(m => m.clientId === senderId)) return 'my-pairing'
    return 'joined-pairing'
  }

  function contextCodeFor(ctx: RoomContext): string | undefined {
    const room = useRoomStore()
    if (ctx === 'my-pairing') return room.myPairing?.code
    if (ctx === 'joined-pairing') return room.joinedPairing?.code
    return undefined
  }

  // ============= peer 协商 =============

  // 单飞锁：避免多次并发触发同一 peer 创建出两个 RTCPeerConnection
  const ensuringPeer = new Map<ClientId, Promise<WebRTCPeer | null>>()

  async function ensurePeerController(otherId: ClientId): Promise<WebRTCPeer | null> {
    const peers = usePeersStore()
    if (!peers.has(otherId)) return null
    const existing = peers.getController(otherId)
    if (existing) return existing

    const pending = ensuringPeer.get(otherId)
    if (pending) return pending

    const promise = doCreatePeerController(otherId)
    ensuringPeer.set(otherId, promise)
    try {
      return await promise
    }
    finally {
      ensuringPeer.delete(otherId)
    }
  }

  async function doCreatePeerController(otherId: ClientId): Promise<WebRTCPeer | null> {
    const peers = usePeersStore()
    const identity = useIdentityStore()
    if (!peers.has(otherId)) return null

    const myId = identity.clientId
    const initiator = isInitiator(myId, otherId)

    const controller = await createWebRTCPeer({
      initiator,
      onIceCandidate: (candidate) => {
        client?.send({
          type: 'signal',
          toClientId: otherId,
          payload: { kind: 'ice', candidate },
        })
      },
      onMessage: (ev) => handleDcMessage(otherId, ev),
    })

    // 把所有副作用（state watch、ICE restart timer）放进 effectScope，
    // peers.remove 时一次性清理，避免泄漏
    const scope = effectScope()
    scope.run(() => {
      let restartTimer: ReturnType<typeof setTimeout> | null = null
      const clearRestartTimer = () => {
        if (restartTimer) {
          clearTimeout(restartTimer)
          restartTimer = null
        }
      }
      watch(controller.state, (s) => {
        peers.setState(otherId, s)
        if (s === 'reconnecting' && initiator) {
          if (restartTimer) return
          restartTimer = setTimeout(async () => {
            restartTimer = null
            if (peers.getController(otherId) !== controller) return
            if (controller.state.value !== 'reconnecting') return
            try {
              const offerSdp = await controller.restartIce()
              client?.send({
                type: 'signal',
                toClientId: otherId,
                payload: { kind: 'offer', sdp: offerSdp },
              })
            }
            catch (e) {
              console.error('restartIce failed', e)
            }
          }, 3000)
        }
        else {
          clearRestartTimer()
        }
      })
      onScopeDispose(clearRestartTimer)
    })

    peers.attachController(otherId, controller, scope)

    if (initiator) {
      const offerSdp = await controller.createOffer()
      client?.send({
        type: 'signal',
        toClientId: otherId,
        payload: { kind: 'offer', sdp: offerSdp },
      })
    }
    return controller
  }

  // ============= DC 消息路由 =============

  function handleDcMessage(fromClientId: ClientId, ev: DcEvent) {
    const peers = usePeersStore()
    const messages = useMessagesStore()
    const transfer = useTransferStore()
    const sender = peers.entries.get(fromClientId)
    if (!sender) return

    if (ev.kind === 'control') {
      const f = ev.frame
      if (f.type === 'text') {
        // 优先用 sender 主观选择的 context（避免双方都在 LAN+pairing 时被错分组）；
        // 旧客户端没带 contextKind 字段时，回退到本地按双方共有房间推断
        const ctx = f.contextKind ?? contextFor(fromClientId)
        const code = f.contextKind !== undefined ? f.contextCode : contextCodeFor(ctx)
        messages.add({
          id: f.id,
          contextKind: ctx,
          contextCode: code,
          direction: 'received',
          senderClientId: fromClientId,
          senderName: sender.device.name,
          kind: 'text',
          timestamp: f.timestamp,
          text: f.content,
        })
      }
      else if (f.type === 'file-meta') {
        transfer.trackIncoming({ id: f.id, name: f.name, size: f.size, mime: f.mime })
        receiver.feed(ev)
      }
      else if (f.type === 'file-complete') {
        const result = receiver.feed(ev)
        if (result) {
          const ctx = contextFor(fromClientId)
          // 落 file blob 到 IDB
          useDB().files.put({
            id: result.fileId,
            blob: result.blob,
            name: result.meta.name,
            mime: result.meta.mime,
            size: result.meta.size,
            storedAt: Date.now(),
          }).catch((e) => {
            console.error('files.put failed', e)
            toast.error('文件保存失败', { description: '本地存储可能已满' })
          })
          // 写消息记录（消息 id 复用 fileId）
          messages.add({
            id: result.fileId,
            contextKind: ctx,
            contextCode: contextCodeFor(ctx),
            direction: 'received',
            senderClientId: fromClientId,
            senderName: sender.device.name,
            kind: 'file',
            timestamp: result.meta.timestamp,
            fileId: result.fileId,
            fileName: result.meta.name,
            fileSize: result.meta.size,
            fileMime: result.meta.mime,
          })
          transfer.removeIncoming(result.fileId)
        }
        else {
          // file-meta 未到 / 分片丢失 / 重复，receiver 已记录 console.error
          transfer.removeIncoming(f.id)
          toast.error('文件接收失败', { description: '请让对方重发' })
        }
      }
      else if (f.type === 'file-error') {
        receiver.feed(ev)
        transfer.removeIncoming(f.id)
      }
    }
    else {
      receiver.feed(ev)
      const cur = transfer.incoming.get(ev.fileId)
      if (cur) cur.received += ev.data.byteLength
    }
  }

  // ============= server 消息处理 =============

  function handleHelloAck(msg: ServerMessageOf<'hello-ack'>) {
    const identity = useIdentityStore()
    const peers = usePeersStore()
    const room = useRoomStore()
    const lanOptOut = useLanOptOutStore()

    identity.setAssignedName(msg.assignedName)

    if (!msg.lanRoomId) {
      room.clearLan()
      return
    }
    if (lanOptOut.isOptedOut(msg.lanRoomId)) {
      client?.send({ type: 'leave-lan' })
      room.clearLan()
      return
    }

    room.setLan(msg.lanRoomId, msg.lanPeers)
    for (const dev of msg.lanPeers) {
      peers.upsertDevice(dev)
      void ensurePeerController(dev.clientId)
    }
  }

  function handlePeerJoined(msg: ServerMessageOf<'peer-joined'>) {
    const peers = usePeersStore()
    const room = useRoomStore()
    peers.upsertDevice(msg.peer)
    room.addMember(msg.roomId, msg.peer)
    void ensurePeerController(msg.peer.clientId)
  }

  function handlePeerLeft(msg: ServerMessageOf<'peer-left'>) {
    const peers = usePeersStore()
    const room = useRoomStore()
    room.removeMember(msg.roomId, msg.clientId)
    if (room.roomsContaining(msg.clientId).length === 0) {
      peers.remove(msg.clientId)
    }
  }

  function handleRoomCreated(msg: ServerMessageOf<'room-created'>) {
    useRoomStore().setMyPairing(msg.roomId, msg.code, [])
  }

  function handleRoomJoined(msg: ServerMessageOf<'room-joined'>) {
    const peers = usePeersStore()
    const room = useRoomStore()
    // 服务端没回传 code，但客户端发起 join-room 时知道 code，pendingJoinCode 记录
    const code = pendingJoinCode ?? ''
    pendingJoinCode = null
    room.setJoinedPairing(msg.roomId, code, msg.peers)
    for (const dev of msg.peers) {
      peers.upsertDevice(dev)
      void ensurePeerController(dev.clientId)
    }
  }

  function handleRoomRestored(msg: ServerMessageOf<'room-restored'>) {
    const peers = usePeersStore()
    const room = useRoomStore()

    if (msg.kind === 'lan') {
      room.setLan(msg.roomId, msg.peers)
    }
    else {
      const isOwner = room.wasMyPairingCode(msg.code)
      if (isOwner) room.setMyPairing(msg.roomId, msg.code ?? '', msg.peers)
      else room.setJoinedPairing(msg.roomId, msg.code ?? '', msg.peers)
    }
    for (const dev of msg.peers) {
      peers.upsertDevice(dev)
      // ws 重连后旧 PeerConnection 的 ICE/DTLS 可能已 stale；
      // 非 'connected' 状态的旧 controller 主动关闭重建（design.md §4.4.3）
      const state = peers.entries.get(dev.clientId)?.state
      if (peers.getController(dev.clientId) && state !== 'connected') {
        peers.remove(dev.clientId)
        peers.upsertDevice(dev)
      }
      void ensurePeerController(dev.clientId)
    }
  }

  function handleRoomError(msg: ServerMessageOf<'room-error'>) {
    lastError.value = msg.reason
    pendingJoinCode = null
    switch (msg.reason) {
      case 'not-found':
        toast.error('房间不存在或已关闭')
        break
      case 'invalid-code':
        toast.error('请输入 4 位数字')
        break
      case 'pool-exhausted':
        toast.error('服务器繁忙', { description: '请稍后再试' })
        break
      case 'closed':
        toast.warning('房间已关闭')
        break
    }
  }

  function handleRoomClosed(msg: ServerMessageOf<'room-closed'>) {
    const peers = usePeersStore()
    const room = useRoomStore()
    const closingMembers = room.findRoomById(msg.roomId)?.members ?? []
    room.dropRoom(msg.roomId)
    // 不在任何剩余房间的成员清理掉
    for (const m of closingMembers) {
      if (room.roomsContaining(m.clientId).length === 0) peers.remove(m.clientId)
    }
  }

  async function handleSignal(msg: ServerMessageOf<'signal'>) {
    const ctrl = await ensurePeerController(msg.fromClientId)
    if (!ctrl) return
    const p = msg.payload
    if (p.kind === 'offer') {
      const answerSdp = await ctrl.acceptOffer(p.sdp)
      client?.send({
        type: 'signal',
        toClientId: msg.fromClientId,
        payload: { kind: 'answer', sdp: answerSdp },
      })
    }
    else if (p.kind === 'answer') {
      await ctrl.acceptAnswer(p.sdp)
    }
    else if (p.kind === 'ice') {
      await ctrl.acceptIce(p.candidate)
    }
  }

  // ============= 公开 API =============

  // 用户主动 join 时记下 code，handleRoomJoined 时回填到 store
  let pendingJoinCode: string | null = null

  function ensureClient(): SignalingClient {
    if (client) return client
    const identity = useIdentityStore()
    const mode = useModeStore()

    client = createSignalingClient({
      url: defaultSignalingUrl(),
      helloPayload: () => ({
        type: 'hello',
        clientId: identity.clientId,
        device: {
          clientId: identity.clientId,
          os: identity.device?.os ?? 'Unknown',
          browser: identity.device?.browser ?? 'Unknown',
        },
        mode: mode.mode ?? 'smart',
      }),
    })

    watch(client.state, (s) => {
      state.value = s
      if (s === 'failed') {
        toast.error('信令服务暂时不可用', { description: '请检查网络后刷新页面' })
      }
    }, { immediate: true })

    client.on('hello-ack', handleHelloAck)
    client.on('peer-joined', handlePeerJoined)
    client.on('peer-left', handlePeerLeft)
    client.on('room-created', handleRoomCreated)
    client.on('room-joined', handleRoomJoined)
    client.on('room-restored', handleRoomRestored)
    client.on('room-error', handleRoomError)
    client.on('room-closed', handleRoomClosed)
    client.on('signal', handleSignal)

    return client
  }

  function start() {
    ensureClient().start()
  }

  function stop() {
    client?.stop()
    usePeersStore().clear()
    useRoomStore().reset()
  }

  function send(msg: ClientMessage) {
    ensureClient().send(msg)
  }

  // ============= 业务动作 =============

  function createPairingRoom() {
    send({ type: 'create-room' })
  }

  function joinPairingRoom(code: string) {
    pendingJoinCode = code
    send({ type: 'join-room', code })
  }

  function leavePairingRoom(roomId: string) {
    send({ type: 'leave-room', roomId })
    const room = useRoomStore()
    room.dropRoom(roomId)
  }

  function leaveLan() {
    const room = useRoomStore()
    if (!room.lan) return
    const fingerprint = room.lan.roomId
    useLanOptOutStore().optOut(fingerprint)
    send({ type: 'leave-lan' })
    room.clearLan()
  }

  function broadcastText(text: string) {
    if (!text.trim()) return

    const peers = usePeersStore()
    const identity = useIdentityStore()
    const messages = useMessagesStore()
    const room = useRoomStore()
    const id = crypto.randomUUID()
    const now = Date.now()
    const myDevice = identity.device
    if (!myDevice) return

    // 序列化后 byteLength 校验（按 JSON.stringify 实际占用，覆盖 \" \\n 等转义膨胀）
    // 用一个 sample frame 取上限：contextCode 占 4 chars，contextKind 取最长 'joined-pairing'
    const sampleFrame = {
      type: 'text' as const,
      id,
      content: text,
      timestamp: now,
      contextKind: 'joined-pairing' as const,
      contextCode: '0000',
    }
    const frameBytes = new TextEncoder().encode(JSON.stringify(sampleFrame)).byteLength
    if (frameBytes > MAX_TEXT_FRAME_BYTES) {
      toast.error('文本过长', {
        description: `单条消息上限 ${(MAX_TEXT_FRAME_BYTES / 1024).toFixed(0)} KB，当前 ${(frameBytes / 1024).toFixed(1)} KB。建议另存为文件后用 📎 发送。`,
      })
      return
    }

    const targetControllers = peers.connectedControllers()
    if (targetControllers.size === 0) {
      toast.error('当前没有已连接的设备')
      return
    }

    let anyFailed = false
    for (const [peerId, peer] of targetControllers) {
      // 帧 contextKind/code 仍按 self↔peer 共有房间逐个决定
      // 协议保留这两个字段供 V2 分组显示，本版 UI 不消费
      const frameKind = contextFor(peerId)
      const frameCode = contextCodeFor(frameKind)
      try {
        peer.sendControl({
          type: 'text',
          id,
          content: text,
          timestamp: now,
          contextKind: frameKind,
          contextCode: frameCode,
        })
      }
      catch (e) {
        anyFailed = true
        console.error('text sendControl failed', { peerId, error: e })
      }
    }

    if (anyFailed) {
      toast.warning('部分设备未收到', {
        description: '连接异常或消息超出对端缓冲，可重发',
      })
    }

    // 本地落库取第一个 connected peer 的归属（混合上下文场景仅供分析，UI 不分组）
    const [firstPeerId] = targetControllers.keys()
    const ctxKind: RoomContext = firstPeerId ? contextFor(firstPeerId) : 'lan'
    const ctxCode = contextCodeFor(ctxKind)

    messages.add({
      id,
      contextKind: ctxKind,
      contextCode: ctxCode,
      direction: 'sent',
      senderClientId: identity.clientId,
      senderName: myDevice.name,
      kind: 'text',
      timestamp: now,
      text,
    })
  }

  async function broadcastFile(file: File) {
    const peers = usePeersStore()
    const identity = useIdentityStore()
    const messages = useMessagesStore()
    const transfer = useTransferStore()
    const myDevice = identity.device
    if (!myDevice) return

    const controllers = peers.connectedControllers()
    if (controllers.size === 0) return

    const fileId = generateFileId()
    const timestamp = Date.now()
    const mime = resolveMime(file)

    void sendFileToPeers({
      file,
      fileId,
      peers: controllers,
      timestamp,
      onProgress: (p) => {
        // 第一次回调时把 File 引用一起记下，后续重试用
        transfer.trackOutgoing(p, file)
      },
    }).then((finalProgress) => {
      const anyFailed = [...finalProgress.perPeer.values()].some(e => e.state === 'failed')
      if (anyFailed) {
        toast.error('部分设备未收到', { description: file.name })
        // 失败的保留在 outgoing 里，让用户看到重试按钮
      }
      else {
        setTimeout(() => transfer.removeOutgoing(fileId), 800)
      }
    })

    // 本地落 IDB（让自己历史里也能预览/下载）
    try {
      await useDB().files.put({
        id: fileId,
        blob: file,
        name: file.name,
        mime,
        size: file.size,
        storedAt: Date.now(),
      })
    }
    catch (e) {
      console.error('files.put failed', e)
      toast.error('文件保存失败', { description: '本地存储可能已满' })
    }

    const [firstPeerId] = controllers.keys()
    const ctx = firstPeerId ? contextFor(firstPeerId) : 'lan'
    void messages.add({
      id: fileId,
      contextKind: ctx,
      contextCode: contextCodeFor(ctx),
      direction: 'sent',
      senderClientId: identity.clientId,
      senderName: myDevice.name,
      kind: 'file',
      timestamp,
      fileId,
      fileName: file.name,
      fileSize: file.size,
      fileMime: mime,
    })
  }

  async function retryFile(fileId: string) {
    const peers = usePeersStore()
    const transfer = useTransferStore()
    const progress = transfer.outgoing.get(fileId)
    if (!progress) return
    const file = transfer.getOutgoingFile(fileId)
    if (!file) {
      toast.error('无法重试', { description: '原始文件已不可用' })
      transfer.removeOutgoing(fileId)
      return
    }

    // 仅重发到失败的 peers
    const connected = peers.connectedControllers()
    const failedPeers = new Map<ClientId, ReturnType<typeof connected.get> & object>()
    for (const [id, e] of progress.perPeer) {
      if (e.state === 'failed') {
        const c = connected.get(id)
        if (c) failedPeers.set(id, c)
      }
    }
    if (failedPeers.size === 0) {
      transfer.removeOutgoing(fileId)
      return
    }

    // 重置失败 entry 的状态
    for (const id of failedPeers.keys()) {
      const e = progress.perPeer.get(id)
      if (e) {
        e.sent = 0
        e.state = 'pending'
        e.error = undefined
      }
    }

    const result = await sendFileToPeers({
      file,
      fileId,
      peers: failedPeers,
      onProgress: (sub) => {
        // 把子进度合并回原 progress
        for (const [id, entry] of sub.perPeer) {
          progress.perPeer.set(id, entry)
        }
      },
    })

    const stillFailed = [...result.perPeer.values()].some(e => e.state === 'failed')
    if (stillFailed) {
      toast.error('仍有设备未收到', { description: file.name })
    }
    else {
      toast.success('重发完成', { description: file.name })
      setTimeout(() => transfer.removeOutgoing(fileId), 800)
    }
  }

  function dismissOutgoing(fileId: string) {
    useTransferStore().removeOutgoing(fileId)
  }

  return {
    state: readonly(state),
    lastError,
    start,
    stop,
    send,
    createPairingRoom,
    joinPairingRoom,
    leavePairingRoom,
    leaveLan,
    broadcastText,
    broadcastFile,
    retryFile,
    dismissOutgoing,
  }
})
