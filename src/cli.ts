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
