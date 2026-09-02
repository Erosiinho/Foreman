import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Runs `gh pr create` in the project's working copy — gh prints the PR URL to stdout on success. */
export async function createPullRequest(cwd: string, title: string, body: string): Promise<string> {
    const { stdout } = await execFileAsync('gh', ['pr', 'create', '--title', title, '--body', body], { cwd });
    return stdout.trim();
}
