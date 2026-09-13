<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ITask } from '../types';
import { pauseTask, resumeTask, cancelTask, ApiError } from '../api/client';
import { STATUS_META } from '../lib/status';
import StatusLamp from './StatusLamp.vue';
import TaskDiffPanel from './TaskDiffPanel.vue';

const props = defineProps<{ task: ITask }>();
const emit = defineEmits<{ changed: [] }>();

type Action = 'pause' | 'resume' | 'cancel';

const pending = ref<Action | null>(null);
const error = ref<string | null>(null);

const meta = computed(() => STATUS_META[props.task.status]);
const issueUrl = computed(
  () =>
    `https://github.com/${props.task.owner}/${props.task.repo}/issues/${props.task.number}`,
);
const canPause = computed(() => props.task.status === 'in-progress');
const canResume = computed(() => props.task.status === 'paused');
const canCancel = computed(() =>
  ['todo', 'in-progress', 'paused'].includes(props.task.status),
);
const updatedLabel = computed(() =>
  new Date(props.task.updatedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }),
);

async function run(action: Action, fn: () => Promise<void>): Promise<void> {
  pending.value = action;
  error.value = null;
  try {
    await fn();
    emit('changed');
  } catch (err) {
    error.value =
      err instanceof ApiError
        ? err.message
        : `Could not ${action} the task — try again.`;
  } finally {
    pending.value = null;
  }
}

const onPause = () =>
  run('pause', () =>
    pauseTask(props.task.owner, props.task.repo, props.task.number),
  );
const onResume = () =>
  run('resume', () =>
    resumeTask(props.task.owner, props.task.repo, props.task.number),
  );
const onCancel = () =>
  run('cancel', () =>
    cancelTask(props.task.owner, props.task.repo, props.task.number),
  );
</script>

<template>
  <li
    class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 pl-4 sm:flex-row sm:items-start sm:gap-4"
    :style="{ borderLeftColor: meta.color, borderLeftWidth: '3px' }"
  >
    <div class="min-w-0 flex-1">
      <div class="flex items-baseline gap-2">
        <span class="font-mono text-xs text-ink-dim">#{{ task.number }}</span>
        <h3 class="truncate font-sans text-sm font-medium text-heading">
          {{ task.title }}
        </h3>
      </div>
      <p class="mt-1 line-clamp-2 text-sm text-ink-dim">
        {{ task.description }}
      </p>
      <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <a
          :href="issueUrl"
          target="_blank"
          rel="noreferrer"
          class="font-mono text-[0.7rem] uppercase tracking-wider text-ink-dim underline decoration-dotted underline-offset-4 hover:text-accent"
        >
          View on GitHub ↗
        </a>
        <span class="font-mono text-[0.7rem] text-ink-dim">{{
          updatedLabel
        }}</span>
      </div>
      <p v-if="error" class="mt-2 font-mono text-xs text-status-failed">
        {{ error }}
      </p>
      <TaskDiffPanel
        v-if="task.status === 'done'"
        :owner="task.owner"
        :repo="task.repo"
        :number="task.number"
        class="mt-3"
      />
    </div>

    <div class="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
      <StatusLamp :status="task.status" />
      <div class="flex items-center gap-2">
        <button
          v-if="canPause"
          type="button"
          :disabled="pending !== null"
          class="rounded border border-border-strong px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-ink transition-colors hover:border-status-paused hover:text-status-paused disabled:cursor-not-allowed disabled:opacity-50"
          @click="onPause"
        >
          {{ pending === 'pause' ? '…' : 'Pause' }}
        </button>
        <button
          v-if="canResume"
          type="button"
          :disabled="pending !== null"
          class="rounded border border-border-strong px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-ink transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          @click="onResume"
        >
          {{ pending === 'resume' ? '…' : 'Resume' }}
        </button>
        <button
          v-if="canCancel"
          type="button"
          :disabled="pending !== null"
          class="rounded border border-border-strong px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-wider text-ink-dim transition-colors hover:border-status-failed hover:text-status-failed disabled:cursor-not-allowed disabled:opacity-50"
          @click="onCancel"
        >
          {{ pending === 'cancel' ? '…' : 'Cancel' }}
        </button>
      </div>
    </div>
  </li>
</template>
