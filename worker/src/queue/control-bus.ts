import Redis from 'ioredis';

export interface ControlMessage {
    action: 'pause' | 'cancel';
    issueNumber: number;
}

export function controlChannel(owner: string, repo: string): string {
    return `control:${owner}/${repo}`;
}

export type Unsubscribe = () => void;

/**
 * Redis pub/sub client for the pause/cancel channel. The worker subscribes in parallel of whatever
 * job is running for that project — this keeps the worker's connection to Redis strictly outbound
 * (no inbound endpoint), consistent with the "standalone worker" principle.
 */
export default class ControlBus {
    private subscriber: Redis;
    private handlers = new Map<string, Set<(message: ControlMessage) => void>>();

    constructor(redisUrl: string) {
        this.subscriber = new Redis(redisUrl);
        this.subscriber.on('message', (channel: string, raw: string) => {
            const handlers = this.handlers.get(channel);
            if (!handlers || handlers.size === 0) return;
            let message: ControlMessage;
            try {
                message = JSON.parse(raw);
            } catch {
                return;
            }
            for (const handler of handlers) handler(message);
        });
    }

    subscribe(owner: string, repo: string, handler: (message: ControlMessage) => void): Unsubscribe {
        const channel = controlChannel(owner, repo);
        if (!this.handlers.has(channel)) {
            this.handlers.set(channel, new Set());
            this.subscriber.subscribe(channel).catch((err) => console.error('[control-bus] subscribe failed:', err));
        }
        this.handlers.get(channel)!.add(handler);

        return () => {
            const handlers = this.handlers.get(channel);
            handlers?.delete(handler);
            if (handlers && handlers.size === 0) {
                this.handlers.delete(channel);
                this.subscriber.unsubscribe(channel).catch(() => undefined);
            }
        };
    }

    async close(): Promise<void> {
        await this.subscriber.quit();
    }
}
