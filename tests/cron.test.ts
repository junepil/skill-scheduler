import { describe, expect, test } from 'bun:test';
import { expandCron } from '../src/core/cron';

describe('expandCron', () => {
  test('weekday 21:00 → 5 dicts', () => {
    const r = expandCron('0 21 * * 1-5');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dicts).toHaveLength(5);
    expect(r.dicts[0]).toEqual({ Minute: 0, Hour: 21, Weekday: 1 });
    expect(r.dicts[4]).toEqual({ Minute: 0, Hour: 21, Weekday: 5 });
  });

  test('multi-hour list, wildcard DoW → 2 dicts with no DoW key', () => {
    const r = expandCron('30 9,18 * * *');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dicts).toHaveLength(2);
    expect(r.dicts[0]).toEqual({ Minute: 30, Hour: 9 });
    expect(r.dicts[1]).toEqual({ Minute: 30, Hour: 18 });
  });

  test('single weekday at single hour → 1 dict', () => {
    const r = expandCron('0 9 * * 1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dicts).toHaveLength(1);
    expect(r.dicts[0]).toEqual({ Minute: 0, Hour: 9, Weekday: 1 });
  });

  test('hour wildcard → rejected', () => {
    const r = expandCron('0 * * * *');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/hour/i);
  });

  test('DoM and DoW both specified → rejected', () => {
    const r = expandCron('0 9 1 * 1');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/both|day/i);
  });

  test('not 5 fields → rejected', () => {
    const r = expandCron('0 9 * *');
    expect(r.ok).toBe(false);
  });

  test('invalid syntax → rejected', () => {
    const r = expandCron('abc');
    expect(r.ok).toBe(false);
  });

  test('over 100 dicts → rejected', () => {
    const r = expandCron('0,15,30,45 9-18 * * 1-5');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/100|too many/i);
  });

  test('step in day-of-month → rejected', () => {
    const r = expandCron('0 9 */5 * *');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/dayOfMonth/);
  });

  test('step in day-of-week → rejected', () => {
    const r = expandCron('0 9 * * 1/2');
    expect(r.ok).toBe(false);
  });
});
