<script setup lang="ts">
import { ref } from 'vue';
import { getTaskDiff, ApiError } from '../api/client';
import type { ITaskDiff } from '../types';

const props = defineProps<{ owner: string; repo: string; number: number }>();

const open = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);
const diff = ref<ITaskDiff | null>(null);
const expanded = ref(new Set<string>());

async function toggle(): Promise<void> {
  open.value = !open.value;
  if (!open.value || diff.value || loading.value) return;

  loading.value = true;
  error.value = null;
  try {
    diff.value = await getTaskDiff(props.owner, props.repo, props.number);
  } catch (err) {
    error.value =
      err instanceof ApiError
        ? err.message
        : "Couldn't load the diff — try again.";
  } finally {
    loading.value = false;
  }
}

function toggleFile(filename: string): void {
  const next = new Set(expanded.value);
  if (next.has(filename)) next.delete(filename);
  else next.add(filename);
  expanded.value = next;
}

type LineKind = 'add' | 'del' | 'hunk' | 'context';

function lineKind(line: string): LineKind {
  if (line.startsWith('@@')) return 'hunk';
  if (line.startsWith('+') && !line.startsWith('+++')) return 'add';
  if (line.startsWith('-') && !line.startsWith('---')) return 'del';
  return 'context';
}

function patchLines(patch: string): { text: string; kind: LineKind }[] {
  return patch.split('\n').map((text) => ({ text, kind: lineKind(text) }));
}
</script>

<template>
  <div>
    <button
      type="button"
      class="font-mono text-[0.7rem] uppercase tracking-wider text-ink-dim underline decoration-dotted underline-offset-4 hover:text-accent"
      @click="toggle"
    >
      {{ open ? 'Hide diff' : 'View diff' }}
    </button>

    <div
      v-if="open"
      class="mt-2 overflow-hidden rounded-lg border border-border bg-bg"
    >
      <p v-if="loading" class="p-3 font-mono text-xs text-ink-dim">
        Loading diff…
      </p>
      <p v-else-if="error" class="p-3 font-mono text-xs text-status-failed">
        {{ error }}
      </p>

      <template v-else-if="diff">
        <div
          class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2"
        >
          <p class="font-mono text-xs">
            <span class="text-status-done">+{{ diff.additions }}</span>
            <span class="ml-1.5 text-status-failed"
              >&minus;{{ diff.deletions }}</span
            >
            <span class="ml-2 text-ink-dim"
              >in {{ diff.files.length }} file{{
                diff.files.length === 1 ? '' : 's'
              }}</span
            >
          </p>
          <a
            :href="diff.prUrl"
            target="_blank"
            rel="noreferrer"
            class="font-mono text-xs text-ink-dim underline decoration-dotted underline-offset-4 hover:text-accent"
          >
            PR #{{ diff.prNumber }} ↗
          </a>
        </div>

        <ul>
          <li
            v-for="file in diff.files"
            :key="file.filename"
            class="border-b border-border last:border-0"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-hover"
              @click="toggleFile(file.filename)"
            >
              <span class="truncate font-mono text-xs text-ink">{{
                file.filename
              }}</span>
              <span
                class="flex shrink-0 items-center gap-2 font-mono text-[0.65rem] tabular-nums"
              >
                <span class="text-status-done">+{{ file.additions }}</span>
                <span class="text-status-failed"
                  >&minus;{{ file.deletions }}</span
                >
              </span>
            </button>

            <pre
              v-if="expanded.has(file.filename) && file.patch"
              class="overflow-x-auto border-t border-border py-1 font-mono text-[0.7rem] leading-relaxed"
            ><span
                v-for="(line, i) in patchLines(file.patch)"
                :key="i"
                class="block px-3"
                :class="{
                  'bg-status-done/10 text-status-done': line.kind === 'add',
                  'bg-status-failed/10 text-status-failed': line.kind === 'del',
                  'text-accent': line.kind === 'hunk',
                  'text-ink-dim': line.kind === 'context',
                }"
              >{{ line.text || ' ' }}</span></pre>
            <p
              v-else-if="expanded.has(file.filename)"
              class="border-t border-border px-3 py-2 font-mono text-[0.7rem] text-ink-dim"
            >
              No preview available for this file.
            </p>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>
