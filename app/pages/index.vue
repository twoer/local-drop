<script setup lang="ts">
import type { Mode } from '~~/shared/types/domain'

const route = useRoute()
const mode = useModeStore()
const signaling = useSignalingStore()

// 浏览器特性检测（仅 client）
const unsupportedReasons = ref<string[]>([])

onMounted(() => {
  const r: string[] = []
  if (!('RTCPeerConnection' in window)) r.push('当前浏览器不支持 WebRTC')
  if (!('indexedDB' in window)) r.push('当前浏览器不支持 IndexedDB')
  if (!('WebSocket' in window)) r.push('当前浏览器不支持 WebSocket')
  if (!window.isSecureContext) r.push('请通过 HTTPS 访问（localhost 也算安全上下文）')
  unsupportedReasons.value = r
})

// URL 参数仍然支持
const urlMode = computed<Mode | null>(() => {
  const m = route.query.mode
  if (m === 'lan' || m === 'wan' || m === 'smart') return m
  return null
})

const urlJoin = computed<string | null>(() => {
  const j = route.query.join
  return typeof j === 'string' && /^\d{4}$/.test(j) ? j : null
})

watchEffect(() => {
  if (urlMode.value) mode.setMode(urlMode.value, mode.remember)
})

// ?join=1234 自动加入：等信令连上后再发 join-room
watch(
  () => signaling.state,
  (s) => {
    if (s === 'connected' && urlJoin.value) {
      signaling.joinPairingRoom(urlJoin.value)
    }
  },
)
</script>

<template>
  <UnsupportedPage v-if="unsupportedReasons.length > 0" :reasons="unsupportedReasons" />
  <div v-else class="min-h-screen bg-background text-foreground">
    <MainPage />
  </div>
</template>
