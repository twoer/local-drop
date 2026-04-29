import { defineStore } from 'pinia'
import type { EffectScope } from 'vue'
import type { ClientId, DeviceInfo } from '~~/shared/types/domain'
import type { PeerState, WebRTCPeer } from '~/composables/useWebRTC'

export type PeerEntry = {
  device: DeviceInfo
  state: PeerState
}

export const usePeersStore = defineStore('peers', () => {
  // 响应式：UI 显示用（device / state）
  const entries = reactive(new Map<ClientId, PeerEntry>())
  // 非响应式：命令式操作 controller，避免 reactive 把 controller.state 这个 ref 给 unwrap
  const controllers = new Map<ClientId, WebRTCPeer>()
  // 与 controller 同生命周期的 effect scope（用来托管 watch 等副作用，避免泄漏）
  const scopes = new Map<ClientId, EffectScope>()

  function upsertDevice(device: DeviceInfo) {
    const existing = entries.get(device.clientId)
    if (existing) existing.device = device
    else entries.set(device.clientId, { device, state: 'disconnected' })
  }

  function attachController(clientId: ClientId, controller: WebRTCPeer, scope?: EffectScope) {
    const old = controllers.get(clientId)
    if (old && old !== controller) {
      try {
        old.close()
      }
      catch {
        // ignore
      }
      const oldScope = scopes.get(clientId)
      if (oldScope) {
        oldScope.stop()
        scopes.delete(clientId)
      }
    }
    controllers.set(clientId, controller)
    if (scope) scopes.set(clientId, scope)
  }

  function setState(clientId: ClientId, state: PeerState) {
    const e = entries.get(clientId)
    if (e) e.state = state
  }

  function getController(clientId: ClientId): WebRTCPeer | null {
    return controllers.get(clientId) ?? null
  }

  // 仅取已连接（DC open）的 controller，发送时用
  // ⚠️ 必须 iterate 响应式的 entries，否则 computed 在 controllers 为空时订阅不到后续状态变化
  function connectedControllers(): Map<ClientId, WebRTCPeer> {
    const out = new Map<ClientId, WebRTCPeer>()
    for (const [id, entry] of entries) {
      if (entry.state === 'connected') {
        const ctrl = controllers.get(id)
        if (ctrl) out.set(id, ctrl)
      }
    }
    return out
  }

  function has(clientId: ClientId): boolean {
    return entries.has(clientId)
  }

  function remove(clientId: ClientId) {
    const c = controllers.get(clientId)
    if (c) {
      try {
        c.close()
      }
      catch {
        // ignore
      }
    }
    const scope = scopes.get(clientId)
    if (scope) {
      scope.stop()
      scopes.delete(clientId)
    }
    controllers.delete(clientId)
    entries.delete(clientId)
  }

  function clear() {
    for (const id of [...entries.keys()]) remove(id)
  }

  return {
    entries,
    upsertDevice,
    attachController,
    setState,
    getController,
    connectedControllers,
    has,
    remove,
    clear,
  }
})
