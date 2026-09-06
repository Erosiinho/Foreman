import { spawn } from 'node:child_process';

/** Runs a project's `.foreman.json` `setup` command through the shell before Claude Code starts. */
export function runSetupCommand(cwd: string, command: string, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, { cwd, shell: true, signal });

        let output = '';
        child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
        child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));

        child.on('error', reject);
        child.on('close', (code, killSignal) => {
            if (killSignal) {
                reject(Object.assign(new Error(`setup command was killed (${killSignal})`), { name: 'AbortError' }));
            } else if (code !== 0) {
                reject(new Error(`setup command exited with code ${code}${output ? `:\n${output.slice(-2000)}` : ''}`));
            } else {
                resolve();
            }
        });
    });
}
