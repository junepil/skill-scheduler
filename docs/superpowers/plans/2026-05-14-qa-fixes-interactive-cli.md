# Interactive CLI QA Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three interactive-CLI QA issues: ESC/q exit, scroll-style list rendering, page-size 10 with search.

**Architecture:** Upgrade `@clack/prompts` from 0.7.0 to ^0.10 to gain `maxItems` scroll viewport and the new `autocomplete` prompt. Centralize quit-key handling in a `withQuitKey` helper inside `src/ui/prompts.ts`. Replace the `add` skill picker with an autocomplete-based `searchSkill`. Add a small pure `paginate` helper used by `list` to page through schedules in chunks of 10.

**Tech Stack:** Bun, TypeScript, `@clack/prompts` ^0.10, `cli-table3`, `picocolors`, `cron-parser`, `cronstrue`. Tests use `bun:test`.

**Spec:** `docs/superpowers/specs/2026-05-14-qa-fixes-interactive-cli-design.md`

---

## File Plan

| File                              | Action  | Responsibility                                              |
|-----------------------------------|---------|-------------------------------------------------------------|
| `package.json`                    | Modify  | Bump `@clack/prompts` to `^0.10`.                           |
| `src/ui/prompts.ts`               | Modify  | Add `withQuitKey`, `shouldQuit`, `searchSkill`; `maxItems`. |
| `src/ui/pagination.ts`            | Create  | Pure `paginate<T>()` helper.                                |
| `src/commands/add.ts`             | Modify  | Use `searchSkill` for skill picking.                        |
| `src/commands/list.ts`            | Modify  | Pagination loop when rows > 10.                             |
| `tests/pagination.test.ts`        | Create  | Unit tests for `paginate`.                                  |
| `tests/prompts.test.ts`           | Create  | Unit tests for `shouldQuit`.                                |

`src/commands/remove.ts` is intentionally NOT modified — it inherits the updated `selectSkill` helper.

---

## Task 1: Upgrade `@clack/prompts` and verify install

**Files:**
- Modify: `package.json`
- Modify: `bun.lock` (regenerated)

- [ ] **Step 1: Update the dependency version**

Edit `package.json`. Change the `dependencies` block:

```json
"dependencies": {
  "@clack/prompts": "^0.10.0",
  "cli-table3": "^0.6.5",
  "cron-parser": "^4.9.0",
  "cronstrue": "^2.50.0",
  "picocolors": "^1.0.1",
  "yaml": "^2.5.0"
}
```

- [ ] **Step 2: Reinstall**

Run: `bun install`
Expected: `bun.lock` updates with the new clack version; no errors.

- [ ] **Step 3: Confirm autocomplete export exists**

Run: `bun -e "import * as c from '@clack/prompts'; console.log(typeof c.autocomplete, typeof c.select, typeof c.text);"`
Expected: `function function function`

- [ ] **Step 4: Run existing tests to ensure baseline still passes**

Run: `bun test`
Expected: all existing tests pass (cron, plist, registry, skill-discovery).

