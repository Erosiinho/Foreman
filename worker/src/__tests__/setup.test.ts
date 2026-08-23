import { describe, expect, it } from 'vitest';
import { runSetupCommand } from '../lib/setup';

describe('runSetupCommand', () => {
    it('resolves when the command exits 0', async () => {
        await expect(runSetupCommand('/tmp', 'true')).resolves.toBeUndefined();
    });

    it('rejects with captured output when the command exits non-zero', async () => {
        await expect(runSetupCommand('/tmp', 'echo boom && exit 1')).rejects.toThrow('boom');
    });

    it('rejects when aborted mid-run', async () => {
        const controller = new AbortController();
        const promise = runSetupCommand('/tmp', 'sleep 5', controller.signal);
        setTimeout(() => controller.abort(), 20);

        await expect(promise).rejects.toThrow();
    });
});
