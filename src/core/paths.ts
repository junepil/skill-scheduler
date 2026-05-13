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