- [ ] **Step 5: Run typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: bump @clack/prompts to ^0.10 for maxItems and autocomplete"
```

---

## Task 2: Add `shouldQuit` pure helper with tests

**Files:**
- Create: `tests/prompts.test.ts`
- Modify: `src/ui/prompts.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/prompts.test.ts`:

```typescript
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
    expect(shouldQuit({ name: 'q', sequence: '', ctrl: true })).toBe(false);
  });

  test('returns false when name is undefined', () => {
    expect(shouldQuit({ sequence: '' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `bun test tests/prompts.test.ts`
Expected: FAIL with `shouldQuit is not a function` or import error.

- [ ] **Step 3: Add `shouldQuit` to `src/ui/prompts.ts`**

Add at the top of the file (after imports):

```typescript
export type KeypressInfo = {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
};

export function shouldQuit(key: KeypressInfo): boolean {
  if (key.ctrl || key.meta) return false;
  return key.name === 'q' || key.name === 'Q';
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `bun test tests/prompts.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/prompts.test.ts src/ui/prompts.ts
git commit -m "feat(ui): add shouldQuit helper for q/Q exit detection"
```

---

## Task 3: Add `withQuitKey` wrapper helper

**Files:**
- Modify: `src/ui/prompts.ts`

Note: `withQuitKey` exits the process on `q`/`Q`. It is not unit-tested because it manipulates real `process.stdin` raw mode; behavior is verified by manual QA in Task 9.

- [ ] **Step 1: Add the helper to `src/ui/prompts.ts`**

Add after `shouldQuit`:

```typescript
import * as readline from 'node:readline';

export async function withQuitKey<T>(fn: () => Promise<T>): Promise<T> {
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY && !wasRaw) stdin.setRawMode(true);

  const onKeypress = (_str: string, key: KeypressInfo) => {
    if (shouldQuit(key)) {
      if (stdin.isTTY && !wasRaw) stdin.setRawMode(false);
      stdin.removeListener('keypress', onKeypress);
      clack.cancel('Cancelled');
      process.exit(130);
    }
  };

  stdin.on('keypress', onKeypress);
  try {
    return await fn();
  } finally {
    stdin.removeListener('keypress', onKeypress);
    if (stdin.isTTY && !wasRaw) stdin.setRawMode(false);
  }
}
```

Note: `clack` import already exists at the top as `import * as clack from '@clack/prompts'`.

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: all tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/prompts.ts
git commit -m "feat(ui): add withQuitKey wrapper to enable q-key cancel"
```

---

## Task 4: Add `maxItems` and `withQuitKey` to existing prompts

**Files:**
- Modify: `src/ui/prompts.ts`

- [ ] **Step 1: Update `selectSkill`**

Replace the existing `selectSkill` function body with:

```typescript
export async function selectSkill<T>(
  items: Array<{ label: string; hint?: string; value: T }>,
): Promise<T | null> {
  return withQuitKey(async () => {
    const result = await clack.select({
      message: 'Select skill',
      maxItems: 10,
      options: items.map((i) => ({ value: i.value, label: i.label, hint: i.hint })),
    });
    if (clack.isCancel(result)) return null;
    return result as T;
  });
}
```

- [ ] **Step 2: Update `confirm`**

Replace the existing `confirm` function body with:

```typescript
export async function confirm(message: string): Promise<boolean> {
  return withQuitKey(async () => {
    const result = await clack.confirm({ message });
    if (clack.isCancel(result)) return false;
    return result as boolean;
  });
}
```

`text` is intentionally NOT wrapped — `q` must remain a valid character in cron/args input.

- [ ] **Step 3: Run typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 4: Run full test suite**

Run: `bun test`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/prompts.ts
git commit -m "feat(ui): cap selectSkill viewport to 10 rows and enable q-cancel on select/confirm"
```

---

## Task 5: Add `searchSkill` autocomplete-based picker

**Files:**
- Modify: `src/ui/prompts.ts`

- [ ] **Step 1: Add `searchSkill` to `src/ui/prompts.ts`**

Add a new export after `selectSkill`:

```typescript
export async function searchSkill<T>(
  items: Array<{ label: string; hint?: string; value: T }>,
): Promise<T | null> {
  return withQuitKey(async () => {
    const result = await clack.autocomplete({
      message: 'Select skill',
      placeholder: 'Type to search...',
      maxItems: 10,
      options: items.map((i) => ({ value: i.value, label: i.label, hint: i.hint })),
    });
    if (clack.isCancel(result)) return null;
    return result as T;
  });
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: no errors. (If `clack.autocomplete` is not found, verify Task 1's install succeeded.)

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: all tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/ui/prompts.ts
git commit -m "feat(ui): add searchSkill autocomplete picker"
```

---

## Task 6: Wire `searchSkill` into the `add` command

**Files:**
- Modify: `src/commands/add.ts`

- [ ] **Step 1: Update the import**

In `src/commands/add.ts`, change the import line:

```typescript
import { intro, outro, note, selectSkill, searchSkill, text, confirm, cancel } from '../ui/prompts';
```

- [ ] **Step 2: Replace the skill picker call**

Find this block (around lines 27-34):

```typescript
const skill = await selectSkill(
  skills.map((s) => ({
    label: `${s.name}`,
    hint: `${s.source} · ${s.description.slice(0, 60)}`,
    value: s,
  })),
);
if (!skill) cancel('Cancelled');
```

Replace with:

```typescript
const skill = await searchSkill(
  skills.map((s) => ({
    label: `${s.name}`,
    hint: `${s.source} · ${s.description.slice(0, 60)}`,
    value: s,
  })),
);
if (!skill) cancel('Cancelled');
```

(The only change is `selectSkill` → `searchSkill`. `selectSkill` import stays because it's no longer used here — remove it from the import if `add.ts` no longer references it elsewhere. Verify by grepping the file after the swap.)

- [ ] **Step 3: Clean up the import if `selectSkill` is now unused in `add.ts`**

Run: `grep -n 'selectSkill' src/commands/add.ts`
If only the import line matches, drop `selectSkill` from the import:

```typescript
import { intro, outro, note, searchSkill, text, confirm, cancel } from '../ui/prompts';
```

- [ ] **Step 4: Run typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 5: Run full test suite**

Run: `bun test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/commands/add.ts
git commit -m "feat(add): use searchSkill autocomplete for skill picker"
```

---

## Task 7: Add pure `paginate` helper with tests

**Files:**
- Create: `tests/pagination.test.ts`
- Create: `src/ui/pagination.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/pagination.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test, expect failure**

Run: `bun test tests/pagination.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Create `src/ui/pagination.ts`**

```typescript
export type PageResult<T> = {
  slice: T[];
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export function paginate<T>(rows: T[], page: number, pageSize: number): PageResult<T> {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const start = page * pageSize;
  const slice = rows.slice(start, start + pageSize);
  return {
    slice,
    totalPages,
    hasPrev: page > 0,
    hasNext: page < totalPages - 1,
  };
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `bun test tests/pagination.test.ts`
Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/pagination.test.ts src/ui/pagination.ts
git commit -m "feat(ui): add pure paginate helper with unit tests"
```

---

## Task 8: Wire pagination into the `list` command

**Files:**
- Modify: `src/commands/list.ts`

- [ ] **Step 1: Replace the body of `runList`**

Replace the entire `src/commands/list.ts` file with:

```typescript
import parser from 'cron-parser';
import { Registry } from '../core/registry';
import { PATHS } from '../core/paths';
import * as launchctl from '../core/launchctl';
import { renderScheduleTable, type Row } from '../ui/table';
import { intro, outro, selectSkill } from '../ui/prompts';
import { paginate } from '../ui/pagination';

const PAGE_SIZE = 10;

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

  const loadedCount = rows.filter((r) => r.loaded).length;

  if (rows.length <= PAGE_SIZE) {
    console.log(renderScheduleTable(rows));
    outro(`${rows.length} schedules · ${loadedCount} loaded`);
    return;
  }

  let page = 0;
  while (true) {
    const { slice, totalPages, hasPrev, hasNext } = paginate(rows, page, PAGE_SIZE);
    console.log(renderScheduleTable(slice));
    console.log(`Page ${page + 1}/${totalPages} · ${rows.length} schedules · ${loadedCount} loaded`);

    type Action = 'next' | 'prev' | 'quit';
    const options: Array<{ label: string; value: Action }> = [];
    if (hasNext) options.push({ label: 'Next page', value: 'next' });
    if (hasPrev) options.push({ label: 'Previous page', value: 'prev' });
    options.push({ label: 'Quit', value: 'quit' });

    const action = await selectSkill<Action>(options);
    if (action === 'next') page++;
    else if (action === 'prev') page--;
    else break;
  }
  outro('Done.');
}

function nextRunString(expr: string): string {
  try {
    const d = parser.parseExpression(expr).next().toDate();
    return d.toLocaleString('sv-SE', { hour12: false }).slice(0, 16);
  } catch {
    return '—';
  }
}
```

- [ ] **Step 2: Run typecheck**

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Run full test suite**

Run: `bun test`
Expected: all tests pass (existing + new pagination/prompts tests).

- [ ] **Step 4: Commit**

```bash
git add src/commands/list.ts
git commit -m "feat(list): paginate at 10 rows per page with Next/Prev/Quit navigation"
```

---

## Task 9: Manual QA verification

**Files:** none (interactive verification only)

- [ ] **Step 1: Build/run smoke check**

Run: `bun src/cli.ts --help`
Expected: help text prints, no exceptions.

- [ ] **Step 2: QA — autocomplete search in `add`**

Run: `bun src/cli.ts add`
Verify:
- A search prompt appears with placeholder "Type to search...".
- Typing filters the visible list against label/hint.
- The visible list never exceeds 10 rows.
- Pressing ESC cancels cleanly with "Cancelled" outro.
- Pressing `q` (with empty buffer) cancels cleanly.

- [ ] **Step 3: QA — viewport scroll in `remove`**

Pre-req: at least 12 schedules registered. If not, register synthetic ones for the test by running `bun src/cli.ts add` repeatedly (then clean up after).

Run: `bun src/cli.ts remove`
Verify:
- Visible options block stays at 10 rows.
- Arrow keys move the cursor within the viewport; reaching the edge slides the viewport (no full re-render flicker of the whole list).
- ESC cancels. `q` cancels.

- [ ] **Step 4: QA — list pagination**

Pre-req: 11+ schedules.

Run: `bun src/cli.ts list`
Verify:
- First 10 rows print followed by `Page 1/N · K schedules · L loaded`.
- "Next page" option appears; "Previous page" is hidden on page 1.
- After choosing "Next page", page 2 renders; "Previous page" now visible.
- Choosing "Quit" exits with "Done."

- [ ] **Step 5: QA — list ≤10 schedules path unchanged**

With ≤10 schedules:
Run: `bun src/cli.ts list`
Expected: single table render, no pagination prompt (preserves prior behavior).

- [ ] **Step 6: QA — text input not affected by quit key**

Run: `bun src/cli.ts add`, advance to the "Skill arguments (optional)" text prompt.
Type a string containing `q` (e.g., `quick test`). Press Enter.
Expected: input accepted as-is; session does NOT terminate.

- [ ] **Step 7: Clean up any synthetic test schedules**

Use `bun src/cli.ts remove` for each test entry created in Step 3 / Step 4.

- [ ] **Step 8: Final regression**

Run: `bun test && bun run typecheck`
Expected: all green.

---

## Self-Review

**Spec coverage:**
- ESC/q exit (spec §1) → Tasks 2, 3, 4 (shouldQuit + withQuitKey + wrap selectSkill/confirm). Carve-out for `text()` documented in Task 4 step 2.
- Scroll viewport (spec §2) → Task 4 adds `maxItems: 10` to selectSkill; inherited by remove. Task 5 adds it to searchSkill.
- Page-size 10 + search (spec §3) → Task 5 (searchSkill) + Task 6 (wire into add) + Tasks 7-8 (paginate list).
- Files Touched table → matches Tasks 1, 3-4 (prompts.ts), 6 (add.ts), 7 (pagination.ts), 8 (list.ts). `remove.ts` not modified, as spec stipulates.
- Testing Strategy → existing tests run after every code task; new pagination + shouldQuit tests added; manual QA in Task 9 mirrors spec's manual checklist.

**Placeholder scan:** No TBD/TODO/handwaves. Every code step shows full code.

**Type consistency:** `paginate<T>(rows, page, pageSize)` signature consistent between Task 7 declaration and Task 8 call site. `searchSkill` / `selectSkill` share the same option shape `{ label, hint?, value }` and the same `Promise<T | null>` return.

No issues found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-14-qa-fixes-interactive-cli.md`. Two execution options:

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session with checkpoints for review.

Which approach?
