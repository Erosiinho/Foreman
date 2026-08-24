import { spawn } from 'node:child_process';

export interface ClaudeRunResult {
    sessionId?: string;
    summary: string;
}

export interface RunClaudeOptions {
    /** Continues a previously paused session instead of starting a fresh one (`claude --resume <id>`). */
    resumeSessionId?: string;
    /** Aborting kills the `claude` process — used for pause/cancel/timeout. */
    signal?: AbortSignal;
    /** Fired as soon as the session_id is known, well before the run finishes — needed to persist it on pause. */
    onSessionId?: (sessionId: string) => void;
    /** Extra environment variables (merged over process.env) — a project's `.foreman.json` `env` block. */
    env?: Record<string, string>;
}

interface StreamEvent {
    type?: string;
    session_id?: string;
    result?: unknown;
}

/** Parses one line of `claude --output-format stream-json` output. Returns undefined for a blank line. */
export function parseStreamLine(line: string): StreamEvent | undefined {
    const trimmed = line.trim();
    if (!trimmed) return undefined;
    return JSON.parse(trimmed) as StreamEvent;
}

export function summaryFromResultEvent(event: StreamEvent): string {
    if (event.result === undefined) return '';
    return typeof event.result === 'string' ? event.result : JSON.stringify(event.result);
}

/**
 * Runs Claude Code non-interactively. Uses `stream-json` rather than the simpler single-blob `json`
 * format so the session_id is known as soon as the run starts rather than only once it finishes — an
 * aborted run (pause/cancel/timeout) never reaches the final JSON blob, so this is the only way to
 * have something to resume from.
 */
export function runClaude(cwd: string, prompt: string, options: RunClaudeOptions = {}): Promise<ClaudeRunResult> {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
    if (options.resumeSessionId) args.push('--resume', options.resumeSessionId);

    return new Promise((resolve, reject) => {
        const env = options.env ? { ...process.env, ...options.env } : undefined;
        // stdin explicitly ignored (~ `< /dev/null`) — an unclosed pipe leaves `claude` waiting on
        // stdin it will never receive, which it treats as a fatal error after a few seconds.
        const child = spawn('claude', args, { cwd, signal: options.signal, env, stdio: ['ignore', 'pipe', 'pipe'] });

        let buffer = '';
        let sessionId: string | undefined;
        let result: ClaudeRunResult | undefined;
        let stderr = '';
        let settled = false;

        const settle = (fn: () => void) => {
            if (settled) return;
            settled = true;
            fn();
        };

        child.stdout.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf8');
            let newlineIndex: number;
            while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, newlineIndex);
                buffer = buffer.slice(newlineIndex + 1);
                let event: StreamEvent | undefined;
                try {
                    event = parseStreamLine(line);
                } catch {
                    continue; // ignore malformed/partial lines
                }
                if (!event) continue;
                if (event.session_id && !sessionId) {
                    sessionId = event.session_id;
                    options.onSessionId?.(sessionId);
                }
                if (event.type === 'result') {
                    result = { sessionId: event.session_id ?? sessionId, summary: summaryFromResultEvent(event) };
                }
            }
        });

        child.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf8');
        });

        child.on('error', (err) => settle(() => reject(err)));

        child.on('close', (code, signal) => {
            settle(() => {
                if (signal) {
                    reject(Object.assign(new Error(`claude was killed (${signal})`), { name: 'AbortError' }));
                } else if (code !== 0) {
                    reject(new Error(`claude exited with code ${code}${stderr ? `: ${stderr.slice(-2000)}` : ''}`));
                } else if (!result) {
                    reject(new Error('claude exited cleanly but produced no result event'));
                } else {
                    resolve(result);
                }
            });
        });
    });
}
