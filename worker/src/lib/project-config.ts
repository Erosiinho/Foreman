import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ProjectConfig {
    /** Shell command run once before Claude Code starts (e.g. `npm install`). Skipped on resume. */
    setup?: string;
    /** Overrides RUN_TIMEOUT_MINUTES for this repo. */
    timeoutMinutes?: number;
    /** Extra environment variables passed to the `claude` process. */
    env?: Record<string, string>;
}

const CONFIG_FILENAME = '.foreman.json';

/**
 * Per-project settings live as a file committed in the project itself rather than in any
 * Foreman-side storage — consistent with the "no DB" principle: the config is versioned with the
 * code it configures, and editable via code-server like any other file, with no settings UI to
 * build.
 */
export async function readProjectConfig(cwd: string): Promise<ProjectConfig> {
    let raw: string;
    try {
        raw = await readFile(path.join(cwd, CONFIG_FILENAME), 'utf8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
        throw err;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(`${CONFIG_FILENAME} is not valid JSON`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`${CONFIG_FILENAME} must be a JSON object`);
    }

    const { setup, timeoutMinutes, env } = parsed as Record<string, unknown>;
    if (setup !== undefined && typeof setup !== 'string') {
        throw new Error(`${CONFIG_FILENAME}: "setup" must be a string`);
    }
    if (timeoutMinutes !== undefined && typeof timeoutMinutes !== 'number') {
        throw new Error(`${CONFIG_FILENAME}: "timeoutMinutes" must be a number`);
    }
    if (env !== undefined && (typeof env !== 'object' || env === null || Array.isArray(env))) {
        throw new Error(`${CONFIG_FILENAME}: "env" must be an object of strings`);
    }
    if (env && Object.values(env).some((value) => typeof value !== 'string')) {
        throw new Error(`${CONFIG_FILENAME}: "env" values must all be strings`);
    }

    return {
        setup: setup as string | undefined,
        timeoutMinutes: timeoutMinutes as number | undefined,
        env: env as Record<string, string> | undefined,
    };
}
