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
- Full Disk Access for `/bin/bash` (see [macOS Permissions](#macos-permissions))

## Install

```bash
git clone https://github.com/junepil-lee/skill-scheduler ~/projects/skill-scheduler
cd ~/projects/skill-scheduler
bun install
bun link
skill-scheduler --version
```

If `skill-scheduler` is not found on PATH, ensure `~/.bun/bin` is in your shell rc.

## macOS Permissions

Headless `claude -p` calls launched by `launchd` trigger a TCC **"…would like to access data from other apps"** popup every time, even after clicking Allow. The popup shows a version number (e.g. `2.1.146`) instead of an app name.

**Cause**

- Claude Code probes other app containers under `~/Library/Application Support/` at startup, which requires `kTCCServiceSystemPolicyAppData`.
- In a Terminal session that permission is delegated from the parent app (Terminal.app / iTerm). Under `launchd` the responsible-process chain is broken, so `claude` itself becomes the TCC subject.
- The `claude` binary lives at `~/.local/share/claude/versions/<version>/` and rotates with every auto-update, so each new version path needs re-approval.

**Fix (one-time)**

Grant **Full Disk Access** to `/bin/bash`:

1. System Settings → Privacy & Security → Full Disk Access
2. Click `+`, press `Cmd-Shift-G`, enter `/bin/bash`, add it, and toggle it on.
3. Reload schedules: `launchctl unload` then `launchctl load` any registered plist (or just reboot).

Because `headless-runner.sh` runs under `/bin/bash`, the grant is delegated to the `claude` child process and survives Claude Code auto-updates.

> Granting Full Disk Access to `/bin/bash` is broad. If you prefer a tighter scope, add the specific binary at `~/.local/share/claude/versions/<version>/` instead — but you will need to re-add it after every Claude Code update.

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
| TCC 권한 팝업이 매번 뜸 | [macOS Permissions](#macos-permissions) 섹션대로 `/bin/bash` Full Disk Access 부여 |

## License

MIT
