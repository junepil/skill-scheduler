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
