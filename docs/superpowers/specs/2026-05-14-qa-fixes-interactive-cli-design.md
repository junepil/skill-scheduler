# QA Fixes: Interactive CLI UX

Date: 2026-05-14
Status: Approved

## Background

Manual QA on the `skill-scheduler` interactive CLI surfaced three usability issues:

1. **Exit ergonomics** — During an interactive prompt, neither `ESC` nor `q` exits the session. The only way out is `Ctrl+C`.
2. **List re-render flicker** — In the `select`-style prompts, pressing arrow keys re-renders the entire option block instead of scrolling within a fixed viewport. With long lists this makes reading unpleasant.
3. **Page size + search** — Every list view should cap at 10 items per page, and adding a new schedule should support type-to-filter search across the available skills.

The CLI uses `@clack/prompts@0.7.0`. The 0.10+ line introduces both a scrollable `select` (`maxItems`) and a new `autocomplete` prompt — both directly address issues 2 and 3.

## Goals

- `ESC` and `q` reliably exit any interactive prompt (subject to one carve-out for free-text inputs where `q` is a legitimate character).
- Lists never grow taller than 10 visible rows; cursor navigation slides the viewport instead of repainting an expanding block.
- The `add` flow lets the user type to filter the skill list.
- All existing unit tests continue to pass without modification.

## Non-Goals

- Reworking the underlying scheduler, registry, or launchctl integration.
- Replacing `@clack/prompts` with a different prompts library.
- Building a fully custom readline UI from scratch.

## Approach Comparison

**Option A: Upgrade `@clack/prompts` to ^0.10 and use its built-ins (CHOSEN)**
- Pros: Native `maxItems` scroll viewport, native `autocomplete`, ESC cancel already wired; minimal new code; visual style stays consistent across prompts.
- Cons: Minor version bump risk on existing call sites (mitigated — current usage is a strict subset).

**Option B: Stay on 0.7.0 and hand-roll search + viewport**
- Pros: No dependency upgrade.
- Cons: Significantly more code, two parallel prompt styles, harder to maintain.

**Option C: Mix `@inquirer/prompts` for autocomplete only**
- Pros: Strong autocomplete UX.
- Cons: Two prompt libraries with different look-and-feel; larger install footprint.

Option A wins on simplicity and consistency.

## Design

### Dependency Upgrade

Bump `@clack/prompts` to `^0.10` in `package.json`. The existing API surface we depend on (`intro`, `outro`, `select`, `text`, `confirm`, `note`, `cancel`, `isCancel`) is unchanged in that line.

### `src/ui/prompts.ts` Changes

1. **`withQuitKey<T>(fn: () => Promise<T>): Promise<T>`**
   - During `fn`'s execution, attach a `keypress` listener to `process.stdin` that calls `process.exit(130)` on `q` / `Q`.
   - Uses `readline.emitKeypressEvents(process.stdin)` and toggles raw mode only if not already set by the underlying prompt.
   - `try/finally` removes the listener so subsequent prompts (including text input) are unaffected.

2. **`selectSkill` updates**
   - Passes `maxItems: 10` to `clack.select`.
   - Body wrapped in `withQuitKey`.

3. **`confirm` updates**
   - Body wrapped in `withQuitKey`. (ESC already cancels via clack.)

4. **`searchSkill<T>(items)` — new export**
   - Wraps `clack.autocomplete({ message: 'Select skill', placeholder: 'Type to search...', maxItems: 10, options })`.
   - Returns the chosen value or `null` on cancel.
   - Body wrapped in `withQuitKey`.

5. **`text` unchanged** — `q` is a valid character in text input (e.g., args, cron strings could contain it incidentally), so no quit-key listener here. ESC cancellation still works.

### `src/commands/add.ts` Changes

Replace the current `selectSkill(...)` call for skill picking with `searchSkill(...)`. Same return type, same cancel handling. All downstream logic (id generation, plist write, registry add) untouched.

The "ID already used" loop continues to use `text()` (no change).

### `src/commands/remove.ts` Changes

