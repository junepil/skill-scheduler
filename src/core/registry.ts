import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ScheduleEntry = {
  id: string;
  label: string;
  skillName: string;
  skillSource: 'user' | 'plugin';
  skillPath: string;
  prompt: string;
  cron: string;
  plistPath: string;
  logPath: string;
  createdAt: string;
};

type RegistryData = { version: 1; schedules: ScheduleEntry[] };

export class Registry {
  constructor(private path: string) {}

  async list(): Promise<ScheduleEntry[]> {
    const data = await this.load();
    return data.schedules;
  }

  async get(id: string): Promise<ScheduleEntry | undefined> {
    const data = await this.load();
    return data.schedules.find((e) => e.id === id);
  }

  async add(entry: ScheduleEntry): Promise<void> {
    const data = await this.load();
    if (data.schedules.some((e) => e.id === entry.id)) {
      throw new Error(`id '${entry.id}' already exists in registry`);
    }
    data.schedules.push(entry);
    await this.save(data);
  }

  async remove(id: string): Promise<void> {
    const data = await this.load();
    const idx = data.schedules.findIndex((e) => e.id === id);
    if (idx < 0) throw new Error(`id '${id}' not found in registry`);
    data.schedules.splice(idx, 1);
    await this.save(data);
  }

  private async load(): Promise<RegistryData> {
    try {
      const text = await readFile(this.path, 'utf8');
      const parsed = JSON.parse(text) as RegistryData;
      if (parsed.version !== 1) throw new Error('unsupported registry version');
      return parsed;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return { version: 1, schedules: [] };
      }
      throw e;
    }
  }

  private async save(data: RegistryData): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(data, null, 2) + '\n');
  }
}
