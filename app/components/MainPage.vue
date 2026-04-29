<script setup lang="ts">
import { Trash2, Link2, ChevronDown } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const runtimeConfig = useRuntimeConfig()
// public 资源走 baseURL 拼接，部署到子路径（如 /local-drop）也能正确解析
const logoSrc = computed(() => {
  const base = runtimeConfig.app.baseURL === '/'
    ? ''
    : runtimeConfig.app.baseURL.replace(/\/$/, '')
  return `${base}/logos/wordmark.svg`
})

const mode = useModeStore()
const signaling = useSignalingStore()
const room = useRoomStore()
const peers = usePeersStore()
const messages = useMessagesStore()
const identity = useIdentityStore()

// 仅当 LAN 房间里至少有一台别人的设备时，才暴露「我不在这个网络里」按钮
// 避免一台设备时按钮长期占位、引发"不在哪个网络"的困惑
const lanHasOthers = computed(() => {
  if (!room.lan) return false
  return room.lan.members.some(m => m.clientId !== identity.clientId)
})

const showWanPanel = computed(() => mode.mode === 'wan' || mode.mode === 'smart')

const stateLabel = computed(() => {
  switch (signaling.state) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中…'
    case 'reconnecting': return '重连中…'
    case 'failed': return '信令离线'
    case 'idle': return '未连接'
  }
  return '—'
})

const stateColor = computed(() => {
  switch (signaling.state) {
    case 'connected': return 'bg-emerald-500'
    case 'connecting':
    case 'reconnecting': return 'bg-amber-500'
    case 'failed': return 'bg-red-500'
  }
  return 'bg-muted-foreground'
})

const connectedCount = computed(() => {
  let n = 0
  for (const e of peers.entries.values()) if (e.state === 'connected') n++
  return n
})

const hasPairing = computed(() => !!room.myPairing || !!room.joinedPairing)

// 跨网区默认收起；有活动配对码房间时自动展开
const wanExpanded = ref(false)
watch(hasPairing, (v) => {
  if (v) wanExpanded.value = true
}, { immediate: true })

function leaveLan() {
  signaling.leaveLan()
}

onMounted(() => {
  signaling.start()
})
</script>

<template>
  <div class="flex h-screen flex-col">
    <LanPrivacyGate />
    <header class="flex items-center gap-3 border-b bg-card px-4 py-3">
      <img :src="logoSrc" alt="LocalDrop" class="h-9 w-auto" />
      <Badge variant="secondary" class="gap-1">
        <span class="h-2 w-2 rounded-full" :class="stateColor" />
        {{ stateLabel }}
      </Badge>
      <span class="text-xs text-muted-foreground">{{ connectedCount }} 已连接</span>
      <div class="flex-1" />
      <PwaInstall />
      <AlertDialog>
        <AlertDialogTrigger as-child>
          <Button variant="ghost" size="icon" title="清空历史">
            <Trash2 class="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空所有本机历史？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除本机保存的所有消息和文件副本，不可恢复。其他设备上的历史不受影响。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction @click="messages.clear()">清空</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>

    <main class="grid flex-1 gap-4 overflow-hidden p-4 md:grid-cols-[320px_1fr]">
      <!-- 左：设备列表 + 跨网折叠区 + LAN opt-out -->
      <aside class="flex flex-col gap-4 overflow-y-auto">
        <DeviceList />

        <section v-if="showWanPanel" class="rounded-lg border bg-card">
          <button
            type="button"
            class="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium hover:bg-accent/50"
            @click="wanExpanded = !wanExpanded"
          >
            <Link2 class="h-4 w-4 text-muted-foreground" />
            <span>跨网（配对码）</span>
            <span class="flex-1" />
            <ChevronDown
              class="h-4 w-4 text-muted-foreground transition-transform"
              :class="wanExpanded ? 'rotate-180' : ''"
            />
          </button>
          <div v-show="wanExpanded" class="border-t p-3">
            <WanRoomPanel />
          </div>
        </section>

        <section v-if="lanHasOthers">
          <Button
            variant="ghost"
            size="sm"
            class="w-full text-xs text-muted-foreground"
            title="看到不认识的设备？点这里退出（7 天内不再自动加入此网络）"
            @click="leaveLan"
          >
            我不在这个网络里
          </Button>
        </section>
      </aside>

      <!-- 右：消息流 + 传输进度 + 输入框 -->
      <!-- min-h-0 让 flex-col 内的 MessageStream 能正确滚动；不用 overflow-hidden 以免裁掉 InputArea 的 focus ring -->
      <section class="flex min-h-0 flex-col gap-3">
        <MessageStream />
        <TransferIndicator />
        <InputArea />
      </section>
    </main>
  </div>
</template>
