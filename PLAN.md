# skill-scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `~/.claude` 의 user/plugin 스킬을 표준 cron 표현식으로 macOS launchd 에 등록·관리하는 CLI 도구 구축.

**Architecture:** Bun + TypeScript 가 관리 CLI(add/list/remove/run)를 담당하고, 모든 launchd job 은 동일한 bash 헤드리스 래퍼 하나를 호출하며 plist 의 EnvironmentVariables 로 스킬별 prompt/log/label 주입. 상태는 `~/.config/skill-scheduler/registry.json` 에 저장.

**Tech Stack:** Bun 1.3+, TypeScript 5+, `@clack/prompts`, `yaml`, `cron-parser`, `cronstrue`, `cli-table3`, `picocolors`, `bun:test`, bash

---

## File Map

| Path | Purpose |
|---|---|
| `package.json` | bun project + bin entry |
| `tsconfig.json` | TS config (strict, bundler) |
| `.gitignore` | node_modules, .DS_Store |
| `README.md` | install + quickstart + commands |
| `src/cli.ts` | argv dispatcher |
| `src/commands/add.ts` | 인터랙티브 등록 |
| `src/commands/list.ts` | 등록 표 출력 |
| `src/commands/remove.ts` | 등록 제거 |
| `src/commands/run.ts` | 수동 즉시 실행 |
| `src/core/skill-discovery.ts` | SKILL.md 스캔 + frontmatter |
| `src/core/cron.ts` | cron → launchd dict 변환 |
| `src/core/plist.ts` | plist XML 생성 |
| `src/core/registry.ts` | registry.json CRUD |
| `src/core/launchctl.ts` | launchctl/plutil shell wrapper |
| `src/core/paths.ts` | 표준 경로 상수 |
| `src/ui/prompts.ts` | clack 래퍼 |
| `src/ui/table.ts` | list 표 포맷터 |
| `src/headless-runner.sh` | launchd 가 호출하는 bash |
| `tests/cron.test.ts` | unit |
| `tests/plist.test.ts` | unit (+ snapshot) |
| `tests/skill-discovery.test.ts` | fs unit |
| `tests/registry.test.ts` | fs unit |

---

## Task 1: 프로젝트 스캐폴드 + README 초안

**Files:** Create `package.json`, `tsconfig.json`, `.gitignore`, `README.md`, `src/.gitkeep`

- [ ] **Step 1.1: package.json 작성**

```json
{
  "name": "skill-scheduler",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "skill-scheduler": "./src/cli.ts"
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@clack/prompts": "^0.7.0",
    "cli-table3": "^0.6.5",
    "cron-parser": "^4.9.0",
    "cronstrue": "^2.50.0",
    "picocolors": "^1.0.1",
    "yaml": "^2.5.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 1.2: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "lib": ["ESNext"],
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 1.3: .gitignore**

```
node_modules/
.DS_Store
bun.lockb
*.log
```

- [ ] **Step 1.4: README.md (초안, Task 14 에서 최종화)**

```markdown
# skill-scheduler

Register any Claude Code skill (user or plugin) to run on a cron schedule via macOS launchd.

## Requirements

- macOS
- `claude` CLI installed at `~/.local/bin/claude`
- Bun 1.x
- macOS notification permission for Script Editor / osascript

## Install

```bash
git clone https://github.com/junepil-lee/skill-scheduler ~/projects/skill-scheduler
cd ~/projects/skill-scheduler
bun install
bun link
skill-scheduler --version
```

## Quickstart

Register `/wrap-up` to run weekdays at 21:00:

```bash
skill-scheduler add
# Select: wrap-up
# Arguments: (empty)
# Cron: 0 21 * * 1-5
# Confirm: yes
```

(나머지 섹션은 Task 14 에서 채움)
```

- [ ] **Step 1.5: bun install**

Run:
```bash
cd ~/projects/skill-scheduler && bun install
```
Expected: `node_modules/` 생성, lockfile 생성.

- [ ] **Step 1.6: TS 컴파일 가능 확인**

Run:
```bash
cd ~/projects/skill-scheduler && bun run typecheck
```
Expected: 에러 없음 (아직 src 비어있음).

- [ ] **Step 1.7: 커밋**

```bash
cd ~/projects/skill-scheduler
git add package.json tsconfig.json .gitignore README.md
git commit -m "chore: scaffold bun + ts project with deps and README skeleton"
```

---

## Task 2: 경로 상수 모듈

**Files:** Create `src/core/paths.ts`

- [ ] **Step 2.1: paths.ts 작성**

```typescript
// src/core/paths.ts
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();

export const PATHS = {
  registryDir: join(HOME, '.config', 'skill-scheduler'),
  registryFile: join(HOME, '.config', 'skill-scheduler', 'registry.json'),
  launchAgents: join(HOME, 'Library', 'LaunchAgents'),
  logsDir: join(HOME, '.claude', 'logs', 'skill-scheduler'),
  claudeUserSkills: join(HOME, '.claude', 'skills'),
  claudePluginsCache: join(HOME, '.claude', 'plugins', 'cache'),
  claudeCli: join(HOME, '.local', 'bin', 'claude'),
} as const;

export const LABEL_PREFIX = 'com.junepil.skill-scheduler';

export function plistPathForId(id: string): string {
  return join(PATHS.launchAgents, `${LABEL_PREFIX}.${id}.plist`);
}

