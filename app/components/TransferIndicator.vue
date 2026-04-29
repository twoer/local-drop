<script setup lang="ts">
import { Download, Upload, RotateCcw, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const transfer = useTransferStore()
const signaling = useSignalingStore()

type Row = {
  id: string
  direction: 'in' | 'out'
  name: string
  size: number
  progress: number
  state: string
  failed: boolean
  retryable: boolean
}

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  for (const [id, p] of transfer.outgoing) {
    let minSent = p.fileSize
    let anyFailed = false
    let allDone = true
    for (const e of p.perPeer.values()) {
      if (e.sent < minSent) minSent = e.sent
      if (e.state === 'failed') anyFailed = true
      if (e.state !== 'done') allDone = false
    }
    out.push({
      id,
      direction: 'out',
      name: p.fileName,
      size: p.fileSize,
      progress: p.fileSize > 0 ? minSent / p.fileSize : 1,
      state: anyFailed ? '部分失败' : allDone ? '完成' : `${p.perPeer.size} 设备`,
      failed: anyFailed,
      retryable: anyFailed,
    })
  }
  for (const [id, e] of transfer.incoming) {
    out.push({
      id,
      direction: 'in',
      name: e.name,
      size: e.size,
      progress: e.size > 0 ? Math.min(1, e.received / e.size) : 0,
      state: '接收中',
      failed: false,
      retryable: false,
    })
  }
  return out
})

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(1)} MB`
}

function retry(id: string) {
  void signaling.retryFile(id)
}

function dismiss(id: string) {
  signaling.dismissOutgoing(id)
}
</script>

<template>
  <div v-if="rows.length > 0" class="space-y-2">
    <div
      v-for="row in rows"
      :key="row.id"
      class="rounded-md border bg-card px-3 py-2"
      :class="row.failed ? 'border-red-300' : ''"
    >
      <div class="flex items-center gap-2 text-xs">
        <component
          :is="row.direction === 'out' ? Upload : Download"
          class="h-3.5 w-3.5 text-muted-foreground"
        />
        <span class="flex-1 truncate font-medium">{{ row.name }}</span>
        <span class="text-muted-foreground">{{ fmtSize(row.size) }}</span>
        <span :class="row.failed ? 'text-red-600' : 'text-muted-foreground'">{{ row.state }}</span>
        <Button
          v-if="row.retryable"
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          title="重试失败的设备"
          @click="retry(row.id)"
        >
          <RotateCcw class="h-3.5 w-3.5" />
        </Button>
        <Button
          v-if="row.direction === 'out'"
          variant="ghost"
          size="icon"
          class="h-6 w-6"
          title="关闭"
          @click="dismiss(row.id)"
        >
          <X class="h-3.5 w-3.5" />
        </Button>
      </div>
      <div class="mt-1 h-1 overflow-hidden rounded-full bg-muted">
        <div
          class="h-full transition-[width]"
          :class="row.failed ? 'bg-red-500' : 'bg-primary'"
          :style="{ width: `${(row.progress * 100).toFixed(1)}%` }"
        />
      </div>
    </div>
  </div>
</template>
