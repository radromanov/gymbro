# GymBro project context

Last updated: 2026-11-18 (Europe/Sofia).

## Purpose and maintenance

GymBro is a small, long-running Node.js service that automatically books Octiv gym sessions 14 calendar days ahead and sends push notifications through ntfy. There is no web UI, HTTP server, database, or persistent booking history. An explicit one-off diagnostic runner can retain redacted evidence in ignored local JSONL logs.

Read `AGENTS.md` first. Every coherent project change must update this file in the same change set, including a dated entry below. Keep the sections describing current behavior accurate; the change log alone is insufficient when behavior changes. Source code is authoritative when documentation and implementation disagree. Keep secrets out of this file.

## Stack, commands, and repository boundaries

- TypeScript, native ESM (`package.json` has `type: module`), Node built-in `fetch`, Luxon, dotenv, and TypeBox. Source imports use `.js` extensions for compiled ESM.
- `package.json`: `build` runs `tsc`; `test` runs `vitest run`; `book` builds and starts `dist/index.js`.
- `tsconfig.json` targets ES2024, NodeNext modules with node16 resolution, strict checking, unused-local/parameter checks, and no switch fallthrough. Input is `src/**/*`, output is `dist/`; `tests/`, `dist/`, and `node_modules/` are excluded. Tests inside `src/` would still be compiler inputs.
- The compiler configuration describes Node LTS 24; no `engines` restriction is declared. The inspection environment has Node v24.22.1.
- Lockfile v3 has 129 package entries. Direct locked runtime versions: dotenv 18.0.5, luxon 3.7.2, typebox 1.3.34. Direct development versions: TypeScript 7.0.2, Vitest 3.2.7, @types/node 26.6.4, @types/luxon 3.7.6. Consult the lockfile after dependency changes.
- `.gitignore` excludes `.env`, `node_modules`, `dist`, and `logs/`. Diagnostic logs are local operational artifacts and must never contain credentials or account identifiers.
- Run the service from the repository root: both `./skip-dates.txt` and default dotenv loading depend on the process working directory.
- No CI workflow, deployment definition, linter, formatter configuration, container definition, or Git hook is present in the inspected project files. Deployment/supervision is not specified here.
- Do not run `npm run book`, execute `dist/index.js`, or import `src/index.ts` for routine validation: these start the live scheduler.

## Configuration and external services

`src/config.ts` imports `dotenv/config`, compiles a TypeBox schema, and exposes `loadEnv()`. All six fields are required strings: `API_URL`, `MYGYM_EMAIL`, `MYGYM_PASS`, `TENANT_ID`, `LOCATION_ID`, and `NTFY_TOPIC`. There are no application defaults or stronger URL/email/non-empty checks. Multiple modules call `loadEnv()` at import time, so importing even scheduler utilities requires valid environment configuration. Use dummy environment values and mocked fetch for isolated tests.

- `API_URL`: base URL concatenated directly with API paths; keep slash handling in mind.
- `MYGYM_EMAIL` / `MYGYM_PASS`: Octiv login credentials.
- `TENANT_ID` / `LOCATION_ID`: schedule filters.
- `NTFY_TOPIC`: topic used at `https://ntfy.sh/<topic>`. The vendor uses this fixed host and supplies no authentication header.

`.env` exists locally and was intentionally not read during this inspection. Never document its values or log authentication responses.

## File map