export function logPathForId(id: string): string {
  return join(PATHS.logsDir, `${id}.log`);
}

export function labelForId(id: string): string {
  return `${LABEL_PREFIX}.${id}`;
}
```

- [ ] **Step 2.2: typecheck**

Run:
```bash
cd ~/projects/skill-scheduler && bun run typecheck
```
Expected: 에러 없음.

- [ ] **Step 2.3: 커밋**

```bash
git add src/core/paths.ts
git commit -m "feat(core): add path/label constants"
```

---

## Task 3: cron expander — 테스트 우선

**Files:** Create `tests/cron.test.ts`, `src/core/cron.ts`

- [ ] **Step 3.1: 테스트 작성**

`tests/cron.test.ts`:
```typescript
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
    // minute 0-59 (60) × hour 0-23 (24) wildcard 거부니까 다른 방법.
    // Use DoW 1-5 (5) × minute 0,15,30,45 (4) × hour 9-18 (10) = 200
    const r = expandCron('0,15,30,45 9-18 * * 1-5');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/100|too many/i);
  });
});
```

- [ ] **Step 3.2: 테스트 실행 (FAIL 확인)**

Run:
```bash
cd ~/projects/skill-scheduler && bun test tests/cron.test.ts
```
Expected: FAIL with "Cannot find module '../src/core/cron'".

- [ ] **Step 3.3: cron.ts 구현**

`src/core/cron.ts`:
```typescript
import parser from 'cron-parser';

export type LaunchdDict = {
  Minute?: number;
  Hour?: number;
  Day?: number;
  Month?: number;
  Weekday?: number;
};

export type CronExpansion =
  | { ok: true; dicts: LaunchdDict[] }
  | { ok: false; error: string };

const FIELD_BOUNDS = [
  { name: 'minute', min: 0, max: 59, key: 'Minute' as const, allowWildcard: false },
  { name: 'hour', min: 0, max: 23, key: 'Hour' as const, allowWildcard: false },
  { name: 'dayOfMonth', min: 1, max: 31, key: 'Day' as const, allowWildcard: true },
  { name: 'month', min: 1, max: 12, key: 'Month' as const, allowWildcard: true },
  { name: 'dayOfWeek', min: 0, max: 6, key: 'Weekday' as const, allowWildcard: true },
];

const MAX_DICTS = 100;

export function expandCron(expression: string): CronExpansion {
  const trimmed = expression.trim();
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 5) {
    return { ok: false, error: 'cron expression must have exactly 5 fields' };
  }

  try {
    parser.parseExpression(trimmed);
  } catch (e) {
    return { ok: false, error: `invalid cron: ${(e as Error).message}` };
  }

  const expanded: (number[] | null)[] = [];
  for (let i = 0; i < 5; i++) {
    const f = fields[i]!;
    const bound = FIELD_BOUNDS[i]!;
    if (f === '*') {
      if (!bound.allowWildcard) {
        return { ok: false, error: `wildcard not allowed in ${bound.name}` };
      }
      expanded.push(null);
    } else {
      const values = expandField(f, bound.min, bound.max);
      if (!values) {
        return { ok: false, error: `unsupported expression in ${bound.name}: ${f}` };
      }
      expanded.push(values);
    }
  }

  if (expanded[2] !== null && expanded[4] !== null) {
    return { ok: false, error: 'specifying both day-of-month and day-of-week is not allowed' };
  }

  const dicts = cartesian(expanded);
  if (dicts.length > MAX_DICTS) {
    return { ok: false, error: `expands to ${dicts.length} dicts, too many (max ${MAX_DICTS})` };
  }
  return { ok: true, dicts };
}

