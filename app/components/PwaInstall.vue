<script setup lang="ts">
import { Download } from 'lucide-vue-next'
import { useEventListener } from '@vueuse/core'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// Chromium 上 beforeinstallprompt 提供的事件类型（spec 未正式定义）
type BIPEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const deferredPrompt = ref<BIPEvent | null>(null)
const isStandalone = ref(false)
const isIOS = ref(false)

onMounted(() => {
  // 已经是 standalone（已安装从主屏启动）→ 不显示按钮
  isStandalone.value = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true

  isIOS.value = /iPad|iPhone|iPod/.test(window.navigator.userAgent)
    && !(window as Window & { MSStream?: unknown }).MSStream
})

// Chromium / Edge / Android Chrome 触发；iOS Safari 不会触发
useEventListener(typeof window !== 'undefined' ? window : null, 'beforeinstallprompt', (e: Event) => {
  e.preventDefault()
  deferredPrompt.value = e as BIPEvent
})

useEventListener(typeof window !== 'undefined' ? window : null, 'appinstalled', () => {
  isStandalone.value = true
  deferredPrompt.value = null
})

const showButton = computed(() => {
  if (isStandalone.value) return false
  return Boolean(deferredPrompt.value) || isIOS.value
})

async function nativeInstall() {
  if (!deferredPrompt.value) return
  await deferredPrompt.value.prompt()
  const { outcome } = await deferredPrompt.value.userChoice
  if (outcome === 'accepted') isStandalone.value = true
  deferredPrompt.value = null
}
</script>

<template>
  <!-- Chromium 路径：可调原生 install prompt -->
  <Button
    v-if="showButton && deferredPrompt"
    variant="outline"
    size="sm"
    class="gap-1.5"
    title="安装到桌面"
    @click="nativeInstall"
  >
    <Download class="h-4 w-4" />
    <span class="hidden sm:inline">安装</span>
  </Button>

  <!-- iOS 路径：无 prompt API，弹 dialog 教学 -->
  <AlertDialog v-else-if="showButton && isIOS">
    <AlertDialogTrigger as-child>
      <Button variant="outline" size="sm" class="gap-1.5" title="添加到主屏">
        <Download class="h-4 w-4" />
        <span class="hidden sm:inline">添加到主屏</span>
      </Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>添加到主屏幕</AlertDialogTitle>
        <AlertDialogDescription>
          iOS Safari 不支持一键安装。请：
          <br>
          1. 点击 Safari 底部 <strong>分享按钮 ↑</strong>
          <br>
          2. 选择 <strong>「添加到主屏幕」</strong>
          <br>
          3. 点 <strong>「添加」</strong>
          <br><br>
          之后从主屏启动即可独立窗口使用。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogAction>知道了</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