| File | Responsibility |
| --- | --- |
| `src/index.ts` | Instantiates ntfy, prepares API sessions, validates the positional session against the requested date/time, interprets booking responses by status, connects retries to the cycle, logs cycle summaries, and immediately starts the endless scheduler. Top-level catch logs and exits with code 1. |
| `src/logger.ts` | `logger.info/warn/error`: console output prefixed with a Sofia-local `yyyy-MM-dd HH:mm:ss.SSS` timestamp. Used by the scheduler, core default log, and API modules (not the diagnostic CLI, which writes its own JSONL). |
| `src/core.ts` | Dependency-injected cycle timing, weekday/skip handling, preparation/attempt separation, tomorrow sleep, and retry loop. Exports scheduler/result/dependency types, booking-slot constants, and the shared retry policy (`RETRY_INTERVAL_MS` 250, `RETRY_DURATION_MS` 4,000). |
| `src/diagnostic.ts` | Dependency-injected one-off opening runner and allowlisted booking response evidence; uses existing retry policy. |
| `src/diagnose-booking.ts` | Explicit live diagnostic CLI; prepares a single validated date/time, observes HTTP timing/status/server Date, and writes redacted JSONL without starting the normal scheduler or sending notifications. |
| `tests/diagnostic.test.ts` | Mocked winter/summer timing, skips, lateness, retry outcomes, and response redaction coverage. |
| `src/skip-dates.ts` | Env-free parsing/matching of skip-file lines: single `dd-MM-yyyy` dates and inclusive ranges. |
| `tests/core.test.ts` | Mocked recurring-cycle coverage: 19:00/19:30 attempts (18:55/19:25 preparation) in both winter and summer, passed attempt time, skipped date, weekend sleep, failed preparation continuing to the next slot; `retryBooking` deadline/last-response, success logging, and non-retryable stop. |
| `tests/skip-dates.test.ts` | Single-date, inclusive range, month/year/DST boundary, and invalid-line coverage for skip entries. |
| `src/config.ts` | dotenv loading and required environment validation. |
| `src/utils.ts` | API HTTP helper, common request headers, Sofia/14-day constants, sleep/date/time helpers, skip-file scanning, and positional session selection. |
| `src/api/index.ts` | `API` facade exposing `Login`, `GetMe`, `GetSchedule`, and `Book`. |
| `src/api/login.ts` | POST `/login` with credentials; includes hard-coded `Content-Length: 83`; sleeps 3 seconds after success. |
| `src/api/me.ts` | GET `/users/me` with bearer token; sleeps 3 seconds after success. |
| `src/api/schedule.ts` | GET `/class-dates` for the caller-supplied booking date (`yyyy-MM-dd`) with tenant/location/date/session filters and included bookings/waiting list; requests all results; sleeps 3 seconds after success. |
| `src/api/book.ts` | POST `/class-bookings` with `classDateId` and `userId`; logs caught errors (via `logger.error`, raw error object) and wraps them in `BookError`. |
| `src/api/interfaces.ts` | Compile-time API payload/response shapes, class/slot/schedule interfaces, and a discriminated `BookingResult` union. No response validation. |
| `src/errors.ts` | `AppError`, its JSON serialization, and Method/Login/Session/Schedule/Book/Vendor error classes. |
| `src/notifications/vendor.ts` | `Vendors` enum (`Ntfy`, `None`), `Priority` (`low`/`default`/`high`), `IVendor`, and abstract `Vendor` with optional priority; no implementation of the `None` option. |
| `src/notifications/vendors/ntfy.ts` | POSTs notification text to ntfy with `GymBro | ` title prefix, caller priority (default `high`), 10-second abort timeout, and non-OK response rejection. |
| `skip-dates.txt` | Booking dates excluded by the scheduler: `dd-MM-yyyy` single dates or inclusive `dd-MM-yyyy..dd-MM-yyyy` / `dd-MM-yyyy to dd-MM-yyyy` ranges. |
| `README.md` | Project title and entry points for agent documentation. |
| `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore` | Commands/dependency declarations, reproducible dependency graph, compiler settings, and ignored local artifacts. |
| `AGENTS.md`, `PROJECT_CONTEXT.md` | Mandatory agent workflow and this maintained project map. |

## Runtime flow and timing contracts

