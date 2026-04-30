<script setup lang="ts">
import { Download, RotateCcw, Upload, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { formatSpeed, formatEta } from '~~/shared/utils/format'

const props = defineProps<{
  id: string
  direction: 'in' | 'out'
  name: string
  size: number
  mime: string
  progress: number
  state: string
  failed: boolean
  retryable: boolean
  active: boolean
  speed: number
  eta: number
}>()

const signaling = useSignalingStore()

// 速度采样：仅 incoming 需要此组件内部采样，outgoing 由父组件传入
const transfer = useTransferStore()

const { pause: pauseSpeed, resume: resumeSpeed } = useIntervalFn(() => {
  const entry = transfer.incoming.get(props.id)
  if (entry) {
    const now = Date.now()
    const elapsed = (now - entry.lastSampleAt) / 1000
    if (elapsed >= 0.4) {
      const delta = entry.received - entry.lastReceived
      entry.speed = delta / elapsed
      entry.lastSampleAt = now
      entry.lastReceived = entry.received
    }
  }
}, 500)

watch(() => props.active, (v) => {
  if (v && props.direction === 'in') resumeSpeed()
  else pauseSpeed()
}, { immediate: true })

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function onCancel() {
  if (props.direction === 'out') signaling.cancelOutgoingFile(props.id)
  else signaling.cancelIncomingFile(props.id)
}

function onRetry() {
  void signaling.retryFile(props.id)
}

function onDismiss() {
  signaling.dismissOutgoing(props.id)
}

const pct = computed(() => Math.min(100, props.progress * 100).toFixed(0))
</script>

<template>
  <div class="max-w-[260px]">
    <div
      class="rounded-lg border px-3 py-2"
      :class="[
        direction === 'out'
          ? 'bg-primary/10 border-primary/20'
          : 'bg-card',
        failed ? 'border-red-300' : '',
      ]"
    >
      <!-- 文件信息行 -->
      <div class="flex items-center gap-2">
        <component
          :is="direction === 'out' ? Upload : Download"
          class="h-4 w-4 shrink-0 text-muted-foreground"
        />
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-medium max-w-full">{{ name }}</div>
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span class="whitespace-nowrap">{{ fmtSize(size) }}</span>
            <span v-if="active" class="whitespace-nowrap">{{ pct }}%</span>
            <span v-if="active && speed > 0" class="whitespace-nowrap text-emerald-600">{{ formatSpeed(speed) }}</span>
            <span v-if="active && eta >= 0" class="whitespace-nowrap">{{ formatEta(eta) }}</span>
            <span v-if="failed" class="whitespace-nowrap text-red-600">{{ state }}</span>
          </div>
        </div>
        <!-- 操作按钮 -->
        <Button
          v-if="active"
          variant="ghost"
          size="icon"
          class="h-6 w-6 shrink-0"
          title="取消"
          @click="onCancel"
        >
          <X class="h-3.5 w-3.5" />
        </Button>
        <Button
          v-if="retryable"
          variant="ghost"
          size="icon"
          class="h-6 w-6 shrink-0"
          title="重试"
          @click="onRetry"
        >
          <RotateCcw class="h-3.5 w-3.5" />
        </Button>
        <Button
          v-if="direction === 'out' && !active && !retryable"
          variant="ghost"
          size="icon"
          class="h-6 w-6 shrink-0"
          title="关闭"
          @click="onDismiss"
        >
          <X class="h-3.5 w-3.5" />
        </Button>
      </div>
      <!-- 进度条 -->
      <div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full rounded-full transition-[width]"
          :class="failed ? 'bg-red-500' : 'bg-primary'"
          :style="{ width: `${pct}%` }"
        />
      </div>
    </div>
  </div>
</template>
