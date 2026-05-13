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
