import type { LaunchdDict } from './cron';

export type PlistInput = {
  label: string;
  programPath: string;
  env: Record<string, string>;
  logPath: string;
  calendarIntervals: LaunchdDict[];
};

export function serializePlist(input: PlistInput): string {
  const envEntries = Object.entries(input.env)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `        <key>${escape(k)}</key>\n        <string>${escape(v)}</string>`)
    .join('\n');

  const intervals = input.calendarIntervals
    .map((d) => {
      const lines = [
        '        <dict>',
        ...orderedKeys(d).map(
          (k) => `            <key>${k}</key><integer>${d[k]}</integer>`,
        ),
        '        </dict>',
      ];
      return lines.join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${escape(input.label)}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${escape(input.programPath)}</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
${envEntries}
    </dict>

    <key>StartCalendarInterval</key>
    <array>
${intervals}
    </array>

    <key>RunAtLoad</key>
    <false/>

    <key>StandardOutPath</key>
    <string>${escape(input.logPath)}</string>

    <key>StandardErrorPath</key>
    <string>${escape(input.logPath)}</string>
</dict>
</plist>
`;
}

const KEY_ORDER: Array<keyof LaunchdDict> = ['Minute', 'Hour', 'Day', 'Month', 'Weekday'];

function orderedKeys(d: LaunchdDict): Array<keyof LaunchdDict> {
  return KEY_ORDER.filter((k) => d[k] !== undefined);
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