1. Importing `src/index.ts` creates an `NtfyVendor` and invokes `scheduler()`. It loops through `runBookingCycle()` and then sleeps until the next Sofia midnight for processed or skipped cycles. Weekend cycles already sleep until Monday and loop immediately afterward.
2. The cycle converts the injected clock to `Europe/Sofia`. Saturday/Sunday cycles sleep until Monday 00:00 without preparation or booking. This check uses the current day. With a 14-day horizon the intended booking date has the same weekday.
3. The cycle computes the booking date as Sofia start-of-day plus 14 **calendar days**, formatted `dd-MM-yyyy`, and logs it. The skip file is **not** read at midnight: each slot checks it once, right before preparation (18:55 / 19:25); it is not read in the timing-critical moment before booking, so an edit made after a slot's preparation applies from the next slot. A match logs, sends `Booking Skipped` at `default` priority, skips all remaining slots, and returns `skipped` (with any already attempted slots); the outer scheduler sleeps until tomorrow. An unreadable skip file sends `Booking Error`, does not book that slot, and the next slot checks again.
4. Booking slots are `18:00` and `18:30`. Attempt times are currently **19:00 and 19:30 in both winter and summer**. The core selects a row based on the current Sofia DST status, but both rows currently contain identical times. Do not infer winter times from old tests or comments.
5. Slots run sequentially. At each slot, a target at today's attempt time is calculated. If the time is already reached (`target <= now`), the slot is skipped with only a log line. Preparation is scheduled five minutes before the target (18:55 / 19:25). Starting within those five minutes prepares immediately.
6. Preparation logs in and fetches the user ID (`authenticate()` in `index.ts`), fetches the schedule for the cycle's booking date, and selects the session. Login/profile are reused by a later slot of the same booking date when the login's `expiresIn` (assumed seconds) leaves more than 15 minutes; otherwise, or when `expiresIn` is missing, it logs in again. The schedule is always fetched fresh. Each API operation adds a 3-second sleep (logged before the sleep). The positionally selected session must have the booking date (`yyyy-MM-dd`) and `HH:mm` start time; otherwise preparation throws `SessionError`. Preparation returns a closure; it must not book anything itself. Any preparation exception is caught per slot: logged, `Booking Error` push (`<dd-MM-yyyy> <slot>: preparation failed: ...`), and the cycle continues with the next slot.
7. The clock is re-read after preparation. Finishing strictly after target sends `Booking Missed`; equality is allowed. Otherwise, if the prepared closure has `warmUp` (the scheduler's does: a GET `/users/me` with the same token), the cycle waits until 2 s before target (`WARMUP_LEAD_MS`) and starts it without awaiting, so the booking POST can reuse a keep-alive connection. It then waits for the target with the injected `waitUntil` (scheduler: sleep until 30 ms before, then busy-wait to the exact millisecond; never early), records the fire time, and calls the closure with no logging in between. After the result it logs `fired at HH:mm:ss.SSS (+N ms after target; warm-up <status>)` and the result, then sends the push. There is no second lateness guard after the final wait.
8. The closure calls `retryBooking()` with the shared policy: 250 ms interval, 4,000 ms duration (raised from 1,500 ms on 2026-11-18 to match the diagnostic). Attempts are sequential, scheduled against the initial timestamp, starting immediately. With instantaneous failures, attempts occur at 0, 250, ..., 3,750 ms (16 attempts); no new attempt starts at or after the deadline. Slow requests can overrun the deadline; it is not a request timeout. If an attempt runs past an interval, a subsequent eligible attempt can begin immediately.
9. A response containing `message` is a retryable rejection (result message is the API reason). Otherwise `status.name` decides: `BOOKED` is success (`Session Booked`); `WAITING` returns `Waiting List` and any other status `Booking Unconfirmed`, both with `retryable: false`, so `retryBooking()` returns immediately without another POST. Exhausting retries returns `<dd-MM-yyyy> <slot>: No success within 4 s (N attempts). Last response: <reason>`. A thrown booking exception aborts retries. Retry log lines are prefixed `Slot HH:mm:` and are written only after each response, with send offset and round-trip time (`Attempt #n (+X ms, Y ms round trip) ...`).
10. Exceptions during preparation, the attempt, or its first result notification are caught per slot and trigger `Booking Error`. Skip-file read errors are handled per slot (see 3). Notification failures from those catch blocks are not caught. Unhandled errors reach the top-level catch and terminate the process. There is no internal restart/backoff or token refresh.
11. Logging: every line is timestamped. Each cycle logs the booking date, per-slot wait/prepare/book steps and the final result line (`Slot HH:mm: <title>: <message>`); the outer loop logs `Cycle done for <date>; slots attempted: ...` and `Sleeping until <yyyy-MM-dd HH:mm>.` User-facing push messages use `dd-MM-yyyy HH:mm`.

`CycleResult` reports `weekend`, `skipped`, or `processed`; `attemptedSlots` means a closure was invoked, not that booking succeeded. `success` is used by retry logic; notification titles/messages carry the user-facing result.

## Data and helper assumptions

- API bearer tokens are passed in memory; login's refresh token and expiry are not used.
- `hit<T>()` supports only GET/POST/PUT, supplies browser-like Octiv headers and JSON content type, adds query parameters only to GET, and JSON-encodes bodies for POST/PUT. It casts parsed JSON to `T` without checking HTTP status, shape, or applying a request timeout.
- `ISchedule.data` is assumed to contain 48 half-hour entries in chronological order from midnight. `getSession()` indexes `hour * 2 + (minute !== 0 ? 1 : 0)`; it does not search, validate time/date, check array bounds, availability, capacity, or waiting-list counts.
- Slot dates and API date filters use `yyyy-MM-dd`; skip dates and cycle reporting use `dd-MM-yyyy`; slot times use `HH:mm` / API `HH:mm:ss` strings. Interface comments label some times `HH-MM-SS`, but examples/code use colons.
- `schedule()` takes the booking date from its caller (scheduler: the cycle's `bookingDate`; diagnostic: its validated CLI date), so there is a single date source.
- `processFileLineByLine()` ignores empty lines and every line containing `#` anywhere, trims the rest, and returns true on the first matching callback. Both the scheduler and diagnostic CLI pass each line to `skipEntryMatches()` (`src/skip-dates.ts`). A line is a single date or an inclusive range (`..` or case-insensitive `to`, optional spaces); ranges are compared, never expanded, so weekend days inside a range need no handling (weekend cycles never query skips). Impossible dates, other formats (including `a - b`), and reversed ranges never match and emit a `console.warn` on every check; they do not stop the scheduler. An inline comment discards the entire line. A missing/unreadable file fails the operation (the scheduler handles this per slot). Edits apply to any slot whose checks have not yet run.
- Initial skip-file contents exclude `23-10-2026` and `04-11-2026`; these are booking dates, not scheduler execution dates. Read the file for current exclusions.
- `getNextBookingDate()` computes the formatted future Sofia date; `getTimeInMs()` validates `HH:mm` and returns today's Sofia timestamp. Neither is used by the current scheduler entry point. `sleep()` is a simple `setTimeout` promise.
- `AppError` sets its prototype explicitly to `AppError.prototype`, including when constructed through subclasses. Subclass names are assigned, but subclass `instanceof` behavior is therefore unreliable. Its JSON output includes name, message, and stack.
- `BookingResult` is separately defined in `core.ts` (boolean success) and `api/interfaces.ts` (true/false union). They are structurally compatible today; keep them aligned when changing result contracts.

## Verification and known gaps

### One-off live diagnostic

After building, run `node dist/diagnose-booking.js <opening-ISO-with-offset> <booking-yyyy-MM-dd> <slot-HH:mm>` from the repository root. This is an explicitly live booking command. It requires a future opening and a booking date exactly 14 Sofia calendar days later. It prepares five minutes ahead, honors/rechecks skip dates, validates the existing positional selection against the requested date/time, refuses an occupied slot, and stops after one opening. It does not apply the recurring scheduler's weekday rules. Regular scheduling and HTTP behavior remain unchanged.

Logs are `logs/booking-yyyyMMdd-HHmmss.jsonl` (opening in Sofia). Evidence includes request start/response times, status/server Date, session date/time/threshold, and each retry result. Request bodies, full URLs, auth/profile responses, tokens, and account/session IDs are never persisted. Only the known advance-booking rejection and BOOKED/WAITING status names are retained from booking bodies; other arbitrary server text is omitted. Only explicit BOOKED counts as success; ambiguous/waiting responses stop without duplicate POSTs. The diagnostic uses the shared 250 ms / 4,000 ms retry policy (up to 16 attempts); the final deadline message includes the last allowlisted response. Its `armed` log reports the shared constants. The post-wake guard still refuses to start 1,500 ms or more after opening; per-attempt evidence preserves the rejection. No post-window probes or automatic extra retries occur. There is no request timeout or machine-sleep prevention.

2026-11-03 diagnostic verification: direct TypeScript build and final no-emit check passed; Vitest passed all 11 tests in `tests/diagnostic.test.ts`, using mocked dependencies and no live services. The earlier no-tests baseline below describes the previous inspection, not current coverage. The user-authorized live run successfully booked 2026-11-17 06:30 on the first attempt: POST began at 2026-11-03 07:30:00.013 +02:00; HTTP 201 returned at 07:30:00.281, followed by explicit BOOKED confirmation at 07:30:00.283. The process exited 0 and is no longer running. The advance-booking rejection was not reproduced, so its cause remains undetermined. Restricted-network preparation initially failed with ENOTFOUND; network-enabled login/profile/schedule then succeeded and validated the unoccupied requested session at 07:26. Evidence is retained in `logs/booking-20261103-073000.jsonl`. This one successful observation does not establish that recurring bookings are fixed; recurring code was unchanged.

Inspection covered all maintained source files, repository documentation/configuration/operational data, the lockfile dependency graph, Git status, and the staged-but-deleted test described below. Generated `dist/`, third-party `node_modules/`, Git internals, and secret `.env` contents are outside the maintained-source review.

Baseline checks on 2026-11-03:

- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node node_modules/vitest/vitest.mjs run`: exit 1, **no test files found** in the working tree. This is a coverage gap, not a passing test run.
- `npm` and `npx` were unavailable on this tool shell's PATH; the installed package entry points above provide equivalent direct checks without installing anything.
- No live API call, booking, notification, or scheduler execution was performed.

For future changes, normally use `npm ci` if dependencies need installation, `npm run build` or `npx tsc --noEmit`, and `npm test`. If npm is unavailable but dependencies already exist, use the direct Node commands above. Type checking needs no live configuration; runtime imports of core/utils currently do. Mock clocks, sleeps, API responses, skip checks, and notification delivery. Timing changes warrant coverage of summer/winter, weekends, skip dates, startup after opening, late preparation, retry intervals/deadlines/success/throws, and midnight boundaries. HTTP changes warrant mocked error/status/response-shape checks.

Existing limitations to consider when touching related code: hard-coded login content length; unchecked/unbounded API requests; positional session selection (now validated, but a mismatch fails the slot instead of searching); fatal notification errors; token reuse relies on the unverified assumption that `expiresIn` is seconds and that a token stays usable after a booking; no durable deduplication across concurrent processes or restarts. These are observations, not changes authorized or implemented by this documentation task.

## Existing work at initial inspection

The checkout was already dirty. Staged changes existed in `package.json`, `package-lock.json`, `src/core.ts` (new), `src/index.ts`, `src/utils.ts`, and `src/scheduler.test.ts` (new in index). `src/index.ts` also had unstaged changes. `src/scheduler.test.ts` was deleted in the working tree while its addition remained staged (`AD`). Preserve that distinction; do not restore or stage it without an appropriate task.

The staged test was read with `git show :src/scheduler.test.ts`. It contains eight fake-clock tests for summer/winter cycle scheduling, past openings, skipped dates, weekends, late preparation, retry deadline, and retry success. Its winter expectations are 18:00/18:30, whereas current source uses 19:00/19:30. It is historical/pending material, not active coverage. It imports core/utils, which transitively load environment configuration.

These notes record the initial handoff, not a permanent claim about future Git status. Always inspect the current working tree and actual test files.

## Change log

### 2026-11-19 — Minimal-overhead booking fire

- User wants the booking request sent as close to the target as possible. Added `waitUntil()` (sleep to 30 ms before, then busy-wait) and an optional `PreparedBooking.warmUp`; the scheduler starts a non-awaited GET `/users/me` 2 s before target so the POST avoids DNS/TCP/TLS on a cold connection (previous idle gap of ~5 min exceeded keep-alive). Removed all logging between the wait and the POST; retry attempts log after each response with send offset and round trip; the cycle logs actual fire time and lateness. One extra authenticated GET per slot.
- Validation (Linux scratch copy): `tsc --noEmit` passed; Vitest 37/37 (new: busy-wait never fires early and lands within 1 ms of target under a late timer; warm-up at T-2 s and booking exactly at T). Real-clock check on the Linux VM: plain `setTimeout` 0–1 ms late, `waitUntil` 0 ms late over 10 runs. Windows timer behaviour and real connection reuse were not measured; the new `fired at ... warm-up ...` and round-trip log fields will show them on the next live run. No live services.
- Diagnostic CLI unchanged (no warm-up/busy-wait). Client clock accuracy is now the dominant error source and is not handled by the program.

### 2026-11-19 — Skip file checked only at preparation

- Removed the scheduler's skip recheck immediately before booking (user request): it put file I/O in front of the first POST. Each slot now reads `skip-dates.txt` once, before preparation. The diagnostic CLI is unchanged and still rechecks at opening.
- Validation (Linux scratch copy): `tsc --noEmit` passed; Vitest 35/35 (replaced the post-preparation-skip test with one asserting checks only at 18:55/19:25). No live services; no architectural change.

### 2026-11-19 — Late skip checks, login reuse, single schedule date

- Skip file is checked before each slot's preparation and again before booking instead of at 00:00, so same-day edits apply and the `Booking Skipped` push arrives around 18:55 at `default` priority (other pushes stay `high`). A skip mid-cycle stops remaining slots; `skipped` results now carry `attemptedSlots`. Unreadable skip file: `Booking Error`, slot not booked, next slot rechecks. Added notification priority to `IVendor`/`Vendor`/ntfy and `SchedulerDependencies.notify`.
- `index.ts` reuses login/profile for the second slot of the same booking date while the token has >15 min left (`expiresIn`, assumed seconds); schedule is refetched. Saves ~6 s and two requests per slot in the normal case.
- `API.GetSchedule(accessToken, date)` now takes the booking date; scheduler and diagnostic pass theirs, removing the separate 14-day calculation.
- Outer loop logs the cycle summary for skipped cycles too.
- Validation (Linux scratch copy): `tsc --noEmit` passed; Vitest 35/35 (core.test.ts gained skip-timing, mid-cycle skip, post-preparation skip, and unreadable-file tests). Scratch fake-clock simulation of real `index.ts` (mocked config/`hit`/ntfy, Thu 2026-11-19 to Mon 2026-11-23) showed login reuse with a 1 h token, fresh login with a 10 min token, skip push at 18:55 default priority, weekend sleep. No live services.
- Unverified: real `expiresIn` unit and whether the API accepts a reused token 35 minutes later (if not, the 18:30 retries fail with the API's message).

### 2026-11-18 — Booking result, session validation, retry window, and logging fixes

- Bugs fixed: (1) waiting-list responses no longer report `Session Booked`; only `BOOKED` succeeds, `WAITING`/unknown statuses are non-retryable (`BookingResult.retryable: false`, added to both the core and `api/interfaces.ts` result types) so no duplicate POST. (2) Recurring scheduler retry window raised from 1,500 to 4,000 ms via shared `RETRY_INTERVAL_MS`/`RETRY_DURATION_MS`, also used by the diagnostic (fixes its stale `armed` log value); deadline message keeps the last response. (3) `prepareBooking` validates the positional session's date/start time; preparation failures are caught per slot with a `Booking Error` push instead of crashing the process.
- Logging: new `src/logger.ts` timestamps all scheduler/API lines; success, per-slot result, cycle summary, and midnight sleep are logged; slot-prefixed retry lines carry only the API reason; push messages use `dd-MM-yyyy HH:mm`; clearer slot step wording; "Me succesful" typo removed; API success lines are logged before the 3 s sleeps.
- Validation (Linux scratch copy after `npm ci`; the checkout's `node_modules` has Windows-native binaries): `tsc --noEmit` passed; Vitest 32/32 passed across 3 files. A scratch-only fake-clock simulation imported the real `src/index.ts` with mocked config, `hit`, and ntfy over Thu 2026-11-19 to Tue 2026-11-24: confirmed booked-after-retries, waiting-list stop, skip, weekend, 4 s deadline, and schedule-mismatch preparation failure output. No live API, booking, or notification.
- Not changed: midnight skip push priority, skip decision at 00:00, repeated preparation for the second slot, `schedule()` date computation, `book.ts` raw error logging, diagnostic post-wake 1,500 ms guard.

### 2026-11-18 — Tests for 4,000 ms diagnostic retries and recurring timing

- User confirmed the `src/diagnostic.ts` change to `maxDurationMs: 4000` is intentional, and that winter and summer both attempt at 19:00/19:30. Updated `tests/diagnostic.test.ts` to expect 16 attempts at 0–3,750 ms. Added `tests/core.test.ts` (mocked `utils.js`, no env/live services) covering both seasons' 18:55/19:25 preparation and 19:00/19:30 attempts, the 14-day booking date, passed attempt time, skipped date, and weekend sleep. Tests only; no source or architectural change.
- Validation (Linux scratch copy, same reason as below): `tsc --noEmit` passed; Vitest 28/28 passed across 3 files.
- Remaining: the diagnostic's `armed` log still says `retryDurationMs: 1500`, which no longer matches the 4,000 ms window.

### 2026-11-18 — Date ranges in skip-dates.txt

- Added `src/skip-dates.ts` with `parseSkipEntry()`/`skipEntryMatches()`; `src/index.ts` and `src/diagnose-booking.ts` now use it instead of exact string equality. Single-date lines behave as before. Inclusive ranges (`dd-MM-yyyy..dd-MM-yyyy` or `... to ...`) are supported by comparison, not expansion. Invalid lines warn and never match. Documented syntax in `skip-dates.txt` comments (CRLF preserved; user's pending `26-11-2026` entry kept).
- Why: user wanted to skip spans (e.g. holidays) without listing each day. Weekend days inside ranges need no processing because the scheduler never computes booking dates on weekends.
- Validation: the checkout's `node_modules` contains Windows-native TypeScript/Rollup binaries, so checks ran in a Linux scratch copy after `npm ci`. `tsc --noEmit` passed. Vitest: 12/12 new skip-date tests passed; 2 of 11 diagnostic tests failed ("preserves local opening and retry bounds", both seasons: expected 6 attempts, got 16). That failure comes from the user's pre-existing unstaged `src/diagnostic.ts` change raising `maxDurationMs` from 1500 to 4000, not from this task; left untouched. No live services, scheduler, or bookings run.
- Limitations: warnings for invalid lines repeat every weekday cycle; no architectural change beyond the new pure module.

### 2026-11-03 — One-off booking evidence capture

- Added a separate, explicit live diagnostic CLI for the user-requested upcoming 06:30 session, without changing the recurring scheduler or its timing. Added ignored local redacted JSONL logs for transport timing/status, selected session thresholds, and booking outcomes.
- Preserved preparation/attempt separation and existing retry cadence; added target/date validation, skip recheck, occupied-slot refusal, and safe stopping on ambiguous booking responses. No external notifications are sent by this runner.
- Validation: `node node_modules/typescript/bin/tsc` and final `node node_modules/typescript/bin/tsc --noEmit` passed; `node node_modules/vitest/vitest.mjs run` passed all 11 mocked diagnostic tests, including the final run. Git diff whitespace check passed (only a line-ending conversion notice). Initial 07:25 preparation stopped on restricted-network DNS failure before any booking; added allowlisted transport error codes. Network-enabled preparation succeeded at 07:26. The live POST at 07:30:00.013 +02:00 returned HTTP 201 and explicit BOOKED at 07:30:00.283 for the requested November 17 06:30 session. One attempt, process exit 0; no regular scheduler or ntfy notifications started.
- The reported advance-booking failure was not reproduced and its cause remains undetermined. Evidence is retained locally at `logs/booking-20261103-073000.jsonl`; no credentials/account identifiers were logged. Existing unbounded HTTP requests and short retry window remain observation limitations. The architecture adds only the optional diagnostic CLI; production scheduling and transport were not changed.
- Repository was clean at the start of this task; the previous inspection's pending-work notes are historical. No existing files were staged, restored, or committed.

### 2026-11-03 — Establish maintained AI project context

- Inspected the maintained codebase and documented purpose, file responsibilities, runtime flow, configuration, date/time and API contracts, side effects, known limitations, pending work, and verification commands/results.
- Added root `AGENTS.md` requiring context reads and an update after each coherent change, with a final diff-to-context check and completion requirement. This is an agent instruction, with no installed CI/hook enforcement.
- Linked agent documentation from `README.md`. Application behavior and existing staged/unstaged work were preserved.
- Validation: TypeScript no-emit check passed; Vitest found no working-tree tests (exit 1). Documentation links and Git diff were checked. No live services were invoked.
