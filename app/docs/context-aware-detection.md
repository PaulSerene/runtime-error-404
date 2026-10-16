# Context-Aware Alert Detection

_Last verified against source code on 2026-10-16. All function names, file paths, thresholds,
and test counts reflect the actual implementation._

---

## Table of Contents

1. [Overview](#1-overview)
2. [Maintenance Windows and Helpdesk Accounts](#2-maintenance-windows-and-helpdesk-accounts)
3. [Company VPN and Location Context](#3-company-vpn-and-location-context)
4. [Contextual Risk Scoring](#4-contextual-risk-scoring)
5. [Regular-User Multi-Host Detection](#5-regular-user-multi-host-detection)
6. [Incident Grouping](#6-incident-grouping)
7. [False-Positive Handling](#7-false-positive-handling)
8. [Remaining Uncertainties](#8-remaining-uncertainties)
9. [Automated Test Results](#9-automated-test-results)
10. [Detection Impact](#10-detection-impact)
11. [Configuration and Usage](#11-configuration-and-usage)

---

## 1. Overview

The detection engine analyses Windows Security Event Log CSV exports to identify suspicious
authentication and lateral-movement patterns. Without context, automated rules produce
**false positives** whenever legitimate, predictable activity superficially resembles an attack
pattern — for example:

- A helpdesk technician accessing many workstations during a planned maintenance window.
- An employee travelling abroad who authenticates from the company VPN at an IP the engine
  has never seen before.

Context-aware detection reduces these false positives by **suppressing alerts** when the engine
has sufficient evidence that an event is authorised, while keeping alert generation active for
all events that lack that authorisation. The suppression is conservative:

- It operates at the **event level**, not the account level — a single suppressed event does
  not silence other events from the same user.
- The same independent rules (brute-force, password spray, off-hours, etc.) continue to fire
  on every non-suppressed event regardless of who triggered suppression for other events.

All findings are labelled as **"suspicious indications"** — the engine never asserts confirmed
compromise. Human review is required before any response action is taken.

---

## 2. Maintenance Windows and Helpdesk Accounts

### Source files

| File | Purpose |
|---|---|
| `src/engine/rules/guards.ts` | `inMaintenanceWindow()`, `isApprovedAccount()`, `isSuppressed()` |

### How the guards work

**`inMaintenanceWindow(evt, config)`**

Returns `true` when the event's timestamp falls inside any declared maintenance window
(inclusive on both boundary timestamps):

```typescript
const ts = new Date(evt.timestamp).getTime();
return config.maintenanceWindows.some((w) => {
  const s = new Date(w.start).getTime();
  const e = new Date(w.end).getTime();
  return ts >= s && ts <= e;
});
```

The check is performed on the **raw ISO timestamp** of each individual event. There is no
user-level or session-level concept of "being in maintenance"; every event is evaluated
independently.

**`isApprovedAccount(evt, config)`**

Returns `true` when the event's `username` is listed in `config.approvedAccounts`:

```typescript
return config.approvedAccounts.includes(evt.username);
```

**`isSuppressed(evt, config)`**

Combines all three suppression checks with a logical OR:

```typescript
return (
  inMaintenanceWindow(evt, config) ||
  isApprovedAccount(evt, config) ||
  isVpnIp(evt.sourceIp, config.vpnCidrs)
);
```

Every detection rule calls `isSuppressed()` before evaluating an event. If it returns `true`,
the event is excluded from that rule's detection logic entirely.

### Critical behaviour: the window suppresses all users

`inMaintenanceWindow()` returns `true` for **any** user whose event timestamp falls inside a
declared window — not only for accounts listed in `approvedAccounts`. This is intentional:
a maintenance window represents a period when system-wide activity is expected to be abnormal,
so blanket suppression prevents alerts from being generated for work that was collectively
pre-approved.

Practical consequence: if you need brute-force detection to remain active during a maintenance
window (for example, to catch an attacker exploiting a patching event), the attacking events
must be timestamped outside the declared window. The `approvedAccounts` list does not override
the window-level check in either direction.

### When helpdesk multi-host activity is approved

A helpdesk account accessing many unfamiliar hosts is **suppressed** (generates no alert) when:

1. The event timestamp falls inside a declared `maintenanceWindows` entry, **or**
2. The helpdesk username is in `approvedAccounts`.

Either condition is sufficient; both can be true simultaneously.

### When an alert must still be generated

An alert is generated even for a helpdesk account or during a maintenance window when:

- The **event timestamp is outside all declared windows** AND the account is not in
  `approvedAccounts` — standard detection applies.
- An **unapproved account** accesses new hosts outside any window — the rule fires normally.
- Partial overlap (some events inside the window, some outside) results in the rule examining
  only the outside-window events; if those alone meet the threshold, an alert fires.

**Important:** if brute-force attempts from an attacker coincide with a maintenance window,
those events will be suppressed by `inMaintenanceWindow()`. Detection of such activity
requires scheduling the test events outside the window, or narrowing the window to exclude
the attack-period hours. This is a known limitation (see Section 8).

---

## 3. Company VPN and Location Context

### Source files

| File | Purpose |
|---|---|
| `src/engine/rules/guards.ts` | `isVpnIp()` |
| `src/engine/rules/newIpOrLocation.ts` | `newIpOrLocation()` rule (RULE-NEW-SOURCE-IP) |
| `src/engine/ingest/` | `parseCidr()`, `ipToInt()`, `maskBitsToInt()`, `lookupLocation()` |

### CIDR matching

`isVpnIp(ip, vpnCidrs)` iterates over every CIDR in `config.vpnCidrs`, parses each one
with `parseCidr()`, and performs a bitwise subnet check:

```typescript
const mask = maskBitsToInt(parsed.maskBits);
if ((addr & mask) >>> 0 === (parsed.networkInt & mask) >>> 0) return true;
```

- Malformed CIDRs are silently skipped (the `parseCidr()` call returns `null`).
- IPv6 is not supported; only dotted-decimal IPv4 addresses are matched.
- The check is performed on the raw `sourceIp` string from the log event.

### How VPN context influences location alerts

`RULE-NEW-SOURCE-IP` suppresses an alert when the event passes the `isSuppressed()` guard,
which includes a VPN check. If the source IP falls in any VPN CIDR, the event is excluded
from analysis and no `RULE-NEW-SOURCE-IP` alert is produced.

For non-suppressed events, `lookupLocation()` resolves a friendly label (e.g. `"HQ LAN"`)
from `config.ipLocations`. The rule raises an alert if:

1. The source IP is new (absent from the user's baseline `knownSourceIps`), **and**
2. The resolved location is also new (no baseline IP maps to the same location string), **or**
   the IP resolves to no known location at all.

### What happens when VPN ownership is unknown

When an IP cannot be matched to any entry in `config.vpnCidrs`, `isVpnIp()` returns `false`
and suppression does not apply via the VPN path. If the IP is also absent from the user's
baseline, the rule evaluates it as a new source IP and may raise an alert.

### VPN match does not imply safety

A VPN match suppresses the new-IP alert, but it **does not make the event safe**:

- VPN credentials can be stolen or shared.
- Corporate VPN exit nodes may be compromised.
- Other rule vectors — brute-force, burst-then-success, off-hours, lateral movement — are
  evaluated independently and are not silenced by a VPN match.

The engine produces no special "VPN-verified safe" label. All remaining alerts from VPN users
are processed and scored through the normal pipeline.

---

## 4. Contextual Risk Scoring

### Source file

`src/engine/scoring.ts`

### Scoring rubric

Scores are built from four additive components, capped at 100:

| Component | Points | Condition |
|---|---|---|
| Distinct rules fired | 15 × N, max 60 | One contribution per unique `ruleId` in the incident's alerts |
| Privileged account | +15 | `username` is in `config.privilegedAccounts` |
| Privileged host involved | +15 | Any alert's `details.newHosts`, `details.host`, or `explanation` text contains a host marked `privileged: true` in `config.assets` |
| Multi-rule bonus | +10 | Three or more distinct rules fired |

Maximum possible score: **100** (enforced by `Math.min(rawScore, 100)`).

> Note: the README.md scoring table lists factors (Tor exit node, failed-before-success,
> approved-account deduction) that are **not present** in the current `scoring.ts`
> implementation. The table above reflects the actual code as of 2026-10-16.

### Severity bands

| Score | Severity |
|---|---|
| >= 80 | `critical` |
| >= 60 | `high` |
| >= 40 | `medium` |
| < 40 | `low` |

### Disposition

Every incident receives `disposition: "suspicious"`. The engine never produces
`"confirmed compromise"` — this constraint is explicitly enforced in `scoring.ts`:

```typescript
// Build explanation — NEVER say "confirmed compromise"
const explanation = `Suspicious indications observed for user "${username}": ...`;
```

### Suppression and scoring

Context-aware suppression acts **before** alerts are created. Events that pass `isSuppressed()`
never become alerts and therefore never contribute to incident scores. Suppression does not
reduce an existing score — it prevents inflation in the first place.

There is no negative scoring for approved accounts, VPN use, or maintenance windows in the
current implementation. The engine either allows or prevents alert creation; it does not
subtract points after the fact.

### Explanation fields

Every `Incident` carries three human-readable fields:

- **`explanation`**: summary string with user, rules fired, and score/severity.
- **`scoreBreakdown`**: ordered list of `{ label, points }` entries.
- **`triageSteps`**: ordered checklist drawn from per-rule templates in `TRIAGE_STEPS`.
  Rules without a template entry fall back to `DEFAULT_TRIAGE`.

---

## 5. Regular-User Multi-Host Detection

### Source file

`src/engine/rules/newHostAccess.ts` — rule ID: `RULE-LATERAL-MOVEMENT`

### How the rule works

1. **Event selection**: only detection-period events that pass `isSuppressed()` and have
   non-empty `username` and `host` fields are considered.

2. **Baseline comparison**: events touching a host already in the user's `knownHosts` baseline
   set are discarded. Only events accessing **new** hosts are retained.

3. **Sliding time window**: a two-pointer sweep over per-user new-host events finds any
   contiguous sub-sequence where:
   - All events fall within `config.thresholds.newHostWindowHours` (default 24 h) of the
     first event in the window, **and**
   - The number of **distinct** new hosts reached is >= `config.thresholds.newHostCount`
     (default 3).

4. **Alert creation**: when the threshold is met, one alert of severity `"high"` is emitted.
   `details.newHosts` lists the distinct host names; `evidenceIds` reference the contributing
   event IDs.

### Maintenance exception

Any event suppressed by `isSuppressed()` is excluded in step 1. This means:

- A helpdesk user accessing 10 new servers during a declared window generates **no** alert.
- The **same hosts** accessed by a regular user **outside** the window still trigger the rule.
- Partial overlap results in only outside-window events being evaluated.

---

## 6. Incident Grouping

### Source file

`src/engine/incidents.ts`

### Grouping algorithm

1. **Per-user buckets**: alerts are separated by `username`.
2. **Time-ordered sort**: each user's alerts are sorted by `timeStart` ascending.
3. **Greedy merge**: a new group starts when the current alert's `timeStart` exceeds the
   first alert in the current group by more than `incidentWindowMinutes` (default 60 minutes).
4. **Scoring**: each group is passed to `scoreIncident()`.
5. **Final sort**: all incidents across all users are sorted by `score` descending.

### Key behaviours

- Two alerts from the same user within 60 minutes are merged into one incident.
- Two alerts separated by more than 60 minutes form **separate** incidents.
- Evidence IDs from all alerts in a group are preserved; nothing is discarded during grouping.
- Incident IDs are auto-incrementing strings (`"inc_0"`, `"inc_1"`, etc.).

---

## 7. False-Positive Handling

### Activity that receives reduced suspicion (suppressed)

| Scenario | Suppression path |
|---|---|
| Helpdesk accessing 15 new servers inside a declared maintenance window | `inMaintenanceWindow()` |
| IT admin in `approvedAccounts` accessing new hosts at any time | `isApprovedAccount()` |
| Employee logging in from a VPN IP (e.g. `10.100.42.7` matching `10.100.0.0/16`) | `isVpnIp()` |
| Travelling employee via VPN from a foreign IP new to their baseline | `isSuppressed()` prevents `newIpOrLocation` evaluation |

### Activity that remains suspicious

| Scenario | Why still flagged |
|---|---|
| Regular user accessing many new hosts outside any maintenance window | No suppression condition applies; `RULE-LATERAL-MOVEMENT` fires |
| Unknown external IP login not matching any VPN CIDR and absent from baseline | `isSuppressed()` returns `false`; `RULE-NEW-SOURCE-IP` fires |
| Privileged account attacking a domain controller from a non-VPN external IP | No suppression; score includes +15 privileged-account bonus + +15 privileged-host bonus |

### Approved account caveat

Because `isApprovedAccount()` is part of `isSuppressed()` via a logical OR, an account in
`approvedAccounts` has **all** its events suppressed across **all** rules at all times.
A compromised helpdesk account performing a password spray is currently invisible to the
engine. The approved-accounts list is intended only for accounts where false positives
significantly exceed expected true positives.

---

## 8. Remaining Uncertainties

| Limitation | Detail |
|---|---|
| **Maintenance window blanket suppression** | Any attacker whose events coincide with a declared window will have those events suppressed. There is no mechanism to suppress only specific accounts or rule vectors during a window. |
| **Approved account always suppressed** | An account in `approvedAccounts` is suppressed across all rules and all time periods, not only during maintenance. A compromised approved account is invisible to the engine. |
| **VPN does not verify account ownership** | `isVpnIp()` checks the source IP only. A stolen credential used from a VPN exit node is suppressed for the new-IP rule. |
| **IPv6 not supported** | `ipToInt()` handles only dotted-decimal IPv4. IPv6 source IPs are treated as non-matching for all CIDR checks. |
| **No cross-user correlation** | Incidents are grouped per user only. A coordinated attack across many accounts from one IP (outside the password-spray pattern) does not produce a cross-user incident. |
| **Baseline quality** | A user with fewer training events than `minBaselineLogins` (default 10) may have an incomplete baseline, making some rules over-sensitive for that account. The engine does not warn per-user when this threshold is not met. |
| **No persistent state** | Each `analyze()` call relearns baselines from the provided CSV. There is no cross-upload memory of known-good behaviour. |
| **Timestamp accuracy** | All comparisons assume UTC. Local-time logs without timezone offsets will produce inaccurate off-hours and maintenance-window boundary decisions. |
| **No real-world evaluation** | All detection quality assessments are based on synthetic fixtures. False-positive and false-negative rates in production environments are unknown. |

---

## 9. Automated Test Results

### Test file

`tests/contextAwareDetection.test.ts`

All results were recorded from a clean `npm test` run with all 262 tests passing.

### Scenario A — Authorized Maintenance Window (9 tests, all PASS)

| Test | Description |
|---|---|
| A1 | Helpdesk new-host events inside window produce zero lateral-movement alerts |
| A2 | Suppression requires both approved account AND window to match (`isSuppressed` OR chain) |
| A3 | Removing both window and approved-account causes helpdesk to be flagged |
| A4 | Helpdesk outside the window IS flagged (approved account alone does not suppress) |
| A5 | Unauthorized account accessing same hosts outside window IS flagged |
| A6 | Event exactly at window `start` is suppressed (boundary inclusive) |
| A7 | Event exactly at window `end` is suppressed (boundary inclusive) |
| A8 | Event 1 ms after window `end` by non-approved user IS flagged |
| A9 | Brute-force alerts fire for a regular user whose events are outside the window |

Note on A9: the regular user's events must be timestamped **outside** the maintenance window.
`isSuppressed()` applies `inMaintenanceWindow()` to any user — events inside the window are
suppressed for all accounts, not only approved ones.

### Scenario B — Travelling Employee Using Company VPN (10 tests, all PASS)

| Test | Description |
|---|---|
| B1 | Login from VPN IP (new IP, new location) produces zero `RULE-NEW-SOURCE-IP` alerts |
| B2 | Same login from IP outside VPN range IS flagged |
| B3 | Known baseline IP never produces a new-IP alert (control) |
| B4 | Malformed VPN CIDR silently ignored; non-VPN external IP still fires |
| B5 | IP at exact boundary of /24 CIDR (first host) is suppressed |
| B6 | IP one octet outside VPN CIDR is NOT suppressed |
| B7 | VPN suppression does NOT silence brute-force from the same IP |
| B8 | Non-VPN attacker brute-force fires even while a legitimate traveller uses VPN |
| B9 | Alert explanation for non-VPN new IP contains "suspicious indications" |
| B10 | Alert explanation never says "confirmed compromise" |

### Scenario C — Suspicious Multi-Host Access (10 tests, all PASS)

| Test | Description |
|---|---|
| C1 | `RULE-LATERAL-MOVEMENT` fires for regular user outside window accessing multiple new hosts |
| C2 | Alert evidence IDs reference the actual triggering events |
| C3 | Alert details contain the new host names |
| C4 | Alert severity for lateral movement is `"high"` |
| C5 | Incident from alert has score > 0 and correct username |
| C6 | Helpdesk accessing the same hosts inside the window produces no incident |
| C7 | VPN IP does NOT exempt a regular user from lateral-movement detection |
| C8 | Regular user with events inside and outside window: only outside events trigger |
| C9 | Incident disposition is always `"suspicious"` |
| C10 | Incident has non-empty `triageSteps` |

### Incident Grouping, Score Bounds, Evidence (6 tests, all PASS)

G1 through G6 verify: merging within window, separating beyond window, score capped at 100,
`scoreBreakdown` sum consistency, descending score sort, and evidence ID preservation.

### Full Pipeline Integration via `analyze()` (9 tests, all PASS)

P1 through P9 exercise the complete pipeline with a four-user synthetic CSV: alice (helpdesk
in window), bob (attacker outside window), carol (VPN traveller), dave (suspicious external IP
timestamped outside the window).

### Overall

```
Test Files  11 passed (11)
Tests       262 passed (262)
```

### Untested cases

- Compromised approved account performing lateral movement (currently suppressed — the engine
  produces no alert in this scenario; no test confirms or denies it).
- IPv6 source IPs against VPN CIDRs.
- Maintenance windows spanning midnight UTC.
- 100% of events inside a maintenance window (complete suppression).
- Per-file config override via `<name>.config.json` in batch scan mode.

---

## 10. Detection Impact

### Qualitative effect of contextual suppression

Without contextual suppression, every helpdesk host access during a maintenance window and
every VPN login from a new IP would generate an alert. With suppression:

- Approved account during a maintenance window: 0 lateral-movement alerts instead of N.
- VPN traveller logging in from a new IP: 0 new-IP alerts instead of 1.
- Regular user outside the window: detection unchanged.

All other rule vectors remain active for non-suppressed events; suppressing one rule for one
event does not reduce the sensitivity of other rules.

### Baseline comparison

No shared pre-suppression / post-suppression dataset exists. Quantitative claims about
false-positive reduction rates, true-positive preservation, or score delta are **not
available**. The synthetic test fixtures demonstrate correct behaviour only.

Batch scan of the six fixture files (`npm run scan -- ./tests/fixtures`) produced the
following actual measurements (the only real numbers available):

| Fixture | Rows | Rules run | Alerts | Incidents |
|---|---|---|---|---|
| `header_canonical_iso.csv` | 7 | 6 / 6 | 2 | 1 |
| `header_dot_notation_dash_date.csv` | 7 | 6 / 6 | 2 | 1 |
| `header_snake_case_slash_ymd.csv` | 7 | 6 / 6 | 2 | 1 |
| `header_sysmon_epoch.csv` | 7 | 6 / 6 | 2 | 1 |
| `header_windows_export_us_slash.csv` | 7 | 6 / 6 | 2 | 1 |
| `missing_columns.csv` | 7 | 3 / 6 | 1 | 1 |

Three rules are skipped for the missing-columns fixture because `sourceIp` is absent from
the header. Real-world impact on production logs has not yet been quantified.

---

## 11. Configuration and Usage

### Commands

```bash
npm install               # Install dependencies
npm run dev               # Start Next.js at http://localhost:3000
npm test                  # Run 262 unit tests (Vitest)
npm run scan -- ./datasets  # Batch-scan a folder; writes output/summary.json
```

### Config fields

| Field | Type | Description |
|---|---|---|
| `thresholds` | `Record<string, number>` | Numeric tuning values; defaults loaded from `config/detection.json` |
| `trainingPeriod` | `{ start, end }` | ISO 8601 window used to learn baselines |
| `timezone` | `string` | IANA timezone for off-hours detection only |
| `maintenanceWindows` | `{ start, end }[]` | Declared windows; all events inside are suppressed across all rules and all users |
| `approvedAccounts` | `string[]` | Usernames suppressed across all rules at all times |
| `vpnCidrs` | `string[]` | IPv4 CIDR ranges; source IPs inside are suppressed for `RULE-NEW-SOURCE-IP` |
| `assets` | `{ host, role, privileged? }[]` | Host inventory; `privileged: true` entries add +15 to the incident score |
| `privilegedAccounts` | `string[]` | Usernames that trigger +15 score bonus |
| `ipLocations` | `{ cidr, location }[]` | Maps IP ranges to friendly location labels used by `RULE-NEW-SOURCE-IP` |

### Default thresholds (`config/detection.json`)

| Key | Default | Used by |
|---|---|---|
| `failureCount` | 5 | `RULE-BRUTE-FORCE` |
| `failureWindowMinutes` | 10 | `RULE-BRUTE-FORCE` |
| `burstFailures` | 3 | `RULE-FAILURE-THEN-SUCCESS` |
| `burstWindowMinutes` | 15 | `RULE-FAILURE-THEN-SUCCESS` |
| `sprayAccounts` | 5 | `RULE-PASSWORD-SPRAY` |
| `sprayWindowMinutes` | 10 | `RULE-PASSWORD-SPRAY` |
| `offHoursStart` | 6 | `RULE-OFF-HOURS` (business day start, UTC hour) |
| `offHoursEnd` | 22 | `RULE-OFF-HOURS` (business day end, UTC hour) |
| `minBaselineLogins` | 10 | Baseline quality threshold |
| `baselineEarliestPct` | 20 | Fallback training window (% of dataset days) |
| `newHostCount` | 3 | `RULE-LATERAL-MOVEMENT` |
| `newHostWindowHours` | 24 | `RULE-LATERAL-MOVEMENT` |
| `incidentWindowMinutes` | 60 | Incident grouping gap |

Caller-supplied values in `config.thresholds` always override the JSON defaults.

### Batch scan config lookup order

When using `npm run scan`, per-dataset configuration is loaded in this priority order:

1. `<csvname>.config.json` (file-specific, same directory)
2. `config.json` in the same folder as the CSVs
3. Built-in defaults from `config/detection.json`

---

_This document was written from direct inspection of the source code. It does not describe
planned features or aspirational behaviour. Update this document when the engine changes._
