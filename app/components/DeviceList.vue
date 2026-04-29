<script setup lang="ts">
import { House, Globe, Apple, Monitor, Smartphone, HelpCircle } from 'lucide-vue-next'
import type { Component } from 'vue'
import { Badge } from '@/components/ui/badge'
import type { DeviceInfo, Os, RoomContext } from '~~/shared/types/domain'

const room = useRoomStore()
const peers = usePeersStore()
const identity = useIdentityStore()

type ListItem = {
  device: DeviceInfo
  contexts: RoomContext[]
  state: string
  isSelf: boolean
}

const items = computed<ListItem[]>(() => {
  const map = new Map<string, ListItem>()

  function addContext(devs: DeviceInfo[] | undefined, ctx: RoomContext) {
    if (!devs) return
    for (const d of devs) {
      const cur = map.get(d.clientId)
      if (cur) {
        if (!cur.contexts.includes(ctx)) cur.contexts.push(ctx)
      }
      else {
        map.set(d.clientId, {
          device: d,
          contexts: [ctx],
          state: peers.entries.get(d.clientId)?.state ?? '—',
          isSelf: d.clientId === identity.clientId,
        })
      }
    }
  }

  addContext(room.lan?.members, 'lan')
  addContext(room.myPairing?.members, 'my-pairing')
  addContext(room.joinedPairing?.members, 'joined-pairing')

  // 也把自己加进列表（如果还没在房间成员里）
  if (identity.device && !map.has(identity.clientId)) {
    map.set(identity.clientId, {
      device: identity.device,
      contexts: [],
      state: 'self',
      isSelf: true,
    })
  }

  return [...map.values()]
})

function osIcon(os: Os): Component {
  switch (os) {
    case 'macOS':
    case 'iOS':
      return Apple
    case 'Windows':
    case 'Linux':
      return Monitor
    case 'Android':
      return Smartphone
    default:
      return HelpCircle
  }
}

function ctxLabel(ctx: RoomContext): { icon: Component; text: string } {
  if (ctx === 'lan') return { icon: House, text: 'LAN' }
  return { icon: Globe, text: ctx === 'my-pairing' ? '我创建' : '已加入' }
}

function stateColor(s: string): string {
  if (s === 'connected') return 'bg-emerald-500'
  if (s === 'connecting' || s === 'reconnecting') return 'bg-amber-500'
  if (s === 'failed') return 'bg-red-500'
  if (s === 'self') return 'bg-blue-500'
  return 'bg-muted-foreground'
}

function stateHint(s: string): string | null {
  if (s === 'failed') return '⚠️ 无法直连'
  if (s === 'reconnecting') return '重连中…'
  if (s === 'connecting') return '协商中…'
  return null
}
</script>

<template>
  <div>
    <h2 class="mb-3 text-sm font-medium text-muted-foreground">设备 ({{ items.length }})</h2>
    <ul class="space-y-2">
      <li
        v-for="item in items"
        :key="item.device.clientId"
        class="flex items-center gap-3 rounded-lg border bg-card p-3"
      >
        <component :is="osIcon(item.device.os)" class="h-5 w-5 text-muted-foreground" />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="truncate text-sm font-medium">{{ item.device.name }}</span>
            <span v-if="item.isSelf" class="text-xs text-muted-foreground">（本机）</span>
          </div>
          <div class="mt-1 flex flex-wrap items-center gap-1">
            <Badge
              v-for="c in item.contexts"
              :key="c"
              variant="secondary"
              class="gap-1 text-xs"
            >
              <component :is="ctxLabel(c).icon" class="h-3 w-3" />
              {{ ctxLabel(c).text }}
            </Badge>
            <span
              v-if="stateHint(item.state)"
              class="text-xs"
              :class="item.state === 'failed' ? 'text-red-600' : 'text-amber-600'"
            >
              {{ stateHint(item.state) }}
            </span>
          </div>
        </div>
        <span
          class="h-2 w-2 rounded-full"
          :class="stateColor(item.state)"
          :title="item.state"
        />
      </li>
    </ul>
  </div>
</template>
