import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Registry, type ScheduleEntry } from '../src/core/registry';

let dir: string;
let file: string;
let reg: Registry;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ss-reg-'));
  file = join(dir, 'registry.json');
  reg = new Registry(file);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sample = (id: string): ScheduleEntry => ({
  id,
  label: `com.junepil.skill-scheduler.${id}`,
  skillName: 'wrap-up',
  skillSource: 'user',
  skillPath: '/tmp/SKILL.md',
  prompt: '/wrap-up',
  cron: '0 21 * * 1-5',
  plistPath: `/tmp/${id}.plist`,
  logPath: `/tmp/${id}.log`,
  createdAt: '2026-05-14T00:00:00Z',
});

describe('Registry', () => {
  test('list returns empty when file missing', async () => {
    expect(await reg.list()).toEqual([]);
  });

  test('add then list returns the entry', async () => {
    await reg.add(sample('a'));
    const all = await reg.list();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe('a');
  });

  test('duplicate id rejected', async () => {
    await reg.add(sample('a'));
    await expect(reg.add(sample('a'))).rejects.toThrow(/already/);
  });

  test('remove deletes the entry', async () => {
    await reg.add(sample('a'));
    await reg.add(sample('b'));
    await reg.remove('a');
    const all = await reg.list();
    expect(all.map((e) => e.id)).toEqual(['b']);
  });

  test('remove unknown id throws', async () => {
    await expect(reg.remove('nope')).rejects.toThrow(/not found/);
  });

  test('get returns entry or undefined', async () => {
    await reg.add(sample('a'));
    expect((await reg.get('a'))?.id).toBe('a');
    expect(await reg.get('nope')).toBeUndefined();
  });
});
