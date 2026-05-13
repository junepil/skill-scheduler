#!/bin/bash
# Invoked by launchd. Reads SS_PROMPT/SS_LOG/SS_LABEL from environment.
set -u

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

CLAUDE_BIN="$HOME/.local/bin/claude"
LOG="${SS_LOG:?SS_LOG required}"
PROMPT="${SS_PROMPT:?SS_PROMPT required}"
LABEL="${SS_LABEL:-skill-scheduler}"

mkdir -p "$(dirname "$LOG")"

TS="$(date '+%Y-%m-%d %H:%M:%S')"
echo "[$TS] $LABEL start prompt=$PROMPT" >> "$LOG"

"$CLAUDE_BIN" -p "$PROMPT" --dangerously-skip-permissions >> "$LOG" 2>&1
RC=$?

END_TS="$(date '+%Y-%m-%d %H:%M:%S')"
echo "[$END_TS] $LABEL end exit=$RC" >> "$LOG"

if [ "$RC" -eq 0 ]; then
  osascript -e "display notification \"$PROMPT 완료\" with title \"$LABEL\""
else
  osascript -e "display notification \"$LOG 확인\" with title \"$LABEL 실패\""
fi

exit "$RC"
