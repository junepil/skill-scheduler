# skill-scheduler Design Spec

**Date:** 2026-05-14
**Status:** Approved, pending implementation
**Owner:** junepil.lee

## 1. Goal

`~/.claude/skills/` 와 `~/.claude/plugins/cache/.../skills/` 에 등록된 임의의 Claude Code 스킬을 사용자가 골라, 표준 cron 표현식으로 정해진 시간에 macOS launchd 로 자동 실행하도록 등록·관리하는 CLI 도구.

기존 [wrap-up scheduler](~/projects/wrap-up/scheduler-design.md) 가 단일 스킬에 hard-coded 된 일회성 셋업이었다면, skill-scheduler 는 동일 패턴을 일반화해서 N 개의 스킬을 동일 메커니즘으로 다룬다.

## 2. Non-Goals

- 비 macOS 플랫폼 지원. launchd 전용.
- cron special strings (`@daily` 등), 초 단위, 타임존 지정. local TZ 만.
- 데몬 형태 (매분 폴링) 동작. "정해진 시간에 N 회" 가 본 도구의 핵심.
- v1 에서는 스킬 인자 검증/타입 추론 없음. 자유 텍스트 그대로 보관.
- v1 에서는 JSON 출력 모드 없음.
- 기존 wrap-up scheduler 의 plist 자동 마이그레이션. 사용자가 나중에 수동 결정.

## 3. Architecture

### 3.1 저장소 레이아웃

```
~/projects/skill-scheduler/
├── README.md                  # 설치 + 사용법 (5 분 quickstart)
├── SPEC.md                    # 본 문서
├── PLAN.md                    # 구현 계획
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts                 # 진입점
│   ├── commands/
│   │   ├── add.ts             # 인터랙티브 스킬 선택 + 스케줄 등록
│   │   ├── list.ts            # 등록된 스케줄 표 출력
│   │   ├── remove.ts          # 스케줄 제거
│   │   └── run.ts             # 즉시 실행 (수동 트리거)
│   ├── core/
│   │   ├── skill-discovery.ts # 스킬 디렉토리 스캔 + frontmatter 파싱
│   │   ├── cron.ts            # cron → launchd dict 변환 + 검증
│   │   ├── plist.ts           # plist XML 생성
│   │   ├── registry.ts        # 상태 JSON CRUD
│   │   └── launchctl.ts       # launchctl load/unload/list shell out
│   ├── ui/
│   │   ├── prompts.ts         # @clack/prompts 래퍼
│   │   └── table.ts           # list 표 포맷터
│   └── headless-runner.sh     # launchd 가 실제 실행하는 얇은 bash
└── tests/
    ├── cron.test.ts
    ├── plist.test.ts
    ├── skill-discovery.test.ts
    └── registry.test.ts
```

### 3.2 런타임 분리

| 컴포넌트 | 런타임 | 책임 |
|---|---|---|
| CLI 바이너리 `skill-scheduler` | Bun + TS | 관리, 메타데이터 파싱, 인터랙션, 상태 |
| 헤드리스 실행 래퍼 | bash | launchd → claude CLI 호출 + 알림 + 로그 |

분리 이유: 각 스케줄 실행 때마다 bun 런타임 부팅 비용 회피, wrap-up 검증된 패턴 재사용. plist 의 `ProgramArguments` 는 항상 동일한 `headless-runner.sh` 를 호출하고, 환경 변수 `SS_PROMPT` 와 `SS_LOG` 를 통해 차이를 전달.

### 3.3 외부 의존성

| 패키지 | 용도 |
|---|---|
| `@clack/prompts` | 인터랙티브 prompt (select/text/confirm) |
| `yaml` | SKILL.md frontmatter 파싱 |
| `cron-parser` | cron 표현식 validate |
| `cronstrue` | cron → human-readable (preview 표시 전용) |
| `cli-table3` | list 명령 표 출력 |
| `picocolors` | 색상 |
| `typescript` (devDep) | 타입 체크 |
| `@types/node` (devDep) | 타입 |

Bun 빌트인: `Bun.$` (shell), `bun:test`, `fs` (Node 호환), `path`.

### 3.4 데이터 모델

```ts
// ~/.config/skill-scheduler/registry.json
type Registry = {
  version: 1;
  schedules: ScheduleEntry[];
};

type ScheduleEntry = {
  id: string;            // 슬러그, label 의 마지막 segment
  label: string;         // "com.junepil.skill-scheduler.<id>"
  skillName: string;     // SKILL.md 의 name
  skillSource: 'user' | 'plugin';
  skillPath: string;     // SKILL.md 절대 경로
  prompt: string;        // claude -p 인자 ex. "/wrap-up" 또는 "/weekly-retro 28"
  cron: string;          // 원본 5필드 cron
  plistPath: string;     // ~/Library/LaunchAgents/<label>.plist
  logPath: string;       // ~/.claude/logs/skill-scheduler/<id>.log
  createdAt: string;     // ISO 8601
};
```

