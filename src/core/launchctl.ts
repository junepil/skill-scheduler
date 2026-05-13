import { $ } from 'bun';

export async function plutilLint(plistPath: string): Promise<void> {
  const result = await $`plutil -lint ${plistPath}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`plutil -lint failed: ${result.stderr.toString().trim()}`);
  }
}

export async function load(plistPath: string): Promise<void> {
  const result = await $`launchctl load -w ${plistPath}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`launchctl load failed: ${result.stderr.toString().trim()}`);
  }
}

export async function unload(plistPath: string): Promise<void> {
  const result = await $`launchctl unload -w ${plistPath}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`launchctl unload failed: ${result.stderr.toString().trim()}`);
  }
}

export async function start(label: string): Promise<void> {
  const result = await $`launchctl start ${label}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`launchctl start failed: ${result.stderr.toString().trim()}`);
  }
}

export async function loadedLabels(): Promise<Set<string>> {
  const result = await $`launchctl list`.quiet().nothrow();
  if (result.exitCode !== 0) return new Set();
  const labels = new Set<string>();
  for (const line of result.stdout.toString().split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (cols.length >= 3 && cols[2]) labels.add(cols[2]);
  }
  return labels;
}
