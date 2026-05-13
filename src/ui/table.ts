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
