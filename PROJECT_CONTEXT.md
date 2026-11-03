# GymBro project context

Last updated: 2026-11-03 (Europe/Sofia).

## Purpose and maintenance

GymBro is a small, long-running Node.js service that automatically books Octiv gym sessions 14 calendar days ahead and sends push notifications through ntfy. There is no web UI, HTTP server, database, or persistent booking history in this repository.

Read `AGENTS.md` first. Every coherent project change must update this file in the same change set, including a dated entry below. Keep the sections describing current behavior accurate; the change log alone is insufficient when behavior changes. Source code is authoritative when documentation and implementation disagree. Keep secrets out of this file.

## Stack, commands, and repository boundaries

- TypeScript, native ESM (`package.json` has `type: module`), Node built-in `fetch`, Luxon, dotenv, and TypeBox. Source imports use `.js` extensions for compiled ESM.
- `package.json`: `build` runs `tsc`; `test` runs `vitest run`; `book` builds and starts `dist/index.js`.
- `tsconfig.json` targets ES2024, NodeNext modules with node16 resolution, strict checking, unused-local/parameter checks, and no switch fallthrough. Input is `src/**/*`, output is `dist/`; `tests/`, `dist/`, and `node_modules/` are excluded. Tests inside `src/` would still be compiler inputs.
- The compiler configuration describes Node LTS 24; no `engines` restriction is declared. The inspection environment has Node v24.22.1.
- Lockfile v3 has 129 package entries. Direct locked runtime versions: dotenv 18.0.5, luxon 3.7.2, typebox 1.3.34. Direct development versions: TypeScript 7.0.2, Vitest 3.2.7, @types/node 26.6.4, @types/luxon 3.7.6. Consult the lockfile after dependency changes.
- `.gitignore` excludes `.env`, `node_modules`, and `dist`. These are local configuration, installed dependencies, and generated output, respectively; they are not maintained application source.
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
| `src/index.ts` | Instantiates ntfy, prepares API sessions, interprets booking responses, connects retries to the cycle, and immediately starts the endless scheduler. Top-level catch logs and exits with code 1. |
| `src/core.ts` | Dependency-injected cycle timing, weekday/skip handling, preparation/attempt separation, tomorrow sleep, and retry loop. Exports scheduler/result/dependency types and booking-slot constants. |
| `src/config.ts` | dotenv loading and required environment validation. |
| `src/utils.ts` | API HTTP helper, common request headers, Sofia/14-day constants, sleep/date/time helpers, skip-file scanning, and positional session selection. |
| `src/api/index.ts` | `API` facade exposing `Login`, `GetMe`, `GetSchedule`, and `Book`. |
| `src/api/login.ts` | POST `/login` with credentials; includes hard-coded `Content-Length: 83`; sleeps 3 seconds after success. |
| `src/api/me.ts` | GET `/users/me` with bearer token; sleeps 3 seconds after success. |
| `src/api/schedule.ts` | GET `/class-dates` for the date 14 days ahead with tenant/location/date/session filters and included bookings/waiting list; requests all results; sleeps 3 seconds after success. |
| `src/api/book.ts` | POST `/class-bookings` with `classDateId` and `userId`; logs caught errors and wraps them in `BookError`. |
| `src/api/interfaces.ts` | Compile-time API payload/response shapes, class/slot/schedule interfaces, and a discriminated `BookingResult` union. No response validation. |
| `src/errors.ts` | `AppError`, its JSON serialization, and Method/Login/Session/Schedule/Book/Vendor error classes. |
| `src/notifications/vendor.ts` | `Vendors` enum (`Ntfy`, `None`), `IVendor`, and abstract `Vendor`; no implementation of the `None` option. |
| `src/notifications/vendors/ntfy.ts` | POSTs notification text to ntfy with `GymBro | ` title prefix, high priority, 10-second abort timeout, and non-OK response rejection. |
| `skip-dates.txt` | Booking dates excluded by the scheduler, in `dd-MM-yyyy` format. |
| `README.md` | Project title and entry points for agent documentation. |
| `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore` | Commands/dependency declarations, reproducible dependency graph, compiler settings, and ignored local artifacts. |
| `AGENTS.md`, `PROJECT_CONTEXT.md` | Mandatory agent workflow and this maintained project map. |

