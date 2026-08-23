import { Router, raw } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import asyncController from '../controllers/controller';
import { UnauthorizedError, BadRequestError } from '../errors';
import { ITaskQueue } from '../../queue/task.queue';

const TRIGGERING_ACTIONS = new Set(['opened', 'labeled']);
const TRIGGERING_LABEL = 'todo';

interface GithubIssuesPayload {
    action: string;
    issue: { number: number; title: string; body: string | null; labels: { name: string }[] };
    repository: { name: string; owner: { login: string } };
}

function verifySignature(secret: string, payload: Buffer, signatureHeader: string | undefined): boolean {
    if (!signatureHeader) return false;
    const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
    const expectedBuffer = Buffer.from(expected);
    const actualBuffer = Buffer.from(signatureHeader);
    if (expectedBuffer.length !== actualBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, actualBuffer);
}

export default function githubWebhookRoutes(taskQueue: ITaskQueue, webhookSecret: string): Router {
    const router = Router();

    router.post(
        '/',
        raw({ type: 'application/json' }),
        asyncController(async (req, res) => {
            const rawBody = req.body as Buffer;
            if (!verifySignature(webhookSecret, rawBody, req.header('x-hub-signature-256'))) {
                throw new UnauthorizedError('Invalid webhook signature');
            }

            let payload: GithubIssuesPayload;
            try {
                payload = JSON.parse(rawBody.toString('utf8'));
            } catch {
                throw new BadRequestError('Invalid JSON payload');
            }

            if (
                req.header('x-github-event') === 'issues' &&
                TRIGGERING_ACTIONS.has(payload.action) &&
                payload.issue.labels.some((label) => label.name === TRIGGERING_LABEL)
            ) {
                await taskQueue.enqueueRun({
                    owner: payload.repository.owner.login,
                    repo: payload.repository.name,
                    issueNumber: payload.issue.number,
                    title: payload.issue.title,
                    description: payload.issue.body ?? '',
                });
            }

            res.status(204).send();
        }),
    );

    return router;
}
