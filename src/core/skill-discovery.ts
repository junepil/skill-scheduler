import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

export type SkillSource = 'user' | 'plugin';

export type DiscoveredSkill = {
  name: string;
  description: string;
  source: SkillSource;
  skillPath: string; // path to SKILL.md
};

type Options = {
  userSkillsDir: string;
  pluginsCacheDir: string;
};

export async function discoverSkills(opts: Options): Promise<DiscoveredSkill[]> {
  const out: DiscoveredSkill[] = [];
  await collect(opts.userSkillsDir, 'user', 1, out);
  await collect(opts.pluginsCacheDir, 'plugin', 4, out);
  return out;
}

async function collect(
  root: string,
  source: SkillSource,
  maxDepth: number,
  out: DiscoveredSkill[],
): Promise<void> {
  if (!(await exists(root))) return;
  await walk(root, source, maxDepth, 0, out);
}

async function walk(
  dir: string,
  source: SkillSource,
  maxDepth: number,
  depth: number,
  out: DiscoveredSkill[],
): Promise<void> {
  if (depth > maxDepth + 5) return;
  const skillFile = join(dir, 'SKILL.md');
  if (await exists(skillFile)) {
    const skill = await parseSkill(skillFile, source);
    if (skill) out.push(skill);
    return;
  }
  if (depth >= maxDepth + 5) return;
  const entries = await safeReaddir(dir);
  for (const e of entries) {
    const full = join(dir, e.name);
    const s = await safeStat(full);
    if (s?.isDirectory()) {
      await walk(full, source, maxDepth, depth + 1, out);
    }
  }
}

async function parseSkill(
  path: string,
  source: SkillSource,
): Promise<DiscoveredSkill | null> {
  const text = await readFile(path, 'utf8');
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  let fm: Record<string, unknown>;
  try {
    fm = parseYaml(m[1]!) as Record<string, unknown>;
  } catch {
    return null;
  }
  const name = typeof fm.name === 'string' ? fm.name : null;
  if (!name) return null;
  const description = typeof fm.description === 'string' ? fm.description : '';
  return { name, description, source, skillPath: path };
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function safeReaddir(p: string) {
  try {
    return await readdir(p, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function safeStat(p: string) {
  try {
    return await stat(p); // stat (not lstat) follows symlinks
  } catch {
    return null;
  }
}