## Runtime flow and timing contracts

1. Importing `src/index.ts` creates an `NtfyVendor` and invokes `scheduler()`. It loops through `runBookingCycle()` and then sleeps until the next Sofia midnight for processed or skipped cycles. Weekend cycles already sleep until Monday and loop immediately afterward.
2. The cycle converts the injected clock to `Europe/Sofia`. Saturday/Sunday cycles sleep until Monday 00:00 without preparation or booking. This check uses the current day. With a 14-day horizon the intended booking date has the same weekday.
3. The cycle computes the booking date as Sofia start-of-day plus 14 **calendar days**, formatted `dd-MM-yyyy`, and checks the skip file once before processing slots. A match sends `Booking Skipped`, returns `skipped`, and the outer scheduler sleeps until tomorrow.
4. Booking slots are `18:00` and `18:30`. Attempt times are currently **19:00 and 19:30 in both winter and summer**. The core selects a row based on the current Sofia DST status, but both rows currently contain identical times. Do not infer winter times from old tests or comments.
5. Slots run sequentially. At each slot, a target at today's attempt time is calculated. If the time is already reached (`target <= now`), the slot is silently skipped except for a log. Preparation is scheduled five minutes before the target (18:55 / 19:25). Starting within those five minutes prepares immediately.
6. Preparation logs in, fetches the user ID, fetches the future schedule, and selects the session. Those first three API operations each add a 3-second sleep. Preparation returns a closure; it must not book anything itself. Each slot gets fresh credentials/profile/schedule through its own preparation.
7. The clock is re-read after preparation. Finishing strictly after target sends `Booking Missed`; equality is allowed. Otherwise the cycle sleeps to target, records the slot in `attemptedSlots`, calls the closure, and sends its result notification. There is no second lateness guard after that final sleep.
8. The closure calls `retryBooking()`. Default/configured interval is 250 ms and duration is 1,500 ms. Attempts are sequential, scheduled against the initial timestamp, starting immediately. With instantaneous failures, attempts occur at 0, 250, 500, 750, 1,000, and 1,250 ms; no new attempt starts at or after the deadline. Slow requests can overrun the deadline; it is not a request timeout. If an attempt runs past an interval, a subsequent eligible attempt can begin immediately.
9. A response without a `message` property is currently treated as successful. Any response containing `message` becomes a retryable rejection. Booking status is not examined, so waiting-list responses can be reported as success. Exhausting retries returns a generic deadline message, replacing the last API rejection reason. A thrown booking exception aborts retries.
10. Exceptions during the attempt or its first result notification are caught in the per-slot block and trigger `Booking Error`. Preparation, skip handling, and their notifications are outside that block. Unhandled errors, including a failed error notification, reach the top-level catch and terminate the process. There is no internal restart/backoff or token refresh.

`CycleResult` reports `weekend`, `skipped`, or `processed`; `attemptedSlots` means a closure was invoked, not that booking succeeded. `success` is used by retry logic; notification titles/messages carry the user-facing result.

## Data and helper assumptions