No changes required. The existing `selectSkill` call inherits `maxItems: 10` and `withQuitKey` automatically from the helper update.

### `src/commands/list.ts` Changes

`runList` currently does a single `console.log(renderScheduleTable(rows))`. Replace with a small pagination loop:

```
if (rows.length <= 10) {
  console.log(renderScheduleTable(rows));
  outro(`${rows.length} schedules · ${loadedCount} loaded`);
  return;
}

let page = 0;
const pageSize = 10;
const totalPages = Math.ceil(rows.length / pageSize);
while (true) {
  const slice = rows.slice(page * pageSize, (page + 1) * pageSize);
  console.log(renderScheduleTable(slice));
  console.log(`Page ${page + 1}/${totalPages}`);
  const action = await selectSkill([
    page < totalPages - 1 ? { label: 'Next page', value: 'next' } : null,
    page > 0 ? { label: 'Previous page', value: 'prev' } : null,
    { label: 'Quit', value: 'quit' },
  ].filter(Boolean));
  if (action === 'next') page++;
  else if (action === 'prev') page--;
  else break;
}
```

Rationale for reusing `selectSkill` over a raw keypress loop: it inherits ESC/q cancellation and matches the visual style of every other interactive step. The cost of one extra Enter keystroke per page turn is acceptable.

### Behavior of ESC and q

| Prompt type           | ESC | q  | Notes                                  |
|-----------------------|-----|----|----------------------------------------|
| `selectSkill`         | ✓   | ✓  | Both cancel cleanly.                   |
| `confirm`             | ✓   | ✓  | Both cancel cleanly.                   |
| `searchSkill`         | ✓   | ✓  | When the search input is empty.        |
| `text` (args, cron…)  | ✓   | —  | `q` is valid input here.               |

For `searchSkill`, the `q` listener races with autocomplete's text input. Acceptable trade-off: pressing `q` while typing a search query would terminate the session. In practice the user types skill name fragments, not single letters; if collisions surface, the rule can be tightened to "only fire on `q` when the autocomplete buffer is empty" in a follow-up.

## Files Touched

| File                              | Change                                                          |
|-----------------------------------|-----------------------------------------------------------------|
| `package.json`                    | Bump `@clack/prompts` to `^0.10`.                               |
| `src/ui/prompts.ts`               | Add `withQuitKey`, `searchSkill`; `maxItems: 10` on `selectSkill`. |
| `src/commands/add.ts`             | Use `searchSkill` instead of `selectSkill` for skill picking.   |
| `src/commands/list.ts`            | Pagination loop when `rows.length > 10`.                        |
| `src/commands/remove.ts`          | No change (inherits helper update).                             |

## Testing Strategy

- **Existing unit tests** (`cron.test.ts`, `plist.test.ts`, `registry.test.ts`, `skill-discovery.test.ts`) — must continue to pass with no modification. These cover non-UI code paths and are unaffected.
- **Manual QA checklist**:
  1. `skill-scheduler add` — ESC cancels at each step. `q` cancels at the skill-search step and confirm step.
  2. `skill-scheduler add` — Typing in the skill search filters the list. Empty query shows first 10 skills.
  3. `skill-scheduler remove` — Arrow keys move within a 10-row viewport without flicker; viewport slides when cursor reaches edge.
  4. `skill-scheduler list` with 11+ schedules — pagination prompt appears with Next/Previous/Quit options.
  5. `skill-scheduler list` with ≤10 schedules — no pagination prompt (existing behavior preserved).

## Risks and Mitigations

- **Clack upgrade introduces breaking behavior**: API we use is stable in 0.10; if `intro`/`outro`/`note` rendering shifts visually, that is acceptable.
- **Keypress listener leaks**: `try/finally` in `withQuitKey` removes the listener on every exit path including thrown errors.
- **`q` collides with autocomplete typing**: documented above; tightening rule kept as follow-up if it becomes annoying.

## Out of Scope (Follow-ups)

- Custom keybinds (`n`/`p` direct keys for list pagination without selection prompt).
- Multi-select for `remove`.
- Persistent terminal "header" while scrolling long results.