### 3.5 경로 컨벤션

| 경로 | 역할 |
|---|---|
| `~/.config/skill-scheduler/registry.json` | 상태 |
| `~/Library/LaunchAgents/com.junepil.skill-scheduler.<id>.plist` | launchd job |
| `~/.claude/logs/skill-scheduler/<id>.log` | 실행별 로그 |
| `~/.claude/skills/skill-scheduler` → `~/projects/skill-scheduler` | symlink (선택, claude 가 인식할 필요는 없지만 일관성) |

## 4. CLI 동작

### 4.1 `skill-scheduler add`

인터랙티브 흐름. 모든 단계 `@clack/prompts` 의 통일된 vertical-bar UI.

```
┌  skill-scheduler  add
│
◇  Select skill
│  ● wrap-up         daily retrospective
│  ○ weekly-retro    weekly retrospective
│  ○ no-pain-no-jira meeting → jira ticket
│
◇  Skill arguments (optional)
│
│
◇  Cron expression
│  0 21 * * 1-5
│
◇  Preview
│  label   com.junepil.skill-scheduler.wrap-up
│  prompt  /wrap-up
│  cron    0 21 * * 1-5  →  Mon-Fri at 21:00
│  plist   /Users/junepil.lee/Library/LaunchAgents/com.junepil.skill-scheduler.wrap-up.plist
│
◇  Confirm? yes
│
└  Registered. Next run: Thu 2026-05-14 21:00
```

내부 동작:
1. skill-discovery 가 두 경로 스캔, frontmatter 의 name/description 표시
2. 사용자 선택 → prompt 입력 → cron 입력
3. cron 검증 → expand → preview 출력 (cronstrue 로 human 표시)
4. confirm 시 plist 생성, `plutil -lint`, `launchctl load -w`, registry 추가

기본 ID 생성: 선택한 skill name 그대로 슬러그화 (`weekly-retro` → `weekly-retro`). ID 가 registry 또는 launchd 에 이미 존재하면 사용자에게 새 ID suffix 입력 받음 (예: `wrap-up-2`). suffix 도 동일 슬러그 규칙 적용.

### 4.2 `skill-scheduler list`

```
┌  skill-scheduler  list

ID            SKILL            CRON              NEXT RUN          LOADED
──────────────────────────────────────────────────────────────────────────
wrap-up       wrap-up          0 21 * * 1-5      2026-05-14 21:00  ●
weekly-retro  weekly-retro     0 18 * * 5        2026-05-15 18:00  ●
meeting-jira  no-pain-no-jira  0  9 * * 1        2026-05-19 09:00  ○

3 schedules · 2 loaded
└
```

소스:
- 행 데이터: registry.json
- NEXT RUN: cron-parser 의 next iteration
- LOADED: `launchctl list` 결과와 label 매칭. 미적재 시 `○`

### 4.3 `skill-scheduler remove <id>`

```
┌  skill-scheduler  remove wrap-up
│
◇  Remove? yes
│
◇  Unloading
◇  Deleting plist
◇  Updating registry
│
└  Removed.
```

`<id>` 생략 시 list 에서 선택하게.

### 4.4 `skill-scheduler run <id>`

수동 즉시 실행. 내부적으로 `launchctl start <label>` 호출. 검증 용도.

## 5. Cron → launchd 변환

### 5.1 필드별 허용 표

| Cron 필드 | 허용 | 거부 | launchd 키 |
|---|---|---|---|
| Minute | 단일값, list, range, step (`*/N`) | wildcard `*` | `Minute` |
| Hour | 단일값, list, range, step | wildcard `*` | `Hour` |
| DoM | 단일값, list, range, wildcard | step | `Day` |
| Month | 단일값, list, range, wildcard | step | `Month` |
| DoW | 단일값, list, range, wildcard | step | `Weekday` |

### 5.2 거부 사유

- Minute/Hour 의 `*` 는 60/24 dict 폭발. "정해진 시간에 실행" 의도와 어긋남. step 도 expand 후 dict 수 100 초과면 거부.
- DoM 과 DoW 동시 명시: launchd 는 둘 다 있으면 OR 로 해석. 사용자 의도와 다를 가능성 큼.

### 5.3 Expand 알고리즘

```
1. 5필드인지 우선 확인 (cron-parser 의 special strings/6필드 모드 사용 안 함, special strings 입력 거부)
2. cron-parser 로 각 필드 validate (실패 시 에러 메시지 그대로 노출)
3. 각 필드를 정수 배열로 expand (wildcard 는 sentinel)
4. wildcard 가 아닌 필드들의 곱집합 → dict 배열
5. wildcard 필드는 dict 에서 키 omit
6. 결과 dict 수 > 100 → 에러
```

### 5.4 예시

