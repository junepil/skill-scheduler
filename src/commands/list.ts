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
