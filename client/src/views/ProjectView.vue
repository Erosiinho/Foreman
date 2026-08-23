<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { listTasks } from '../api/client';
import { usePolling } from '../composables/usePolling';
import { STATUS_ORDER } from '../lib/status';
import type { ITask, TaskStatus } from '../types';
import TaskCreateForm from '../components/TaskCreateForm.vue';
import TaskRow from '../components/TaskRow.vue';

const props = defineProps<{ owner: string; repo: string }>();

const {
  data: tasks,
  error,
  loading,
  refresh,
} = usePolling(() => listTasks(props.owner, props.repo));

const HISTORY_STATUSES = new Set<TaskStatus>(['done', 'failed', 'cancelled']);

function byStatusThenNumber(a: ITask, b: ITask): number {
  const byStatus =
    STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  return byStatus !== 0 ? byStatus : b.number - a.number;
}

const activeTasks = computed(() =>
  (tasks.value ?? [])
    .filter((task) => !HISTORY_STATUSES.has(task.status))
    .sort(byStatusThenNumber),
);

const historyTasks = computed(() =>
  [...(tasks.value ?? [])]
    .filter((task) => HISTORY_STATUSES.has(task.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
);
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-10">
    <RouterLink
      to="/"
      class="font-mono text-xs uppercase tracking-wider text-ink-dim hover:text-accent"
    >
      ← All projects
    </RouterLink>

    <div class="mt-3 mb-8 flex flex-wrap items-start justify-between gap-4">
      <h1 class="font-mono text-2xl sm:text-3xl leading-tight break-all">
        <span class="text-ink-dim">{{ owner }}/</span
        ><span class="font-semibold text-heading">{{ repo }}</span>
      </h1>
      <TaskCreateForm :owner="owner" :repo="repo" @created="refresh" />
    </div>

    <ul v-if="loading && !tasks" class="flex flex-col gap-3" aria-hidden="true">
      <li
        v-for="i in 4"
        :key="i"
        class="h-20 animate-pulse rounded-lg border border-border bg-surface"
      ></li>
    </ul>

    <div
      v-else-if="error"
      class="rounded-lg border border-status-failed/40 bg-status-failed/5 px-5 py-4 text-status-failed"
    >
      <p class="font-medium">{{ error }}</p>
      <button
        type="button"
        class="mt-3 rounded border border-status-failed/40 px-3 py-1.5 font-mono text-xs uppercase tracking-wider transition-colors hover:bg-status-failed/10"
        @click="refresh"
      >
        Retry
      </button>
    </div>

    <div
      v-else-if="activeTasks.length === 0 && historyTasks.length === 0"
      class="rounded-lg border border-dashed border-border-strong px-6 py-12 text-center"
    >
      <p class="font-display text-2xl uppercase text-heading">
        No work orders yet
      </p>
      <p class="mt-2 font-mono text-sm text-ink-dim">
        Dispatch a task above and Claude Code picks it up automatically.
      </p>
    </div>

    <template v-else>
      <section v-if="activeTasks.length > 0">
        <h2
          class="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-dim"
        >
          Active
        </h2>
        <ul class="flex flex-col gap-3">
          <TaskRow
            v-for="task in activeTasks"
            :key="task.number"
            :task="task"
            @changed="refresh"
          />
        </ul>
      </section>

      <section
        v-if="historyTasks.length > 0"
        :class="{ 'mt-8': activeTasks.length > 0 }"
      >
        <h2
          class="mb-3 font-mono text-xs uppercase tracking-[0.2em] text-ink-dim"
        >
          History
        </h2>
        <ul class="flex flex-col gap-3">
          <TaskRow
            v-for="task in historyTasks"
            :key="task.number"
            :task="task"
            @changed="refresh"
          />
        </ul>
      </section>
    </template>
  </div>
</template>