| Cron | dicts | 비고 |
|---|---|---|
| `0 21 * * 1-5` | 5 (Weekday 1..5, Hour 21, Minute 0) | wrap-up 케이스 |
| `30 9,18 * * *` | 2 (Hour 9/18, Minute 30) | DoW/DoM/Month 키 omit |
| `0 9 * * 1` | 1 (Weekday 1, Hour 9, Minute 0) | 매주 월 9시 |
| `0 * * * *` | 거부 | Hour wildcard |
| `0 9 1 * 1` | 거부 | DoM+DoW 동시 |

## 6. 헤드리스 실행 래퍼

`src/headless-runner.sh` — 모든 plist 가 공통 호출하는 얇은 bash. wrap-up 의 `run-headless.sh` 를 일반화.

```bash
#!/bin/bash
# Invoked by launchd. Reads SS_PROMPT and SS_LOG from environment (set in plist).
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
```

plist 의 `EnvironmentVariables` 로 `SS_PROMPT`, `SS_LOG`, `SS_LABEL` 주입. `ProgramArguments` 는 모든 스케줄에서 동일 (`headless-runner.sh` 절대경로 하나만).

## 7. README 요구사항

`README.md` 는 README-driven 으로 먼저 작성하고, 그 흐름이 실제 동작하도록 구현한다.

### 7.1 포함해야 할 섹션

1. **What** — 1 문단. 스킬을 정해진 시간에 launchd 로 자동 실행.
2. **Why** — wrap-up scheduler 경험에서 일반화한 동기.
3. **Requirements** — macOS, `claude` CLI 설치, bun 1.x, 알림 권한.
4. **Install** — 정확히 복붙해서 따라할 수 있는 명령 3~5 줄. `git clone`, `bun install`, `bun link` (또는 PATH 등록 안내).
5. **Quickstart** — wrap-up 을 평일 21시에 등록하는 예시 1개 처음부터 끝까지.
6. **Commands** — `add`, `list`, `remove`, `run` 각각 한 줄 + 예시 출력 1 screenshot.
7. **Cron support matrix** — Section 5.1 표 그대로.
8. **Files this tool touches** — `~/.config/skill-scheduler/`, `~/Library/LaunchAgents/com.junepil.skill-scheduler.*`, `~/.claude/logs/skill-scheduler/`.
9. **Removal** — 모든 스케줄 unload + 디렉토리 정리 절차.
10. **Troubleshooting** — 알림 권한, claude CLI not found, 인증 만료 시 행동.

### 7.2 작성 원칙

- 5 분 안에 처음 사용자가 첫 스케줄 등록까지 가능해야 한다.
- 모든 명령은 그대로 복붙 가능한 형식.
- 스크린샷은 ascii 박스 (Section 4 의 출력 예시 재활용).
- 영어 우선. 한국어 음역/번역 안 함.

## 8. Failure Modes

| 실패 | 처리 |
|---|---|
| claude CLI not found | exit 127 + 실패 알림. 래퍼가 검증 |
| MCP 인증 만료 | claude 내부에서 에러 → exit != 0 → 실패 알림 |
| 동일 ID add | 사용자에게 새 ID suffix 입력 받음 |
| 이미 등록된 label | `launchctl load` 가 거부 → CLI 가 잡아서 에러 메시지 |
| plist XML 오류 | 우리가 생성하므로 발생 안 함 (snapshot 테스트로 보호) |
| launchctl 권한 거부 | 메시지 그대로 노출, plist 파일은 남김 (사용자가 수동 처리) |

## 9. Test Plan

### Tier

| Tier | 도구 | 대상 | 빈도 |
|---|---|---|---|
| Pure unit | `bun test` | cron expander, plist serializer, label slugify | 모든 푸시 |
| FS unit | `bun test` + tmpdir | skill-discovery, registry I/O | 모든 푸시 |
| Shell integration | bash 스모크 | add → list → remove e2e | 수동 |
| 환경 검증 | 체크리스트 | T1~T5 (wrap-up 과 동등) | 등록 시마다 |

### 핵심 단위 테스트 케이스

- cron: Section 5.4 5케이스 + cron-parser 거부 케이스 1
- plist: snapshot test. wrap-up 의 실제 plist 와 일치 (회귀 방지)
- skill-discovery: temp dir 에 SKILL.md 2개 (user/plugin layout 모사) + symlink 1 + frontmatter 없는 dir 1 → 정확히 2 발견
- registry: 빈 파일 → add → read 일치, 중복 add 거부, remove 후 빈 배열

### 통합 검증 (수동, wrap-up T1~T5 와 동등)

T1 `plutil -lint <plist>` OK
T2 헤드리스 래퍼 단독 실행 → exit 0
T3 `launchctl start <label>` → 정상 실행
T4 `launchctl print` 의 calendar interval 항목 검증
T5 CLAUDE_BIN 깨뜨려 실패 알림 검증

## 10. Open Questions

없음. 진행 가능.
