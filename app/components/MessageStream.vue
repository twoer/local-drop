<script setup lang="ts">
import { Copy, Check } from 'lucide-vue-next'

const messages = useMessagesStore()
const identity = useIdentityStore()
const transfer = useTransferStore()

const copiedId = ref<string | null>(null)

async function copyText(id: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copiedId.value = id
    setTimeout(() => { if (copiedId.value === id) copiedId.value = null }, 1500)
  }
  catch {
    toast.error('复制失败')
  }
}

const transferRows = computed(() => {
  void transfer.outgoingVersion
  const rows: Array<{
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
  }> = []

  const now = Date.now()
  for (const [id, p] of transfer.outgoing) {
    let minSent = p.fileSize
    let anyFailed = false
    let allDone = true
    for (const e of p.perPeer.values()) {
      if (e.sent < minSent) minSent = e.sent
      if (e.state === 'failed') anyFailed = true
      if (e.state !== 'done') allDone = false
    }
    const elapsed = (now - p.startedAt) / 1000
    const speed = (!allDone && minSent > 0 && elapsed > 0) ? minSent / elapsed : 0
    const remaining = p.fileSize - minSent
    rows.push({
      id,
      direction: 'out',
      name: p.fileName,
      size: p.fileSize,
      mime: '',
      progress: p.fileSize > 0 ? minSent / p.fileSize : 1,
      state: anyFailed ? '部分失败' : allDone ? '完成' : `${p.perPeer.size} 设备`,
      failed: anyFailed,
      retryable: anyFailed,
      active: !allDone && !anyFailed,
      speed,
      eta: speed > 0 ? Math.ceil(remaining / speed) : -1,
    })
  }

  for (const [id, e] of transfer.incoming) {
    const remaining = e.size - e.received
    rows.push({
      id,
      direction: 'in',
      name: e.name,
      size: e.size,
      mime: e.mime,
      progress: e.size > 0 ? Math.min(1, e.received / e.size) : 0,
      state: '接收中',
      failed: false,
      retryable: false,
      active: true,
      speed: e.speed,
      eta: e.speed > 0 ? Math.ceil(remaining / e.speed) : -1,
    })
  }

  return rows
})

const hasTransfers = computed(() => transferRows.value.length > 0)
const totalItemCount = computed(() => messages.list.length + transferRows.value.length)

const scroller = ref<HTMLDivElement | null>(null)

watch(totalItemCount, () => {
  nextTick(() => {
    const el = scroller.value
    if (el) el.scrollTop = el.scrollHeight
  })
})

function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
</script>

<template>
  <div ref="scroller" class="flex-1 overflow-y-auto rounded-lg border bg-muted/30 p-4">
    <div v-if="messages.list.length === 0 && !hasTransfers" class="flex h-full items-center justify-center text-sm text-muted-foreground">
      还没有消息
    </div>
    <ul v-else class="space-y-3">
      <!-- 消息记录 -->
      <li
        v-for="m in messages.list"
        :key="m.id"
        class="flex w-full flex-col"
        :class="m.direction === 'sent' ? 'items-end' : 'items-start'"
      >
        <div class="mb-1 text-xs text-muted-foreground">
          {{ m.senderName }} · {{ fmtTime(m.timestamp) }}
        </div>
        <div v-if="m.kind === 'text'" class="group flex w-full items-start gap-1" :class="m.direction === 'sent' ? 'justify-end' : 'justify-start'">
          <button
            v-if="m.direction === 'sent'"
            type="button"
            class="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
            title="复制"
            @click="copyText(m.id, m.text ?? '')"
          >
            <Check v-if="copiedId === m.id" class="h-3.5 w-3.5" />
            <Copy v-else class="h-3.5 w-3.5" />
          </button>
          <div
            class="max-w-[70%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words"
            :class="m.direction === 'sent'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card border'"
          >
            {{ m.text }}
          </div>
          <button
            v-if="m.direction !== 'sent'"
            type="button"
            class="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
            title="复制"
            @click="copyText(m.id, m.text ?? '')"
          >
            <Check v-if="copiedId === m.id" class="h-3.5 w-3.5" />
            <Copy v-else class="h-3.5 w-3.5" />
          </button>
        </div>
        <FileBubble
          v-else
          :record="m"
          :is-self="m.direction === 'sent'"
        />
      </li>
      <!-- 传输中的文件（消息列表底部） -->
      <li
        v-for="t in transferRows"
        :key="`t-${t.id}`"
        class="flex flex-col"
        :class="t.direction === 'out' ? 'items-end' : 'items-start'"
      >
        <div class="mb-1 text-xs text-muted-foreground">
          {{ identity.device?.name ?? '我' }}
        </div>
        <TransferBubble v-bind="t" />
      </li>
    </ul>
  </div>
</template>
