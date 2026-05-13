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
  { name: 'minute', min: 0, max: 59, key: 'Minute' as const, allowWildcard: false, allowStep: true },
  { name: 'hour', min: 0, max: 23, key: 'Hour' as const, allowWildcard: false, allowStep: true },
  { name: 'dayOfMonth', min: 1, max: 31, key: 'Day' as const, allowWildcard: true, allowStep: false },
  { name: 'month', min: 1, max: 12, key: 'Month' as const, allowWildcard: true, allowStep: false },
  { name: 'dayOfWeek', min: 0, max: 6, key: 'Weekday' as const, allowWildcard: true, allowStep: false },
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
      const values = expandField(f, bound.min, bound.max, bound.allowStep);
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

function expandField(
  field: string,
  min: number,
  max: number,
  allowStep: boolean,
): number[] | null {
  const parts = field.split(',');
  const out = new Set<number>();
  for (const p of parts) {
    const m = p.match(/^(\d+)(?:-(\d+))?(?:\/(\d+))?$/);
    if (!m) return null;
    if (m[3] !== undefined && !allowStep) return null;
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
