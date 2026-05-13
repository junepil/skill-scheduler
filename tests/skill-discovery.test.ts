import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverSkills } from '../src/core/skill-discovery';

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ss-test-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function writeSkill(dir: string, name: string, desc: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${desc}\n---\n\nbody\n`,
  );
}

describe('discoverSkills', () => {
  test('finds user and plugin skills', async () => {
    const user = join(root, 'skills');
    const plug = join(root, 'plugins', 'cache', 'mp', 'plug', '1.0', 'skills');
    await writeSkill(join(user, 'alpha'), 'alpha', 'first');
    await writeSkill(join(plug, 'beta'), 'beta', 'second');

    const skills = await discoverSkills({
      userSkillsDir: user,
      pluginsCacheDir: join(root, 'plugins', 'cache'),
    });

    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(['alpha', 'beta']);
    expect(skills.find((s) => s.name === 'alpha')?.source).toBe('user');
    expect(skills.find((s) => s.name === 'beta')?.source).toBe('plugin');
  });

  test('follows symlinks', async () => {
    const real = join(root, 'real-skill');
    await writeSkill(real, 'wrap-up', 'daily retro');
    const user = join(root, 'skills');
    await mkdir(user, { recursive: true });
    await symlink(real, join(user, 'wrap-up'));

    const skills = await discoverSkills({
      userSkillsDir: user,
      pluginsCacheDir: join(root, 'plugins', 'cache'),
    });
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('wrap-up');
  });

  test('ignores directories without SKILL.md', async () => {
    const user = join(root, 'skills');
    await mkdir(join(user, 'empty'), { recursive: true });
    await writeSkill(join(user, 'alpha'), 'alpha', 'x');

    const skills = await discoverSkills({
      userSkillsDir: user,
      pluginsCacheDir: join(root, 'plugins', 'cache'),
    });
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('alpha');
  });

  test('skips SKILL.md without name in frontmatter', async () => {
    const user = join(root, 'skills', 'bad');
    await mkdir(user, { recursive: true });
    await writeFile(join(user, 'SKILL.md'), '---\ndescription: no name\n---\n');
    const skills = await discoverSkills({
      userSkillsDir: join(root, 'skills'),
      pluginsCacheDir: join(root, 'plugins', 'cache'),
    });
    expect(skills).toHaveLength(0);
  });
});
