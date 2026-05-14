import * as clack from '@clack/prompts';
import pc from 'picocolors';

export function intro(text: string): void {
  clack.intro(pc.bgCyan(pc.black(` ${text} `)));
}

export function outro(text: string): void {
  clack.outro(text);
}

export async function selectSkill<T>(
  items: Array<{ label: string; hint?: string; value: T }>,
): Promise<T | null> {
  const result = await clack.select({
    message: 'Select skill',
    options: items as any,
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
