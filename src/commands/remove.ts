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
