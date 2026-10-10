import { afterEach, describe, expect, it, vi } from 'vitest';
import { failure } from './failure';

const setOnline = (value: boolean) =>
  vi.stubGlobal('navigator', { onLine: value } as unknown as Navigator);

afterEach(() => vi.unstubAllGlobals());

describe('failure(): classification of backend errors', () => {
  // Rows are [code, expected reason]. The code decides whenever there is one.
  const withCode: [string, string, 'conflict' | 'rejected' | 'unknown'][] = [
    ['unique violation', '23505', 'conflict'],
    ['foreign key violation', '23503', 'rejected'],
    ['check violation', '23514', 'rejected'],
    ['not null violation', '23502', 'rejected'],
    ['invalid text representation', '22P02', 'rejected'],
    ['numeric out of range', '22003', 'rejected'],
    ['RLS refusal (insufficient privilege)', '42501', 'unknown'],
    ['PostgREST expired JWT (401)', 'PGRST301', 'unknown'],
    ['PostgREST no rows for single()', 'PGRST116', 'unknown'],
    ['serialization failure', '40001', 'unknown'],
    ['statement timeout', '57014', 'unknown'],
    ['connection failure', '08006', 'unknown'],
    ['too many requests', '429', 'unknown'],
    ['server error', '500', 'unknown'],
  ];
  it('a row-level security refusal is a refusal of the row, so it can be shown as failed', () => {
    setOnline(true);
    expect(
      failure({
        message: 'new row violates row-level security policy for table "sets"',
        code: '42501',
      }),
    ).toEqual({ status: 'error', reason: 'rejected' });
  });

  it('a plain permission denied stays unknown, as it can be a session being renewed', () => {
    setOnline(true);
    expect(failure({ message: 'permission denied for table sets', code: '42501' })).toEqual({
      status: 'error',
      reason: 'unknown',
    });
  });

  it.each(withCode)('%s (%s) is %s', (_label, code, reason) => {
    setOnline(true);
    expect(failure({ message: 'server text', code })).toEqual({ status: 'error', reason });
  });

  it.each(withCode)(
    '%s (%s) is the same when the browser says it is offline',
    (_l, code, reason) => {
      setOnline(false);
      expect(failure({ message: 'Failed to fetch', code })).toEqual({ status: 'error', reason });
    },
  );

  const withoutCode: [string, string, boolean, 'offline' | 'unknown'][] = [
    ['Chrome', 'Failed to fetch', true, 'offline'],
    ['Firefox', 'NetworkError when attempting to fetch resource.', true, 'offline'],
    ['Safari', 'Load failed', true, 'offline'],
    ['Safari, upper case', 'LOAD FAILED', true, 'offline'],
    ['unrelated text, browser online', 'boom', true, 'unknown'],
    ['unrelated text, browser offline', 'boom', false, 'offline'],
    ['empty message, browser online', '', true, 'unknown'],
    ['abort, browser online', 'AbortError: signal is aborted without reason', true, 'unknown'],
  ];
  it.each(withoutCode)('no code, %s: "%s" is %s', (_label, message, online, reason) => {
    setOnline(online);
    expect(failure({ message })).toEqual({ status: 'error', reason });
  });

  it('never passes the server text on', () => {
    setOnline(true);
    expect(JSON.stringify(failure({ message: 'secret detail', code: '23503' }))).not.toContain(
      'secret',
    );
  });

  it('treats an empty-string code like no code', () => {
    setOnline(true);
    expect(failure({ message: 'Failed to fetch', code: '' })).toEqual({
      status: 'error',
      reason: 'offline',
    });
  });
});
