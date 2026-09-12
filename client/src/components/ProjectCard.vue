<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { IProject } from '../types';
import { STATUS_META, STATUS_ORDER } from '../lib/status';

const props = defineProps<{ project: IProject }>();

const activeCounts = computed(() =>
  STATUS_ORDER.map((status) => ({
    status,
    count: props.project.taskCounts[status],
  })).filter((s) => s.count > 0),
);
</script>

<template>
  <RouterLink
    :to="{
      name: 'project',
      params: { owner: project.owner, repo: project.repo },
    }"
    class="group block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong hover:bg-surface-hover"
  >
    <div class="flex items-start justify-between gap-3">
      <p class="font-mono text-[0.95rem] leading-tight break-all">
        <span class="text-ink-dim">{{ project.owner }}/</span
        ><span class="text-heading font-medium">{{ project.repo }}</span>
      </p>
      <span
        v-if="project.private"
        class="shrink-0 rounded border border-border-strong px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-ink-dim"
      >
        Private
      </span>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <p
        v-if="activeCounts.length === 0"
        class="font-mono text-xs text-ink-dim"
      >
        No tasks yet
      </p>
      <span
        v-for="{ status, count } in activeCounts"
        :key="status"
        class="inline-flex items-center gap-1.5"
        :style="{ color: STATUS_META[status].color }"
      >
        <span
          class="inline-block h-1.5 w-1.5 rounded-full lamp-glow"
          :class="{ 'lamp-pulse': STATUS_META[status].pulse }"
          :style="{ background: STATUS_META[status].color }"
          aria-hidden="true"
        ></span>
        <span class="font-mono text-xs tabular-nums">{{ count }}</span>
      </span>
    </div>
  </RouterLink>
</template>
