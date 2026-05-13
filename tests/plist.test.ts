import { describe, expect, test } from 'bun:test';
import { serializePlist } from '../src/core/plist';

describe('serializePlist', () => {
  test('weekday 21:00 wrap-up plist matches expected', () => {
    const xml = serializePlist({
      label: 'com.junepil.skill-scheduler.wrap-up',
      programPath: '/Users/junepil.lee/projects/skill-scheduler/src/headless-runner.sh',
      env: {
        SS_PROMPT: '/wrap-up',
        SS_LOG: '/Users/junepil.lee/.claude/logs/skill-scheduler/wrap-up.log',
        SS_LABEL: 'com.junepil.skill-scheduler.wrap-up',
      },
      logPath: '/Users/junepil.lee/.claude/logs/skill-scheduler/wrap-up.log',
      calendarIntervals: [
        { Minute: 0, Hour: 21, Weekday: 1 },
        { Minute: 0, Hour: 21, Weekday: 2 },
        { Minute: 0, Hour: 21, Weekday: 3 },
        { Minute: 0, Hour: 21, Weekday: 4 },
        { Minute: 0, Hour: 21, Weekday: 5 },
      ],
    });

    expect(xml).toContain('<key>Label</key>');
    expect(xml).toContain('<string>com.junepil.skill-scheduler.wrap-up</string>');
    expect(xml).toContain('<key>StartCalendarInterval</key>');
    expect(xml).toContain('<key>Weekday</key><integer>1</integer>');
    expect(xml).toContain('<key>Weekday</key><integer>5</integer>');
    expect(xml).toContain('<key>SS_PROMPT</key>');
    expect(xml).toContain('<string>/wrap-up</string>');
    expect(xml).toContain('<key>RunAtLoad</key>');
    expect(xml).toContain('<false/>');
  });

  test('omits wildcard fields', () => {
    const xml = serializePlist({
      label: 'l',
      programPath: '/p',
      env: { SS_PROMPT: '/x', SS_LOG: '/log', SS_LABEL: 'l' },
      logPath: '/log',
      calendarIntervals: [{ Minute: 30, Hour: 9 }],
    });
    expect(xml).not.toContain('Weekday');
    expect(xml).not.toContain('Day');
    expect(xml).not.toContain('Month');
  });
});
