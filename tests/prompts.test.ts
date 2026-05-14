import { describe, expect, test } from 'bun:test';
import { shouldQuit } from '../src/ui/prompts';

describe('shouldQuit', () => {
  test('returns true for lowercase q', () => {
    expect(shouldQuit({ name: 'q', sequence: 'q' })).toBe(true);
  });

  test('returns true for uppercase Q', () => {
    expect(shouldQuit({ name: 'Q', sequence: 'Q' })).toBe(true);
  });

  test('returns false for other letters', () => {
    expect(shouldQuit({ name: 'a', sequence: 'a' })).toBe(false);
    expect(shouldQuit({ name: 'return', sequence: '\r' })).toBe(false);
  });

  test('returns false for ctrl+q (modifier present)', () => {
    expect(shouldQuit({ name: 'q', sequence: '', ctrl: true })).toBe(false);
  });

  test('returns false when name is undefined', () => {
    expect(shouldQuit({ sequence: '' })).toBe(false);
  });
});