function expandField(field: string, min: number, max: number): number[] | null {
  const parts = field.split(',');
  const out = new Set<number>();
  for (const p of parts) {
    const m = p.match(/^(\d+)(?:-(\d+))?(?:\/(\d+))?$/);
    if (!m) return null;
    const start = Number(m[1]);
    const end = m[2] !== undefined ? Number(m[2]) : start;
    const step = m[3] !== undefined ? Number(m[3]) : 1;
    if (start < min || end > max || start > end || step < 1) return null;
    for (let v = start; v <= end; v += step) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

function cartesian(fields: (number[] | null)[]): LaunchdDict[] {
  let out: LaunchdDict[] = [{}];
  for (let i = 0; i < 5; i++) {
    const f = fields[i]!;
    const bound = FIELD_BOUNDS[i]!;
    if (f === null) continue;
    const next: LaunchdDict[] = [];
    for (const acc of out) {
      for (const v of f) {
        next.push({ ...acc, [bound.key]: v });
      }
    }
    out = next;
  }
  return out;
}
```

- [ ] **Step 3.4: 테스트 PASS 확인**

Run:
```bash
cd ~/projects/skill-scheduler && bun test tests/cron.test.ts
```
Expected: 8 pass.

- [ ] **Step 3.5: 커밋**

```bash
git add src/core/cron.ts tests/cron.test.ts
git commit -m "feat(core): cron expander with 5-field validation and 100-dict limit"
```

---

## Task 4: plist serializer — snapshot 테스트

**Files:** Create `tests/plist.test.ts`, `src/core/plist.ts`

- [ ] **Step 4.1: 테스트 작성**

`tests/plist.test.ts`:
```typescript
import { describe, expect, test } from 'bun:test';
import { serializePlist } from '../src/core/plist';

describe('serializePlist', () => {
  test('weekday 21:00 wrap-up plist matches expected', () => {
    const xml = serializePlist({
      label: 'com.junepil.skill-scheduler.wrap-up',
      programPath: '/Users/junepil.lee/projects/skill-scheduler/src/headless-runner.sh',
      env: {
        SS_PROMPT: '/wrap-up',
        SS_LOG: '/Users/junepil.lee/.claude/logs/skill-scheduler/wrap-up.log',
        SS_LABEL: 'com.junepil.skill-scheduler.wrap-up',
      },
      logPath: '/Users/junepil.lee/.claude/logs/skill-scheduler/wrap-up.log',
      calendarIntervals: [
        { Minute: 0, Hour: 21, Weekday: 1 },
        { Minute: 0, Hour: 21, Weekday: 2 },
        { Minute: 0, Hour: 21, Weekday: 3 },
        { Minute: 0, Hour: 21, Weekday: 4 },
        { Minute: 0, Hour: 21, Weekday: 5 },
      ],
    });

    expect(xml).toContain('<key>Label</key>');
    expect(xml).toContain('<string>com.junepil.skill-scheduler.wrap-up</string>');
    expect(xml).toContain('<key>StartCalendarInterval</key>');
    expect(xml).toContain('<key>Weekday</key><integer>1</integer>');
    expect(xml).toContain('<key>Weekday</key><integer>5</integer>');
    expect(xml).toContain('<key>SS_PROMPT</key>');
    expect(xml).toContain('<string>/wrap-up</string>');
    expect(xml).toContain('<key>RunAtLoad</key>');
    expect(xml).toContain('<false/>');
  });

  test('omits wildcard fields', () => {
    const xml = serializePlist({
      label: 'l',
      programPath: '/p',
      env: { SS_PROMPT: '/x', SS_LOG: '/log', SS_LABEL: 'l' },
      logPath: '/log',
      calendarIntervals: [{ Minute: 30, Hour: 9 }],
    });
    expect(xml).not.toContain('Weekday');
    expect(xml).not.toContain('Day');
    expect(xml).not.toContain('Month');
  });
});
```

- [ ] **Step 4.2: 테스트 실행 (FAIL)**

Run:
```bash
cd ~/projects/skill-scheduler && bun test tests/plist.test.ts
```
Expected: FAIL with module not found.

- [ ] **Step 4.3: plist.ts 구현**

`src/core/plist.ts`:
```typescript
import type { LaunchdDict } from './cron';

export type PlistInput = {
  label: string;
  programPath: string;
  env: Record<string, string>;
  logPath: string;
  calendarIntervals: LaunchdDict[];
};

export function serializePlist(input: PlistInput): string {
  const envEntries = Object.entries(input.env)
    .map(([k, v]) => `        <key>${escape(k)}</key>\n        <string>${escape(v)}</string>`)
    .join('\n');

  const intervals = input.calendarIntervals
    .map((d) => {
      const lines = [
        '        <dict>',
        ...orderedKeys(d).map(
          (k) => `            <key>${k}</key><integer>${d[k]}</integer>`,
        ),
        '        </dict>',
      ];
      return lines.join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${escape(input.label)}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${escape(input.programPath)}</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
${envEntries}
    </dict>

    <key>StartCalendarInterval</key>
    <array>
${intervals}
    </array>

    <key>RunAtLoad</key>
    <false/>

    <key>StandardOutPath</key>
    <string>${escape(input.logPath)}</string>

    <key>StandardErrorPath</key>
    <string>${escape(input.logPath)}</string>
</dict>
</plist>
`;
}

const KEY_ORDER: Array<keyof LaunchdDict> = ['Minute', 'Hour', 'Day', 'Month', 'Weekday'];

function orderedKeys(d: LaunchdDict): Array<keyof LaunchdDict> {
  return KEY_ORDER.filter((k) => d[k] !== undefined);
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
```

- [ ] **Step 4.4: 테스트 PASS**

Run:
```bash
cd ~/projects/skill-scheduler && bun test tests/plist.test.ts
```
Expected: 2 pass.

- [ ] **Step 4.5: 커밋**

```bash
git add src/core/plist.ts tests/plist.test.ts
git commit -m "feat(core): plist XML serializer with env injection"
```

---

## Task 5: skill discovery — fs 단위 테스트

**Files:** Create `tests/skill-discovery.test.ts`, `src/core/skill-discovery.ts`

- [ ] **Step 5.1: 테스트 작성**

`tests/skill-discovery.test.ts`:
```typescript
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
```

- [ ] **Step 5.2: 테스트 실행 (FAIL)**

Run:
```bash
cd ~/projects/skill-scheduler && bun test tests/skill-discovery.test.ts
```
Expected: FAIL with module not found.

- [ ] **Step 5.3: skill-discovery.ts 구현**

`src/core/skill-discovery.ts`:
```typescript
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
  if (depth > maxDepth + 5) return; // safety
  const skillFile = join(dir, 'SKILL.md');
  if (await exists(skillFile)) {
    const skill = await parseSkill(skillFile, source);
    if (skill) out.push(skill);
    return; // 한 디렉토리에 SKILL.md 가 있으면 더 깊이 들어가지 않음
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
```

- [ ] **Step 5.4: 테스트 PASS**

Run:
```bash
cd ~/projects/skill-scheduler && bun test tests/skill-discovery.test.ts
```
Expected: 4 pass.

- [ ] **Step 5.5: 커밋**

```bash
git add src/core/skill-discovery.ts tests/skill-discovery.test.ts
git commit -m "feat(core): skill discovery for user and plugin sources"
```

---

## Task 6: registry CRUD — fs 단위 테스트

**Files:** Create `tests/registry.test.ts`, `src/core/registry.ts`

- [ ] **Step 6.1: 테스트 작성**

`tests/registry.test.ts`:
```typescript
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
```

- [ ] **Step 6.2: 테스트 실행 (FAIL)**

Run:
```bash
cd ~/projects/skill-scheduler && bun test tests/registry.test.ts
```
Expected: FAIL.

- [ ] **Step 6.3: registry.ts 구현**

`src/core/registry.ts`:
```typescript
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ScheduleEntry = {
  id: string;
  label: string;
  skillName: string;
  skillSource: 'user' | 'plugin';
  skillPath: string;
  prompt: string;
  cron: string;
  plistPath: string;
  logPath: string;
  createdAt: string;
};

type RegistryData = { version: 1; schedules: ScheduleEntry[] };

export class Registry {
  constructor(private path: string) {}

  async list(): Promise<ScheduleEntry[]> {
    const data = await this.load();
    return data.schedules;
  }

  async get(id: string): Promise<ScheduleEntry | undefined> {
    const data = await this.load();
    return data.schedules.find((e) => e.id === id);
  }

  async add(entry: ScheduleEntry): Promise<void> {
    const data = await this.load();
    if (data.schedules.some((e) => e.id === entry.id)) {
      throw new Error(`id '${entry.id}' already exists in registry`);
    }
    data.schedules.push(entry);
    await this.save(data);
  }

  async remove(id: string): Promise<void> {
    const data = await this.load();
    const idx = data.schedules.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error(`id '${id}' not found in registry`);
    data.schedules.splice(idx, 1);
    await this.save(data);
  }

  private async load(): Promise<RegistryData> {
    try {
      const text = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(text) as RegistryData;
      if (parsed.version !== 1) throw new Error('unsupported registry version');
      return parsed;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, schedules: [] };
      }
      throw e;
    }
  }

  private async save(data: RegistryData): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(data, null, 2) + '\n');
  }
}
```

- [ ] **Step 6.4: 테스트 PASS**

Run:
```bash
cd ~/projects/skill-scheduler && bun test tests/registry.test.ts
```
Expected: 6 pass.

- [ ] **Step 6.5: 커밋**

```bash
git add src/core/registry.ts tests/registry.test.ts
git commit -m "feat(core): registry CRUD with id uniqueness"
```

---

## Task 7: launchctl wrapper

**Files:** Create `src/core/launchctl.ts`

(통합 테스트는 수동. 여기서는 단순 wrapper 만 작성하고 타입 체크로 검증.)

- [ ] **Step 7.1: launchctl.ts 작성**

```typescript
import { $ } from 'bun';

export async function plutilLint(plistPath: string): Promise<void> {
  const result = await $`plutil -lint ${plistPath}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`plutil -lint failed: ${result.stderr.toString().trim()}`);
  }
}

export async function load(plistPath: string): Promise<void> {
  const result = await $`launchctl load -w ${plistPath}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`launchctl load failed: ${result.stderr.toString().trim()}`);
  }
}

export async function unload(plistPath: string): Promise<void> {
  const result = await $`launchctl unload -w ${plistPath}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`launchctl unload failed: ${result.stderr.toString().trim()}`);
  }
}

