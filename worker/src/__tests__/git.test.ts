import { describe, expect, it } from 'vitest';
import { branchName, slugify } from '../lib/git';

describe('slugify', () => {
    it('lowercases and hyphenates', () => {
        expect(slugify('Fix the Login Bug!')).toBe('fix-the-login-bug');
    });

    it('falls back to "task" for a title with no alphanumerics', () => {
        expect(slugify('!!!')).toBe('task');
    });
});

describe('branchName', () => {
    it('prefixes with task/<issueNumber>-<slug>', () => {
        expect(branchName(42, 'Fix the Login Bug')).toBe('task/42-fix-the-login-bug');
    });
});
