import { describe, expect, test } from 'bun:test';
import { paginate } from '../src/ui/pagination';

describe('paginate', () => {
  const rows = Array.from({ length: 23 }, (_, i) => i);

  test('first page returns first 10 rows', () => {
    const r = paginate(rows, 0, 10);
    expect(r.slice).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(r.totalPages).toBe(3);
    expect(r.hasPrev).toBe(false);
    expect(r.hasNext).toBe(true);
  });

  test('middle page returns next 10 rows', () => {
    const r = paginate(rows, 1, 10);
    expect(r.slice).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    expect(r.hasPrev).toBe(true);
    expect(r.hasNext).toBe(true);
  });

  test('last page returns remainder', () => {
    const r = paginate(rows, 2, 10);
    expect(r.slice).toEqual([20, 21, 22]);
    expect(r.hasPrev).toBe(true);
    expect(r.hasNext).toBe(false);
  });

  test('totalPages for exact multiple', () => {
    const r = paginate(Array.from({ length: 20 }, (_, i) => i), 0, 10);
    expect(r.totalPages).toBe(2);
  });

  test('empty input returns one empty page', () => {
    const r = paginate<number>([], 0, 10);
    expect(r.slice).toEqual([]);
    expect(r.totalPages).toBe(1);
    expect(r.hasPrev).toBe(false);
    expect(r.hasNext).toBe(false);
  });
});
