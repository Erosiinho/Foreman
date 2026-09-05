import { describe, expect, it } from 'vitest';
import { controlChannel } from '../queue/control-bus';

describe('controlChannel', () => {
    it('matches the format server/src/queue/task.queue.ts publishes to', () => {
        expect(controlChannel('erosinho', 'demo')).toBe('control:erosinho/demo');
    });
});
