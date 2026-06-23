<script setup lang="ts">
import { Construction } from '@lucide/vue'

defineProps<{ title?: string }>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-24 text-center">
    <div class="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <Construction class="size-8" />
    </div>
    <h2 class="mt-4 text-2xl font-semibold tracking-tight">{{ title ?? '模块' }}</h2>
    <p class="mt-2 text-sm text-muted-foreground">该模块正在开发中，本小姐马上就把它做出来～</p>
  </div>
</template>
