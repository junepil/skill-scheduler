import * as readline from 'node:readline';
import * as clack from '@clack/prompts';
import pc from 'picocolors';

export type KeypressInfo = {
  name?: string;
  sequence?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
};

export function shouldQuit(key: KeypressInfo): boolean {
  if (key.ctrl || key.meta) return false;
  return key.name === 'q' || key.name === 'Q';
}

export async function withQuitKey<T>(fn: () => Promise<T>): Promise<T> {
  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  readline.emitKeypressEvents(stdin);
  if (stdin.isTTY && !wasRaw) stdin.setRawMode(true);

  const onKeypress = (_str: string, key: KeypressInfo) => {
    if (shouldQuit(key)) {
      if (stdin.isTTY && !wasRaw) stdin.setRawMode(false);
      stdin.removeListener('keypress', onKeypress);
      clack.cancel('Cancelled');
      process.exit(130);
    }
  };

  stdin.on('keypress', onKeypress);
  try {
    return await fn();
  } finally {
    stdin.removeListener('keypress', onKeypress);
    if (stdin.isTTY && !wasRaw) stdin.setRawMode(false);
  }
}

export function intro(text: string): void {
  clack.intro(pc.bgCyan(pc.black(` ${text} `)));
}

export function outro(text: string): void {
  clack.outro(text);
}

export async function selectSkill<T>(
  items: Array<{ label: string; hint?: string; value: T }>,
): Promise<T | null> {
  const result = await clack.select<T>({
    message: 'Select skill',
    options: items as clack.Option<T>[],
  });
  if (clack.isCancel(result)) return null;
  return result as T;
}

export async function text(
  message: string,
  placeholder?: string,
): Promise<string | null> {
  const result = await clack.text({ message, placeholder });
  if (clack.isCancel(result)) return null;
  return result as string;
}

export async function confirm(message: string): Promise<boolean> {
  const result = await clack.confirm({ message });
  if (clack.isCancel(result)) return false;
  return result as boolean;
}

export function note(label: string, body: string): void {
  clack.note(body, label);
}

export function cancel(reason: string): never {
  clack.cancel(reason);
  process.exit(1);
}
