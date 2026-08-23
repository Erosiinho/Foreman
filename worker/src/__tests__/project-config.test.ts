import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readProjectConfig } from '../lib/project-config';

let dir: string;

beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'foreman-config-'));
});

afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('readProjectConfig', () => {
    it('returns an empty config when .foreman.json is missing', async () => {
        expect(await readProjectConfig(dir)).toEqual({});
    });

    it('parses setup, timeoutMinutes, and env', async () => {
        await writeFile(
            path.join(dir, '.foreman.json'),
            JSON.stringify({ setup: 'npm install', timeoutMinutes: 30, env: { NODE_ENV: 'test' } }),
        );

        expect(await readProjectConfig(dir)).toEqual({
            setup: 'npm install',
            timeoutMinutes: 30,
            env: { NODE_ENV: 'test' },
        });
    });

    it('rejects malformed JSON', async () => {
        await writeFile(path.join(dir, '.foreman.json'), '{ not json');

        await expect(readProjectConfig(dir)).rejects.toThrow('not valid JSON');
    });

    it('rejects a non-object top level', async () => {
        await writeFile(path.join(dir, '.foreman.json'), '[]');

        await expect(readProjectConfig(dir)).rejects.toThrow('must be a JSON object');
    });

    it('rejects a non-string setup field', async () => {
        await writeFile(path.join(dir, '.foreman.json'), JSON.stringify({ setup: 123 }));

        await expect(readProjectConfig(dir)).rejects.toThrow('"setup" must be a string');
    });

    it('rejects a non-numeric timeoutMinutes field', async () => {
        await writeFile(path.join(dir, '.foreman.json'), JSON.stringify({ timeoutMinutes: '30' }));

        await expect(readProjectConfig(dir)).rejects.toThrow('"timeoutMinutes" must be a number');
    });

    it('rejects a non-string env value', async () => {
        await writeFile(path.join(dir, '.foreman.json'), JSON.stringify({ env: { PORT: 3000 } }));

        await expect(readProjectConfig(dir)).rejects.toThrow('"env" values must all be strings');
    });
});