- API bearer tokens are passed in memory; login's refresh token and expiry are not used.
- `hit<T>()` supports only GET/POST/PUT, supplies browser-like Octiv headers and JSON content type, adds query parameters only to GET, and JSON-encodes bodies for POST/PUT. It casts parsed JSON to `T` without checking HTTP status, shape, or applying a request timeout.
- `ISchedule.data` is assumed to contain 48 half-hour entries in chronological order from midnight. `getSession()` indexes `hour * 2 + (minute !== 0 ? 1 : 0)`; it does not search, validate time/date, check array bounds, availability, capacity, or waiting-list counts.
- Slot dates and API date filters use `yyyy-MM-dd`; skip dates and cycle reporting use `dd-MM-yyyy`; slot times use `HH:mm` / API `HH:mm:ss` strings. Interface comments label some times `HH-MM-SS`, but examples/code use colons.
- `schedule()` computes its own date from the real clock, adding 14 days before setting the Sofia zone. It does not accept the cycle's `bookingDate` or injected clock. These paths can diverge near midnight, host-zone/DST boundaries, or long delays.
- `processFileLineByLine()` ignores empty lines and every line containing `#` anywhere, trims the rest, and returns true on the first matching callback. An inline comment discards the entire line. A missing/unreadable file fails the operation. Changes made after a cycle's skip check are not rechecked for its later slot.
- Initial skip-file contents exclude `23-10-2026` and `04-11-2026`; these are booking dates, not scheduler execution dates. Read the file for current exclusions.
- `getNextBookingDate()` computes the formatted future Sofia date; `getTimeInMs()` validates `HH:mm` and returns today's Sofia timestamp. Neither is used by the current scheduler entry point. `sleep()` is a simple `setTimeout` promise.
- `AppError` sets its prototype explicitly to `AppError.prototype`, including when constructed through subclasses. Subclass names are assigned, but subclass `instanceof` behavior is therefore unreliable. Its JSON output includes name, message, and stack.
- `BookingResult` is separately defined in `core.ts` (boolean success) and `api/interfaces.ts` (true/false union). They are structurally compatible today; keep them aligned when changing result contracts.

## Verification and known gaps

Inspection covered all maintained source files, repository documentation/configuration/operational data, the lockfile dependency graph, Git status, and the staged-but-deleted test described below. Generated `dist/`, third-party `node_modules/`, Git internals, and secret `.env` contents are outside the maintained-source review.

Baseline checks on 2026-11-03:

- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node node_modules/vitest/vitest.mjs run`: exit 1, **no test files found** in the working tree. This is a coverage gap, not a passing test run.
- `npm` and `npx` were unavailable on this tool shell's PATH; the installed package entry points above provide equivalent direct checks without installing anything.
- No live API call, booking, notification, or scheduler execution was performed.

For future changes, normally use `npm ci` if dependencies need installation, `npm run build` or `npx tsc --noEmit`, and `npm test`. If npm is unavailable but dependencies already exist, use the direct Node commands above. Type checking needs no live configuration; runtime imports of core/utils currently do. Mock clocks, sleeps, API responses, skip checks, and notification delivery. Timing changes warrant coverage of summer/winter, weekends, skip dates, startup after opening, late preparation, retry intervals/deadlines/success/throws, and midnight boundaries. HTTP changes warrant mocked error/status/response-shape checks.

Existing limitations to consider when touching related code: hard-coded login content length; unchecked/unbounded API requests; positional session assumptions; waiting-list success classification; mismatched date calculation paths; fatal preparation/notification errors; no durable deduplication across concurrent processes or restarts. These are observations, not changes authorized or implemented by this documentation task.

## Existing work at initial inspection

The checkout was already dirty. Staged changes existed in `package.json`, `package-lock.json`, `src/core.ts` (new), `src/index.ts`, `src/utils.ts`, and `src/scheduler.test.ts` (new in index). `src/index.ts` also had unstaged changes. `src/scheduler.test.ts` was deleted in the working tree while its addition remained staged (`AD`). Preserve that distinction; do not restore or stage it without an appropriate task.

The staged test was read with `git show :src/scheduler.test.ts`. It contains eight fake-clock tests for summer/winter cycle scheduling, past openings, skipped dates, weekends, late preparation, retry deadline, and retry success. Its winter expectations are 18:00/18:30, whereas current source uses 19:00/19:30. It is historical/pending material, not active coverage. It imports core/utils, which transitively load environment configuration.

These notes record the initial handoff, not a permanent claim about future Git status. Always inspect the current working tree and actual test files.

## Change log

### 2026-11-03 — Establish maintained AI project context

- Inspected the maintained codebase and documented purpose, file responsibilities, runtime flow, configuration, date/time and API contracts, side effects, known limitations, pending work, and verification commands/results.
- Added root `AGENTS.md` requiring context reads and an update after each coherent change, with a final diff-to-context check and completion requirement. This is an agent instruction, with no installed CI/hook enforcement.
- Linked agent documentation from `README.md`. Application behavior and existing staged/unstaged work were preserved.
- Validation: TypeScript no-emit check passed; Vitest found no working-tree tests (exit 1). Documentation links and Git diff were checked. No live services were invoked.
