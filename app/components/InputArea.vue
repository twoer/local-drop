<script setup lang="ts">
import { Send, Paperclip } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const peers = usePeersStore()
const signaling = useSignalingStore()

const text = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)

const hasPeer = computed(() => peers.connectedControllers().size > 0)
const canSend = computed(() => Boolean(text.value.trim()) && hasPeer.value)

function send() {
  if (!canSend.value) return
  signaling.broadcastText(text.value)
  text.value = ''
}

async function broadcastFiles(files: FileList | File[]) {
  const list = Array.from(files)
  for (const file of list) {
    await signaling.broadcastFile(file)
  }
}

function openFilePicker() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement
  if (!target.files) return
  await broadcastFiles(target.files)
  target.value = ''
}

async function onDrop(e: DragEvent) {
  dragOver.value = false
  if (!e.dataTransfer) return
  const files = e.dataTransfer.files
  if (files && files.length > 0) await broadcastFiles(files)
}

function onDragOver(e: DragEvent) {
  if (!hasPeer.value) return
  e.preventDefault()
  dragOver.value = true
}

function onDragLeave() {
  dragOver.value = false
}

async function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  const files: File[] = []
  for (const item of Array.from(items)) {
    if (item.kind === 'file') {
      const f = item.getAsFile()
      if (f) files.push(f)
    }
  }
  if (files.length > 0) {
    e.preventDefault()
    await broadcastFiles(files)
  }
}
</script>

<template>
  <form
    class="relative flex items-center gap-1 rounded-md border bg-background px-2 py-1.5 transition-colors focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]"
    :class="dragOver ? 'border-primary border-dashed bg-primary/5' : ''"
    @submit.prevent="send"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <input
      ref="fileInput"
      type="file"
      multiple
      class="hidden"
      @change="onFileChange"
    >
    <Button
      type="button"
      variant="ghost"
      size="icon"
      class="shrink-0"
      :disabled="!hasPeer"
      :title="hasPeer ? '发送文件' : '等待设备连接'"
      @click="openFilePicker"
    >
      <Paperclip class="h-4 w-4" />
    </Button>
    <textarea
      v-model="text"
      rows="3"
      :placeholder="hasPeer ? '输入消息 / 拖入文件 / Ctrl+V 粘贴（Enter 发送，Shift+Enter 换行）' : '等待设备连接…'"
      :disabled="peers.entries.size === 0"
      class="min-h-[72px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
      @keydown.enter.exact.prevent="send"
      @paste="onPaste"
    />
    <Button type="submit" :disabled="!canSend" class="shrink-0">
      <Send class="h-4 w-4" />
      <span class="ml-1 hidden sm:inline">发送</span>
    </Button>

    <div
      v-if="dragOver"
      class="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-primary/5 text-sm font-medium text-primary"
    >
      松开发送到所有已连接设备
    </div>
  </form>
</template>
