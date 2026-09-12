<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header
      class="sticky top-0 z-10 border-b border-border bg-bg/85 backdrop-blur"
    >
      <div class="mx-auto max-w-6xl px-5 py-4 flex items-center gap-3">
        <RouterLink to="/" class="flex items-center gap-2.5 group">
          <span class="relative flex h-2.5 w-2.5">
            <span
              class="absolute inline-flex h-full w-full rounded-full bg-accent lamp-pulse text-accent"
            ></span>
          </span>
          <span
            class="font-display text-[1.7rem] leading-none font-bold uppercase tracking-tight text-heading group-hover:text-accent transition-colors"
          >
            Foreman
          </span>
        </RouterLink>
        <span
          class="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-ink-dim pt-1"
          >Dispatch board</span
        >
      </div>
    </header>

    <main class="flex-1">
      <RouterView />
    </main>

    <footer class="border-t border-border">
      <div
        class="mx-auto max-w-6xl px-5 py-4 font-mono text-[0.7rem] text-ink-dim"
      >
        Claude Code works the shift · you sign off on the pull request
      </div>
    </footer>
  </div>
</template>
