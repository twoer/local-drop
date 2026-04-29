<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

defineProps<{
  reasons: string[]
}>()
</script>

<template>
  <main class="flex min-h-screen items-center justify-center p-6">
    <div class="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
      <TriangleAlert class="mx-auto h-10 w-10 text-amber-500" />
      <h1 class="mt-4 text-2xl font-bold">无法运行</h1>
      <ul class="mt-4 space-y-2 text-sm text-muted-foreground">
        <li v-for="r in reasons" :key="r">• {{ r }}</li>
      </ul>
      <p class="mt-6 text-xs text-muted-foreground">
        请使用最新版 Chrome / Edge / Safari / Firefox，并通过 HTTPS 访问（localhost 除外）。
      </p>
    </div>
  </main>
</template>
