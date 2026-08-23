<script setup lang="ts">
import { computed } from 'vue';
import type { TaskStatus } from '../types';
import { STATUS_META } from '../lib/status';

const props = withDefaults(
  defineProps<{
    status: TaskStatus;
    showLabel?: boolean;
  }>(),
  { showLabel: true },
);

const meta = computed(() => STATUS_META[props.status]);
</script>

<template>
  <span class="inline-flex items-center gap-2" :style="{ color: meta.color }">
    <span
      class="inline-block h-2 w-2 shrink-0 rounded-full lamp-glow"
      :class="{ 'lamp-pulse': meta.pulse }"
      :style="{ background: meta.color }"
      aria-hidden="true"
    ></span>
    <span v-if="showLabel" class="font-mono text-xs uppercase tracking-wider">{{
      meta.label
    }}</span>
  </span>
</template>
