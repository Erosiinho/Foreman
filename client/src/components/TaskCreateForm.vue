<script setup lang="ts">
import { ref } from 'vue';
import { createTask, ApiError } from '../api/client';
import type { ITask } from '../types';

const props = defineProps<{ owner: string; repo: string }>();
const emit = defineEmits<{ created: [task: ITask] }>();

const open = ref(false);
const title = ref('');
const description = ref('');
const submitting = ref(false);
const error = ref<string | null>(null);
const titleInput = ref<HTMLInputElement | null>(null);

function openForm(): void {
  open.value = true;
  requestAnimationFrame(() => titleInput.value?.focus());
}

function closeForm(): void {
  open.value = false;
  title.value = '';
  description.value = '';
  error.value = null;
}

async function submit(): Promise<void> {
  if (!title.value.trim() || !description.value.trim()) {
    error.value = 'A work order needs both a title and instructions.';
    return;
  }
  submitting.value = true;
  error.value = null;
  try {
    const task = await createTask(
      props.owner,
      props.repo,
      title.value.trim(),
      description.value.trim(),
    );
    emit('created', task);
    closeForm();
  } catch (err) {
    error.value =
      err instanceof ApiError
        ? err.message
        : 'Could not create the task — try again.';
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div>
    <button
      v-if="!open"
      type="button"
      class="rounded border border-accent/50 bg-accent/10 px-4 py-2 font-mono text-xs uppercase tracking-wider text-accent transition-colors hover:bg-accent/20"
      @click="openForm"
    >
      + New task
    </button>

    <form
      v-else
      class="rounded-lg border border-accent/40 bg-surface p-5"
      @submit.prevent="submit"
    >
      <p class="font-mono text-xs uppercase tracking-widest text-accent">
        New work order
      </p>

      <label class="mt-4 block">
        <span class="font-mono text-xs text-ink-dim">Title</span>
        <input
          ref="titleInput"
          v-model="title"
          type="text"
          maxlength="200"
          placeholder="Fix the flaky pagination test"
          class="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm text-ink placeholder-ink-dim/70 outline-none focus:border-accent"
        />
      </label>

      <label class="mt-3 block">
        <span class="font-mono text-xs text-ink-dim"
          >Instructions for Claude Code</span
        >
        <textarea
          v-model="description"
          rows="4"
          placeholder="Describe what needs to change and any constraints to respect."
          class="mt-1 w-full resize-y rounded border border-border bg-bg px-3 py-2 text-sm text-ink placeholder-ink-dim/70 outline-none focus:border-accent"
        ></textarea>
      </label>

      <p v-if="error" class="mt-3 font-mono text-xs text-status-failed">
        {{ error }}
      </p>

      <div class="mt-4 flex items-center gap-2">
        <button
          type="submit"
          :disabled="submitting"
          class="rounded bg-accent px-4 py-2 font-mono text-xs uppercase tracking-wider text-accent-ink transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {{ submitting ? 'Dispatching…' : 'Dispatch task' }}
        </button>
        <button
          type="button"
          class="rounded px-3 py-2 font-mono text-xs uppercase tracking-wider text-ink-dim transition-colors hover:text-ink"
          @click="closeForm"
        >
          Cancel
        </button>
      </div>
    </form>
  </div>
</template>
