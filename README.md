# skill-scheduler

Register any Claude Code skill (user or plugin) under a cron schedule. Built on macOS launchd.

## Why

Generalizes the [wrap-up scheduler](https://github.com/junepil-lee/wrap-up) pattern so any
skill can be put on a schedule with one command instead of hand-rolling plist files.

## Requirements

- macOS
- `claude` CLI at `~/.local/bin/claude`
- Bun 1.x
- Notification permission for `osascript` (System Settings → Notifications)

## Install

```bash
git clone https://github.com/junepil-lee/skill-scheduler ~/projects/skill-scheduler
cd ~/projects/skill-scheduler
bun install
bun link
skill-scheduler --version
```

If `skill-scheduler` is not found on PATH, ensure `~/.bun/bin` is in your shell rc.

## Quickstart

Register `/wrap-up` to run weekdays at 21:00:

```bash
skill-scheduler add
```

```
┌  skill-scheduler  add
│
◇  Select skill
│  ● wrap-up
│
◇  Skill arguments (optional)
│
│
◇  Cron expression
│  0 21 * * 1-5
│
◇  Confirm? yes
│
└  Registered. Next run: Thu 2026-05-14 21:00
```

## Commands

| Command | What |
|---|---|
| `skill-scheduler add` | Interactive registration |
| `skill-scheduler list` | Show all schedules with load state |
| `skill-scheduler remove [id]` | Remove (interactive or by id) |
| `skill-scheduler run <id>` | Trigger immediately |

## Cron Support

| Field | Allowed | Rejected |
|---|---|---|
| Minute | value, list, range, step | `*` |
| Hour | value, list, range, step | `*` |
| Day of month | value, list, range, `*` | step |
| Month | value, list, range, `*` | step |
| Day of week | value, list, range, `*` | step |

Both day-of-month and day-of-week cannot be set together. Expressions expanding to more
than 100 launchd intervals are rejected.

## Files

| Path | Purpose |
|---|---|
| `~/.config/skill-scheduler/registry.json` | Schedule metadata |
| `~/Library/LaunchAgents/com.junepil.skill-scheduler.*.plist` | One per schedule |
| `~/.claude/logs/skill-scheduler/<id>.log` | Per-schedule log |

## Removal

Remove a single schedule:
```bash
skill-scheduler remove <id>
```

Remove the tool entirely:
```bash
# Unload all schedules
for f in ~/Library/LaunchAgents/com.junepil.skill-scheduler.*.plist; do
  launchctl unload -w "$f" 2>/dev/null
  rm "$f"
done
rm -rf ~/.config/skill-scheduler ~/.claude/logs/skill-scheduler
bun unlink   # in repo root
```

## Troubleshooting

| Symptom | Check |
|---|---|
| No notifications | System Settings → Notifications → Script Editor 권한 |
| `exit=127` in log | `~/.local/bin/claude` 가 존재하고 실행 가능한지 |
| Schedule runs but no Confluence update | MCP 인증 만료. 수동으로 한 번 `claude` 실행해서 재인증 |
| `launchctl load` 실패 | `plutil -lint ~/Library/LaunchAgents/<plist>` 로 문법 확인 |

## License

MIT
