<script setup lang="ts">
import { CheckCircle2, AlertTriangle, Download, FileText, X } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { MessageRecord } from '~/composables/useIndexedDB'
import { isRenderable } from '~~/shared/utils/mime'

const props = defineProps<{
  record: MessageRecord
  isSelf: boolean
}>()

const blobUrl = ref<string | null>(null)
const blobName = ref('')
const previewOpen = ref(false)

const renderableKind = computed(() => isRenderable(props.record.fileMime ?? ''))

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

function revokeUrl() {
  if (blobUrl.value) {
    URL.revokeObjectURL(blobUrl.value)
    blobUrl.value = null
  }
}

async function loadBlob(fileId: string | undefined) {
  revokeUrl()
  if (!fileId) return
  try {
    const f = await useDB().files.get(fileId)
    if (f) {
      blobUrl.value = URL.createObjectURL(f.blob)
      blobName.value = f.name
    }
  }
  catch (e) {
    console.error('load file blob failed', e)
  }
}

watch(() => props.record.fileId, loadBlob, { immediate: true })

onBeforeUnmount(() => {
  revokeUrl()
  window.removeEventListener('keydown', onKeydown)
})

function download() {
  if (!blobUrl.value) return
  const a = document.createElement('a')
  a.href = blobUrl.value
  a.download = props.record.fileName ?? blobName.value
  document.body.appendChild(a)
  a.click()
  a.remove()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') previewOpen.value = false
}

function openPreview() {
  if (!blobUrl.value) return
  previewOpen.value = true
}

watch(previewOpen, (v) => {
  if (v) window.addEventListener('keydown', onKeydown)
  else window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="max-w-[70%] relative">
    <!-- 校验状态徽标 -->
    <div
      v-if="record.fileVerified === true"
      class="absolute -top-1 -right-1 z-10 rounded-full bg-emerald-500 p-0.5"
      title="文件完整性已验证"
    >
      <CheckCircle2 class="h-3.5 w-3.5 text-white" />
    </div>
    <div
      v-else-if="record.fileVerified === false"
      class="absolute -top-1 -right-1 z-10 rounded-full bg-red-500 p-0.5"
      title="文件校验失败，内容可能已损坏"
    >
      <AlertTriangle class="h-3.5 w-3.5 text-white" />
    </div>

    <!-- 图片 -->
    <button
      v-if="renderableKind === 'image' && blobUrl"
      type="button"
      class="block overflow-hidden rounded-lg border bg-card"
      title="点击预览"
      @click="openPreview"
    >
      <img
        :src="blobUrl"
        :alt="record.fileName"
        class="max-h-64 max-w-full object-contain"
      >
    </button>
    <!-- 视频 -->
    <video
      v-else-if="renderableKind === 'video' && blobUrl"
      :src="blobUrl"
      controls
      class="max-h-64 max-w-full rounded-lg border bg-card"
    />
    <!-- 音频 -->
    <audio
      v-else-if="renderableKind === 'audio' && blobUrl"
      :src="blobUrl"
      controls
      class="rounded-lg border bg-card"
    />
    <!-- 其他文件 / 加载中 -->
    <div
      v-else
      class="flex items-center gap-3 rounded-lg border bg-card p-3"
      :class="isSelf ? '' : ''"
    >
      <FileText class="h-8 w-8 shrink-0 text-muted-foreground" />
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium">{{ record.fileName }}</div>
        <div class="text-xs text-muted-foreground">
          {{ record.fileSize ? fmtSize(record.fileSize) : '—' }}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        :disabled="!blobUrl"
        :title="blobUrl ? '下载' : '加载中'"
        @click="download"
      >
        <Download class="h-4 w-4" />
      </Button>
    </div>

    <!-- 图片预览 modal -->
    <Teleport to="body">
      <div
        v-if="previewOpen && blobUrl"
        class="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm"
        @click.self="previewOpen = false"
      >
        <div class="flex items-center gap-2 px-4 py-3 text-white">
          <div class="min-w-0 flex-1 truncate text-sm">{{ record.fileName }}</div>
          <Button
            variant="ghost"
            size="icon"
            class="text-white hover:bg-white/10 hover:text-white"
            title="下载"
            @click="download"
          >
            <Download class="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="text-white hover:bg-white/10 hover:text-white"
            title="关闭"
            @click="previewOpen = false"
          >
            <X class="h-4 w-4" />
          </Button>
        </div>
        <div
          class="flex flex-1 items-center justify-center overflow-auto p-4"
          @click.self="previewOpen = false"
        >
          <img
            :src="blobUrl"
            :alt="record.fileName"
            class="max-h-full max-w-full object-contain"
          >
        </div>
      </div>
    </Teleport>
  </div>
</template>
