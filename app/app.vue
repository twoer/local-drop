<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
</script>

<template>
  <VitePwaManifest />
  <NuxtPage />
  <Toaster position="top-right" rich-colors />
</template>
