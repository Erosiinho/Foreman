import { describe, expect, it } from 'vitest';
import { parseStreamLine, summaryFromResultEvent } from '../lib/claude';

describe('parseStreamLine', () => {
    it('parses a stream-json event', () => {
        expect(parseStreamLine('{"type":"system","session_id":"abc-123"}')).toEqual({
            type: 'system',
            session_id: 'abc-123',
        });
    });

    it('returns undefined for a blank line', () => {
        expect(parseStreamLine('   ')).toBeUndefined();
    });

    it('throws on malformed JSON so the caller can skip a truncated line', () => {
        expect(() => parseStreamLine('{"type":')).toThrow();
    });
});

describe('summaryFromResultEvent', () => {
    it('passes a string result through', () => {
        expect(summaryFromResultEvent({ result: 'Added the missing null check.' })).toBe(
            'Added the missing null check.',
        );
    });

    it('stringifies a non-string result', () => {
        expect(summaryFromResultEvent({ result: { ok: true } })).toBe('{"ok":true}');
    });

    it('defaults to an empty string when there is no result field', () => {
        expect(summaryFromResultEvent({})).toBe('');
    });
});
