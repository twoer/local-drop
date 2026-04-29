<script setup lang="ts">
const messages = useMessagesStore()
const identity = useIdentityStore()

const list = computed(() => messages.list)

const scroller = ref<HTMLDivElement | null>(null)

watch(
  () => list.value.length,
  () => {
    nextTick(() => {
      const el = scroller.value
      if (el) el.scrollTop = el.scrollHeight
    })
  },
)

function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
</script>

<template>
  <div ref="scroller" class="flex-1 overflow-y-auto rounded-lg border bg-muted/30 p-4">
    <div v-if="list.length === 0" class="flex h-full items-center justify-center text-sm text-muted-foreground">
      还没有消息
    </div>
    <ul v-else class="space-y-3">
      <li
        v-for="m in list"
        :key="m.id"
        class="flex flex-col"
        :class="m.senderClientId === identity.clientId ? 'items-end' : 'items-start'"
      >
        <div class="mb-1 text-xs text-muted-foreground">
          {{ m.senderName }} · {{ fmtTime(m.timestamp) }}
        </div>
        <div
          v-if="m.kind === 'text'"
          class="max-w-[70%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words"
          :class="m.senderClientId === identity.clientId
            ? 'bg-primary text-primary-foreground'
            : 'bg-card border'"
        >
          {{ m.text }}
        </div>
        <FileBubble
          v-else
          :record="m"
          :is-self="m.senderClientId === identity.clientId"
        />
      </li>
    </ul>
  </div>
</template>