export async function start(label: string): Promise<void> {
  const result = await $`launchctl start ${label}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`launchctl start failed: ${result.stderr.toString().trim()}`);
  }
}

export async function loadedLabels(): Promise<Set<string>> {
  const result = await $`launchctl list`.quiet().nothrow();
  if (result.exitCode !== 0) return new Set();
  const labels = new Set<string>();
  for (const line of result.stdout.toString().split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (cols.length >= 3 && cols[2]) labels.add(cols[2]);
  }
  return labels;
}
```

- [ ] **Step 7.2: typecheck**

Run:
```bash
cd ~/projects/skill-scheduler && bun run typecheck
```
Expected: 에러 없음.

- [ ] **Step 7.3: 커밋**

```bash
git add src/core/launchctl.ts
git commit -m "feat(core): launchctl/plutil wrappers"
```

---

## Task 8: headless-runner.sh

**Files:** Create `src/headless-runner.sh`

- [ ] **Step 8.1: 스크립트 작성**

`src/headless-runner.sh`:
```bash
#!/bin/bash
# Invoked by launchd. Reads SS_PROMPT/SS_LOG/SS_LABEL from environment.
set -u

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

CLAUDE_BIN="$HOME/.local/bin/claude"
LOG="${SS_LOG:?SS_LOG required}"
PROMPT="${SS_PROMPT:?SS_PROMPT required}"
LABEL="${SS_LABEL:-skill-scheduler}"

mkdir -p "$(dirname "$LOG")"

TS="$(date '+%Y-%m-%d %H:%M:%S')"
echo "[$TS] $LABEL start prompt=$PROMPT" >> "$LOG"

"$CLAUDE_BIN" -p "$PROMPT" --dangerously-skip-permissions >> "$LOG" 2>&1
RC=$?

END_TS="$(date '+%Y-%m-%d %H:%M:%S')"
echo "[$END_TS] $LABEL end exit=$RC" >> "$LOG"

if [ "$RC" -eq 0 ]; then
  osascript -e "display notification \"$PROMPT 완료\" with title \"$LABEL\""
else
  osascript -e "display notification \"$LOG 확인\" with title \"$LABEL 실패\""
fi

exit "$RC"
```

- [ ] **Step 8.2: 실행 권한 + 환경 변수 없이 호출 → 거부 확인**

Run:
```bash
chmod +x ~/projects/skill-scheduler/src/headless-runner.sh
~/projects/skill-scheduler/src/headless-runner.sh; echo "exit=$?"
```
Expected: `SS_LOG: required` 에러 메시지 + non-zero exit.

- [ ] **Step 8.3: 환경 변수 주입 후 호출 → 정상 종료**

Run:
```bash
SS_PROMPT="/wrap-up" SS_LOG="/tmp/ss-test.log" SS_LABEL="test" ~/projects/skill-scheduler/src/headless-runner.sh; echo "exit=$?"
tail -3 /tmp/ss-test.log
```
Expected: start/end 라인 + exit=0 (또는 wrap-up 결과).

- [ ] **Step 8.4: 커밋**

```bash
git add src/headless-runner.sh
git commit -m "feat: bash headless runner reading SS_PROMPT/SS_LOG/SS_LABEL env"
```

---

## Task 9: UI primitives (clack 래퍼 + 표 포맷터)

**Files:** Create `src/ui/prompts.ts`, `src/ui/table.ts`

- [ ] **Step 9.1: prompts.ts**

```typescript
import * as clack from '@clack/prompts';
import pc from 'picocolors';

export function intro(text: string): void {
  clack.intro(pc.bgCyan(pc.black(` ${text} `)));
}

export function outro(text: string): void {
  clack.outro(text);
}

export async function selectSkill<T>(
  items: Array<{ label: string; hint?: string; value: T }>,
): Promise<T | null> {
  const result = await clack.select({
    message: 'Select skill',
    options: items.map((i) => ({ value: i.value, label: i.label, hint: i.hint })),
  });
  if (clack.isCancel(result)) return null;
  return result as T;
}

export async function text(
  message: string,
  placeholder?: string,
): Promise<string | null> {
  const result = await clack.text({ message, placeholder });
  if (clack.isCancel(result)) return null;
  return result as string;
}

export async function confirm(message: string): Promise<boolean> {
  const result = await clack.confirm({ message });
  if (clack.isCancel(result)) return false;
  return result as boolean;
}

export function note(label: string, body: string): void {
  clack.note(body, label);
}

export function cancel(reason: string): never {
  clack.cancel(reason);
  process.exit(1);
}
```

- [ ] **Step 9.2: table.ts**

```typescript
import Table from 'cli-table3';
import pc from 'picocolors';

export type Row = {
  id: string;
  skill: string;
  cron: string;
  nextRun: string;
  loaded: boolean;
};

export function renderScheduleTable(rows: Row[]): string {
  const table = new Table({
    head: ['ID', 'SKILL', 'CRON', 'NEXT RUN', 'LOADED'],
    style: { head: ['dim'] },
    chars: {
      top: '', 'top-mid': '', 'top-left': '', 'top-right': '',
      bottom: '', 'bottom-mid': '', 'bottom-left': '', 'bottom-right': '',
      left: '', 'left-mid': '', mid: '─', 'mid-mid': '',
      right: '', 'right-mid': '', middle: '  ',
    },
  });

  for (const r of rows) {
    table.push([
      r.id,
      r.skill,
      r.cron,
      r.nextRun,
      r.loaded ? pc.green('●') : pc.dim('○'),
    ]);
  }
  return table.toString();
}
```

- [ ] **Step 9.3: typecheck**

Run:
```bash
cd ~/projects/skill-scheduler && bun run typecheck
```
Expected: 에러 없음.

- [ ] **Step 9.4: 커밋**

```bash
git add src/ui/prompts.ts src/ui/table.ts
git commit -m "feat(ui): clack prompt wrapper and schedule table renderer"
```

---

## Task 10: `add` command

**Files:** Create `src/commands/add.ts`

- [ ] **Step 10.1: add.ts 작성**

```typescript
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import parser from 'cron-parser';
import cronstrue from 'cronstrue';
import { expandCron } from '../core/cron';
import { Registry, type ScheduleEntry } from '../core/registry';
import { discoverSkills } from '../core/skill-discovery';
import { serializePlist } from '../core/plist';
import * as launchctl from '../core/launchctl';
import {
  PATHS,
  labelForId,
  logPathForId,
  plistPathForId,
} from '../core/paths';
import { intro, outro, note, selectSkill, text, confirm, cancel } from '../ui/prompts';

export async function runAdd(): Promise<void> {
  intro('skill-scheduler  add');

  const skills = await discoverSkills({
    userSkillsDir: PATHS.claudeUserSkills,
    pluginsCacheDir: PATHS.claudePluginsCache,
  });
  if (skills.length === 0) cancel('No skills found');

  const skill = await selectSkill(
    skills.map((s) => ({
      label: `${s.name}`,
      hint: `${s.source} · ${s.description.slice(0, 60)}`,
      value: s,
    })),
  );
  if (!skill) cancel('Cancelled');

  const args = await text('Skill arguments (optional)', 'empty for none');
  if (args === null) cancel('Cancelled');

  const cronExpr = await text('Cron expression', '0 21 * * 1-5');
  if (!cronExpr) cancel('Cancelled');

  const exp = expandCron(cronExpr);
  if (!exp.ok) cancel(`Invalid cron: ${exp.error}`);

  const registry = new Registry(PATHS.registryFile);
  let id = slugify(skill.name);
  const existing = await registry.list();
  const usedIds = new Set(existing.map((e) => e.id));
  while (usedIds.has(id)) {
    const next = await text(`ID '${id}' already used. New id suffix?`);
    if (!next) cancel('Cancelled');
    id = slugify(`${skill.name}-${next}`);
  }

  const prompt = args.trim()
    ? `/${skill.name} ${args.trim()}`
    : `/${skill.name}`;
  const label = labelForId(id);
  const plistPath = plistPathForId(id);
  const logPath = logPathForId(id);
  const programPath = join(import.meta.dir, '..', 'headless-runner.sh');
  const nextRun = parser.parseExpression(cronExpr).next().toDate().toISOString();

  note(
    'Preview',
    [
      `label   ${label}`,
      `prompt  ${prompt}`,
      `cron    ${cronExpr}  →  ${cronstrue.toString(cronExpr)}`,
      `plist   ${plistPath}`,
      `next    ${nextRun}`,
    ].join('\n'),
  );

  const ok = await confirm('Register?');
  if (!ok) cancel('Cancelled');

  const xml = serializePlist({
    label,
    programPath,
    env: { SS_PROMPT: prompt, SS_LOG: logPath, SS_LABEL: label },
    logPath,
    calendarIntervals: exp.dicts,
  });

  await mkdir(PATHS.launchAgents, { recursive: true });
  await mkdir(PATHS.logsDir, { recursive: true });
  await writeFile(plistPath, xml);
  await launchctl.plutilLint(plistPath);
  await launchctl.load(plistPath);

  const entry: ScheduleEntry = {
    id,
    label,
    skillName: skill.name,
    skillSource: skill.source,
    skillPath: skill.skillPath,
    prompt,
    cron: cronExpr,
    plistPath,
    logPath,
    createdAt: new Date().toISOString(),
  };
  await registry.add(entry);

  outro(`Registered. Next run: ${nextRun}`);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 10.2: typecheck**

Run: `bun run typecheck` — 에러 없음.

- [ ] **Step 10.3: 커밋**

```bash
git add src/commands/add.ts
git commit -m "feat(cmd): add — interactive skill registration"
```

---

## Task 11: `list` command

**Files:** Create `src/commands/list.ts`

- [ ] **Step 11.1: list.ts**

```typescript
import parser from 'cron-parser';
import { Registry } from '../core/registry';
import { PATHS } from '../core/paths';
import * as launchctl from '../core/launchctl';
import { renderScheduleTable, type Row } from '../ui/table';
import { intro, outro } from '../ui/prompts';

export async function runList(): Promise<void> {
  intro('skill-scheduler  list');
  const registry = new Registry(PATHS.registryFile);
  const entries = await registry.list();
  const loaded = await launchctl.loadedLabels();

  const rows: Row[] = entries.map((e) => ({
    id: e.id,
    skill: e.skillName,
    cron: e.cron,
    nextRun: nextRunString(e.cron),
    loaded: loaded.has(e.label),
  }));

  if (rows.length === 0) {
    outro('No schedules. Run `skill-scheduler add` to create one.');
    return;
  }

  console.log(renderScheduleTable(rows));
  const loadedCount = rows.filter((r) => r.loaded).length;
  outro(`${rows.length} schedules · ${loadedCount} loaded`);
}

function nextRunString(expr: string): string {
  try {
    const d = parser.parseExpression(expr).next().toDate();
    return d.toISOString().replace('T', ' ').slice(0, 16);
  } catch {
    return '—';
  }
}
```

- [ ] **Step 11.2: typecheck + 커밋**

```bash
cd ~/projects/skill-scheduler && bun run typecheck
git add src/commands/list.ts
git commit -m "feat(cmd): list — render schedule table with load state"
```

---

## Task 12: `remove` command

**Files:** Create `src/commands/remove.ts`

- [ ] **Step 12.1: remove.ts**

```typescript
import { rm } from 'node:fs/promises';
import { Registry } from '../core/registry';
import { PATHS } from '../core/paths';
import * as launchctl from '../core/launchctl';
import { intro, outro, selectSkill, confirm, cancel } from '../ui/prompts';

export async function runRemove(idArg?: string): Promise<void> {
  intro('skill-scheduler  remove');
  const registry = new Registry(PATHS.registryFile);
  const entries = await registry.list();
  if (entries.length === 0) cancel('No schedules to remove');

  let id = idArg;
  if (!id) {
    const picked = await selectSkill(
      entries.map((e) => ({ label: e.id, hint: e.cron, value: e.id })),
    );
    if (!picked) cancel('Cancelled');
    id = picked;
  }

  const entry = await registry.get(id!);
  if (!entry) cancel(`Schedule '${id}' not found`);

  const ok = await confirm(`Remove ${entry!.id}?`);
  if (!ok) cancel('Cancelled');

  try {
    await launchctl.unload(entry!.plistPath);
  } catch (e) {
    console.error(`unload warning: ${(e as Error).message}`);
  }
  await rm(entry!.plistPath, { force: true });
  await registry.remove(entry!.id);

  outro('Removed.');
}
```

- [ ] **Step 12.2: typecheck + 커밋**

```bash
cd ~/projects/skill-scheduler && bun run typecheck
git add src/commands/remove.ts
git commit -m "feat(cmd): remove — unload, delete plist, update registry"
```

---

## Task 13: `run` command

**Files:** Create `src/commands/run.ts`

- [ ] **Step 13.1: run.ts**

```typescript
import { Registry } from '../core/registry';
import { PATHS } from '../core/paths';
import * as launchctl from '../core/launchctl';
import { intro, outro, cancel } from '../ui/prompts';

export async function runRun(idArg: string | undefined): Promise<void> {
  intro('skill-scheduler  run');
  if (!idArg) cancel('id required');
  const registry = new Registry(PATHS.registryFile);
  const entry = await registry.get(idArg!);
  if (!entry) cancel(`Schedule '${idArg}' not found`);

  await launchctl.start(entry!.label);
  outro(`Started ${entry!.label}. Logs: ${entry!.logPath}`);
}
```

- [ ] **Step 13.2: 커밋**

```bash
cd ~/projects/skill-scheduler && bun run typecheck
git add src/commands/run.ts
git commit -m "feat(cmd): run — trigger schedule via launchctl start"
```

---

## Task 14: CLI 진입점 + 링크

**Files:** Create `src/cli.ts`

- [ ] **Step 14.1: cli.ts**

```typescript
#!/usr/bin/env bun
import { runAdd } from './commands/add';
import { runList } from './commands/list';
import { runRemove } from './commands/remove';
import { runRun } from './commands/run';

const VERSION = '0.1.0';

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case 'add':
      await runAdd();
      return;
    case 'list':
      await runList();
      return;
    case 'remove':
      await runRemove(rest[0]);
      return;
    case 'run':
      await runRun(rest[0]);
      return;
    case '--version':
    case '-v':
      console.log(VERSION);
      return;
    case undefined:
    case '--help':
    case '-h':
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`skill-scheduler v${VERSION}

Usage:
  skill-scheduler add               Register a new schedule (interactive)
  skill-scheduler list              Show all schedules
  skill-scheduler remove [id]       Remove a schedule
  skill-scheduler run <id>          Trigger a schedule now
  skill-scheduler --version         Print version

Files this tool touches:
  ~/.config/skill-scheduler/registry.json
  ~/Library/LaunchAgents/com.junepil.skill-scheduler.*.plist
  ~/.claude/logs/skill-scheduler/<id>.log
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 14.2: 실행 권한 + bun link**

Run:
```bash
chmod +x ~/projects/skill-scheduler/src/cli.ts
cd ~/projects/skill-scheduler && bun link
skill-scheduler --version
```
Expected: `0.1.0`

만약 `bun link` 가 PATH에 안 잡히면 `~/.bun/bin` 이 PATH 에 있는지 확인.

- [ ] **Step 14.3: --help 출력 확인**

Run: `skill-scheduler --help`
Expected: 명령 목록 출력.

- [ ] **Step 14.4: 커밋**

```bash
git add src/cli.ts
git commit -m "feat: cli entry point with command dispatch and help"
```

---

## Task 15: README 최종화

**Files:** Modify `README.md` (전체 교체)

- [ ] **Step 15.1: README.md 작성**

```markdown
# skill-scheduler

Register any Claude Code skill (user or plugin) under a cron schedule. Built on macOS launchd.

## Why

Generalizes the [wrap-up scheduler](https://github.com/junepil-lee/wrap-up) pattern so any
skill can be put on a schedule with one command instead of hand-rolling plist files.

## Requirements

- macOS
- `claude` CLI at `~/.local/bin/claude`
- Bun 1.x
- Notification permission for `osascript` (System Settings → Notifications)

## Install

```bash
git clone https://github.com/junepil-lee/skill-scheduler ~/projects/skill-scheduler
cd ~/projects/skill-scheduler
bun install
bun link
skill-scheduler --version
```

If `skill-scheduler` is not found on PATH, ensure `~/.bun/bin` is in your shell rc.

## Quickstart

Register `/wrap-up` to run weekdays at 21:00:

```bash
skill-scheduler add
```

```
┌  skill-scheduler  add
│
◇  Select skill
│  ● wrap-up
│
◇  Skill arguments (optional)
│
│
◇  Cron expression
│  0 21 * * 1-5
│
◇  Confirm? yes
│
└  Registered. Next run: Thu 2026-05-14 21:00
```

## Commands

| Command | What |
|---|---|
| `skill-scheduler add` | Interactive registration |
| `skill-scheduler list` | Show all schedules with load state |
| `skill-scheduler remove [id]` | Remove (interactive or by id) |
| `skill-scheduler run <id>` | Trigger immediately |

## Cron Support

| Field | Allowed | Rejected |
|---|---|---|
| Minute | value, list, range, step | `*` |
| Hour | value, list, range, step | `*` |
| Day of month | value, list, range, `*` | step |
| Month | value, list, range, `*` | step |
| Day of week | value, list, range, `*` | step |

Both day-of-month and day-of-week cannot be set together. Expressions expanding to more
than 100 launchd intervals are rejected.

## Files

| Path | Purpose |
|---|---|
| `~/.config/skill-scheduler/registry.json` | Schedule metadata |
| `~/Library/LaunchAgents/com.junepil.skill-scheduler.*.plist` | One per schedule |
| `~/.claude/logs/skill-scheduler/<id>.log` | Per-schedule log |

## Removal

Remove a single schedule:
```bash
skill-scheduler remove <id>
```

Remove the tool entirely:
```bash
# Unload all schedules
for f in ~/Library/LaunchAgents/com.junepil.skill-scheduler.*.plist; do
  launchctl unload -w "$f" 2>/dev/null
  rm "$f"
done
rm -rf ~/.config/skill-scheduler ~/.claude/logs/skill-scheduler
bun unlink   # in repo root
```

## Troubleshooting

| Symptom | Check |
|---|---|
| No notifications | System Settings → Notifications → Script Editor 권한 |
| `exit=127` in log | `~/.local/bin/claude` 가 존재하고 실행 가능한지 |
| Schedule runs but no Confluence update | MCP 인증 만료. 수동으로 한 번 `claude` 실행해서 재인증 |
| `launchctl load` 실패 | `plutil -lint ~/Library/LaunchAgents/<plist>` 로 문법 확인 |

## License

MIT
```

- [ ] **Step 15.2: README 렌더 확인 (선택)**

Run: `cat ~/projects/skill-scheduler/README.md | head -30`
Expected: 가독성 OK.

- [ ] **Step 15.3: 커밋**

```bash
git add README.md
git commit -m "docs: finalize README with install, quickstart, commands, troubleshooting"
```

---

## Task 16: 통합 스모크 테스트

**Files:** 없음. 실제 환경 검증만.

- [ ] **Step 16.1: 모든 단위 테스트 PASS 확인**

Run:
```bash
cd ~/projects/skill-scheduler && bun test
```
Expected: cron 8 + plist 2 + skill-discovery 4 + registry 6 = 20 pass.

- [ ] **Step 16.2: 테스트 스케줄 등록 (90 초 후 실행되도록)**

Run `skill-scheduler add`:
- Select: 임의의 가벼운 스킬 (예: refute)
- Arguments: (비움)
- Cron: 현재 시각 + 2 분의 `M H * * *` 형식 (예: 현재 14:30 이면 `32 14 * * *`)
- Confirm yes

Expected: `Registered. Next run: ...` 출력.

- [ ] **Step 16.3: T1 plutil -lint**

Run: `plutil -lint ~/Library/LaunchAgents/com.junepil.skill-scheduler.<id>.plist`
Expected: `OK`.

- [ ] **Step 16.4: T4 calendar interval 검증**

Run: `launchctl print "gui/$(id -u)/com.junepil.skill-scheduler.<id>" | grep -A 10 calendar`
Expected: dict 항목 표시.

- [ ] **Step 16.5: T3 수동 실행으로 동작 확인**

Run:
```bash
skill-scheduler run <id>
sleep 30
tail -10 ~/.claude/logs/skill-scheduler/<id>.log
```
Expected: start/end 라인 + exit=0 + 알림 표시.

- [ ] **Step 16.6: list 출력 확인**

Run: `skill-scheduler list`
Expected: 표에 등록 항목 1 행 + LOADED ●.

- [ ] **Step 16.7: 테스트 스케줄 제거**

Run: `skill-scheduler remove <id>` → yes
Expected: `Removed.` 및 launchctl list 에서 사라짐.

- [ ] **Step 16.8: 최종 확인 (커밋 없음 — 검증만)**

Run: `skill-scheduler list`
Expected: `No schedules.` 또는 다른 항목들 정상 표시.

---

## Self-Review

**1. Spec coverage**

| Spec 섹션 | 구현 Task |
|---|---|
| §3.1 Layout | Task 1 (scaffold) + 각 모듈 task |
| §3.2 런타임 분리 | Task 8 (bash runner) + Task 14 (cli) |
| §3.3 의존성 | Task 1 의 package.json |
| §3.4 데이터 모델 | Task 6 (`ScheduleEntry`) |
| §3.5 경로 | Task 2 (`paths.ts`) |
| §4.1 add | Task 10 |
| §4.2 list | Task 11 |
| §4.3 remove | Task 12 |
| §4.4 run | Task 13 |
| §5 Cron 변환 | Task 3 |
| §6 헤드리스 래퍼 | Task 8 |
| §7 README | Task 1 (초안) + Task 15 (최종) |
| §8 Failure modes | Task 8 (래퍼 exit code), Task 10 (id 충돌), Task 12 (unload 경고) |
| §9 Test plan | Task 3-6 단위 테스트, Task 16 통합 |

**2. Placeholder scan**: 모든 task 에 실제 코드/명령 포함. "TBD" 없음.

**3. Type consistency**
- `ScheduleEntry` (Task 6) 의 필드명이 Task 10/11/12/13 에서 동일하게 사용됨 (`id`, `label`, `prompt`, `cron`, `plistPath`, `logPath`)
- `LaunchdDict` (Task 3) 가 Task 4 (plist) 에서 동일하게 import
- `DiscoveredSkill.source` 가 `'user' | 'plugin'` 으로 Task 5, 10, 6 에서 일치
- `paths.ts` 의 `PATHS`, `labelForId`, `plistPathForId`, `logPathForId` 가 Task 10/11/12 에서 동일 시그니처로 사용
