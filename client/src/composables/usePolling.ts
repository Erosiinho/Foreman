import { onMounted, onUnmounted, ref, type Ref } from 'vue';

interface PollingOptions {
    intervalMs?: number;
}

interface PollingHandle<T> {
    data: Ref<T | null>;
    error: Ref<string | null>;
    loading: Ref<boolean>;
    refresh: () => Promise<void>;
}

/** Real-time-ish status via polling — no websocket infra to run. Pauses while the tab is hidden. */
export function usePolling<T>(
    fetcher: () => Promise<T>,
    { intervalMs = 4000 }: PollingOptions = {},
): PollingHandle<T> {
    const data = ref<T | null>(null) as Ref<T | null>;
    const error = ref<string | null>(null);
    const loading = ref(true);
    let timer: ReturnType<typeof setInterval> | undefined;

    async function refresh(): Promise<void> {
        try {
            data.value = await fetcher();
            error.value = null;
        } catch (err) {
            error.value = err instanceof Error ? err.message : String(err);
        } finally {
            loading.value = false;
        }
    }

    function start(): void {
        if (timer) return;
        timer = setInterval(refresh, intervalMs);
    }

    function stop(): void {
        clearInterval(timer);
        timer = undefined;
    }

    function handleVisibility(): void {
        if (document.hidden) {
            stop();
        } else {
            refresh();
            start();
        }
    }

    onMounted(() => {
        refresh();
        start();
        document.addEventListener('visibilitychange', handleVisibility);
    });

    onUnmounted(() => {
        stop();
        document.removeEventListener('visibilitychange', handleVisibility);
    });

    return { data, error, loading, refresh };
}
