import { $ } from 'bun';

export async function plutilLint(plistPath: string): Promise<void> {
  const result = await $`plutil -lint ${plistPath}`.quiet().nothrow();
  if (result.exitCode !== 0) {
    throw new Error(`plutil -lint failed: ${result.stderr.toString().trim()}`);
  }
}

export async function load(plistPath: string, label: string): Promise<void> {
  // launchctl load can exit non-zero (or with empty stderr) on modern macOS
  // even when the agent ends up loaded. Trust runtime state over exit code.
  const result = await $`launchctl load -w ${plistPath}`.quiet().nothrow();
  if (!(await loadedLabels()).has(label)) {
    const detail = result.stderr.toString().trim() || `exit ${result.exitCode}`;
    throw new Error(`launchctl load failed: ${detail}`);
  }
}

export async function unload(plistPath: string, label: string): Promise<void> {
  // launchctl unload can exit non-zero with empty stderr on macOS Sequoia
  // even when the unload succeeds. Verify against runtime state.
  const result = await $`launchctl unload -w ${plistPath}`.quiet().nothrow();
  if ((await loadedLabels()).has(label)) {
    const detail = result.stderr.toString().trim() || `exit ${result.exitCode}`;
    throw new Error(`launchctl unload failed: ${detail}; agent still loaded`);
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
