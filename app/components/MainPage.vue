<script setup lang="ts">
import { Bell, Link2, ChevronDown, Settings, Trash2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
const notification = useNotification()

const notifTitle = computed(() => {
  const p = notification.permission.value
  if (p === 'granted') return '通知已开启'
  if (p === 'denied') return '通知已被禁用'
  return '点击开启通知'
})

const notifDenied = computed(() => notification.permission.value === 'denied')

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

const wanExpanded = ref(false)
watch(hasPairing, (v) => {
  if (v) wanExpanded.value = true
}, { immediate: true })

function leaveLan() {
  signaling.leaveLan()
}

// 设置面板
const settingsOpen = ref(false)
const editName = ref('')
const nameSaved = ref(false)

function openSettings() {
  editName.value = identity.device?.name ?? ''
  nameSaved.value = false
  settingsOpen.value = true
}

function saveName() {
  const trimmed = editName.value.trim()
  if (!trimmed) return
  identity.setCustomName(trimmed)
  identity.setAssignedName(trimmed)
  nameSaved.value = true
  setTimeout(() => { nameSaved.value = false }, 1500)
}

const showClearConfirm = ref(false)

function clearHistory() {
  messages.clear()
  showClearConfirm.value = false
  settingsOpen.value = false
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
      <Button
        v-if="notification.isSupported"
        variant="ghost"
        size="icon"
        :title="notifTitle"
        :disabled="notifDenied"
        @click="() => notification.requestPermission()"
      >
        <Bell class="h-4 w-4" />
      </Button>
      <PwaInstall />
      <Button variant="ghost" size="icon" title="设置" @click="openSettings">
        <Settings class="h-4 w-4" />
      </Button>
    </header>

    <!-- 设置面板 -->
    <AlertDialog :open="settingsOpen" @update:open="settingsOpen = $event">
      <AlertDialogContent class="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>设置</AlertDialogTitle>
        </AlertDialogHeader>

        <div class="space-y-5">
          <!-- 自定义名字 -->
          <div class="space-y-2">
            <label class="text-sm font-medium">显示名称</label>
            <p class="text-xs text-muted-foreground">其他设备看到你的名字</p>
            <div class="flex items-center gap-2">
              <Input
                v-model="editName"
                placeholder="输入名称"
                class="flex-1"
                @keydown.enter="saveName"
              />
              <Button size="sm" :disabled="!editName.trim()" @click="saveName">
                {{ nameSaved ? '已保存' : '保存' }}
              </Button>
            </div>
          </div>

          <!-- 分隔线 -->
          <div class="border-t" />

          <!-- 清空历史 -->
          <div>
            <AlertDialog v-model:open="showClearConfirm">
              <AlertDialogTrigger as-child>
                <Button variant="outline" class="w-full justify-start gap-2 text-destructive hover:text-destructive">
                  <Trash2 class="h-4 w-4" />
                  清空所有历史记录
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent class="sm:max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle>清空所有本机历史？</AlertDialogTitle>
                  <AlertDialogDescription>
                    将删除本机保存的所有消息和文件副本，不可恢复。其他设备上的历史不受影响。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction @click="clearHistory">清空</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>关闭</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <main class="grid flex-1 gap-4 overflow-hidden p-4 md:grid-cols-[320px_1fr]">
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

      <section class="flex min-h-0 flex-col gap-3">
        <MessageStream />
        <InputArea />
      </section>
    </main>
  </div>
</template>
