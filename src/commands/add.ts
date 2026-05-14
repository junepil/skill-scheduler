import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import parser from 'cron-parser';
import cronstrue from 'cronstrue';
import { expandCron } from '../core/cron';
import { Registry, type ScheduleEntry } from '../core/registry';
import { discoverSkills } from '../core/skill-discovery';
import { serializePlist } from '../core/plist';
import * as launchctl from '../core/launchctl';
import {
  PATHS,
  labelForId,
  logPathForId,
  plistPathForId,
} from '../core/paths';
import { intro, outro, note, searchSkill, text, confirm, cancel } from '../ui/prompts';

export async function runAdd(): Promise<void> {
  intro('skill-scheduler  add');

  const skills = await discoverSkills({
    userSkillsDir: PATHS.claudeUserSkills,
    pluginsCacheDir: PATHS.claudePluginsCache,
  });
  if (skills.length === 0) cancel('No skills found');

  const skill = await searchSkill(
    skills.map((s) => ({
      label: `${s.name}`,
      hint: `${s.source} · ${s.description.slice(0, 60)}`,
      value: s,
    })),
  );
  if (!skill) cancel('Cancelled');

  const args = await text('Skill arguments (optional)', 'empty for none');
  if (args === null) cancel('Cancelled');

  const cronExpr = await text('Cron expression', '0 21 * * 1-5');
  if (!cronExpr) cancel('Cancelled');

  const exp = expandCron(cronExpr);
  if (!exp.ok) cancel(`Invalid cron: ${exp.error}`);

  const registry = new Registry(PATHS.registryFile);
  let id = slugify(skill.name);
  const existing = await registry.list();
  const usedIds = new Set(existing.map((e) => e.id));
  while (usedIds.has(id)) {
    const next = await text(`ID '${id}' already used. New id suffix?`);
    if (!next) cancel('Cancelled');
    id = slugify(`${skill.name}-${next}`);
  }

  const prompt = args.trim()
    ? `/${skill.name} ${args.trim()}`
    : `/${skill.name}`;
  const label = labelForId(id);
  const plistPath = plistPathForId(id);
  const logPath = logPathForId(id);
  const programPath = join(import.meta.dir, '..', 'headless-runner.sh');
  const nextRun = parser.parseExpression(cronExpr).next().toDate().toISOString();

  note(
    'Preview',
    [
      `label   ${label}`,
      `prompt  ${prompt}`,
      `cron    ${cronExpr}  →  ${cronstrue.toString(cronExpr)}`,
      `plist   ${plistPath}`,
      `next    ${nextRun}`,
    ].join('\n'),
  );

  const ok = await confirm('Register?');
  if (!ok) cancel('Cancelled');

  const xml = serializePlist({
    label,
    programPath,
    env: { SS_PROMPT: prompt, SS_LOG: logPath, SS_LABEL: label },
    logPath,
    calendarIntervals: exp.dicts,
  });

  await mkdir(PATHS.launchAgents, { recursive: true });
  await mkdir(PATHS.logsDir, { recursive: true });
  await writeFile(plistPath, xml);

  const entry: ScheduleEntry = {
    id,
    label,
    skillName: skill.name,
    skillSource: skill.source,
    skillPath: skill.skillPath,
    prompt,
    cron: cronExpr,
    plistPath,
    logPath,
    createdAt: new Date().toISOString(),
  };

  try {
    await launchctl.plutilLint(plistPath);
    await launchctl.load(plistPath);
    await registry.add(entry);
  } catch (e) {
    await rm(plistPath, { force: true });
    try {
      await launchctl.unload(plistPath);
    } catch {}
    throw e;
  }

  outro(`Registered. Next run: ${nextRun}`);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}
