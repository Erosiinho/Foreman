/**
 * Duplicated in server/src/types/IRunTaskJob.ts — server and worker are independent deployables
 * with no shared package, so the BullMQ job contract is kept in sync by hand.
 */
export default interface IRunTaskJob {
    owner: string;
    repo: string;
    issueNumber: number;
    title: string;
    description: string;
    /** Set when this run continues a paused Claude Code session (`claude --resume <id>`) rather than starting fresh. */
    resumeSessionId?: string;
}
