<script setup lang="ts">
import { computed } from 'vue';
import { listProjects } from '../api/client';
import { usePolling } from '../composables/usePolling';
import ProjectCard from '../components/ProjectCard.vue';

const { data: projects, error, loading, refresh } = usePolling(listProjects);

const total = computed(() => projects.value?.length ?? 0);
</script>

<template>
  <div class="mx-auto max-w-6xl px-5 py-10">
    <div class="mb-8 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p class="font-mono text-xs uppercase tracking-[0.2em] text-accent">
          Projects
        </p>
        <h1
          class="font-display text-4xl sm:text-5xl font-bold uppercase text-heading"
        >
          Every repo on the clock
        </h1>
      </div>
      <p v-if="!loading && !error" class="font-mono text-xs text-ink-dim">
        {{ total }} tracked
      </p>
    </div>

    <div
      v-if="loading && !projects"
      class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      aria-hidden="true"
    >
      <div
        v-for="i in 6"
        :key="i"
        class="h-24 animate-pulse rounded-lg border border-border bg-surface"
      ></div>
    </div>

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
      v-else-if="total === 0"
      class="rounded-lg border border-dashed border-border-strong px-6 py-12 text-center"
    >
      <p class="font-display text-2xl uppercase text-heading">Board's empty</p>
      <p class="mt-2 font-mono text-sm text-ink-dim">
        Foreman can't see any repos with the token in
        <code class="text-ink">GITHUB_TOKEN</code>. Grant it access to a project
        and it'll show up here.
      </p>
    </div>

    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <ProjectCard
        v-for="project in projects"
        :key="project.fullName"
        :project="project"
      />
    </div>
  </div>
</template>
