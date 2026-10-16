# Log Analysis Engine — App

A browser-based security-incident dashboard that ingests Windows Security Event Log CSVs, runs a
deterministic rule engine entirely client-side, and surfaces incidents with risk scores, evidence
timelines, and recommended triage steps.

---

## Documentation

| Document | Description |
|---|---|
| [docs/context-aware-detection.md](docs/context-aware-detection.md) | How maintenance windows, approved accounts, VPN CIDRs, and contextual scoring work — including false-positive handling, automated test results, and known limitations |

---

## Setup

```bash
# Install dependencies (from this directory)
npm install

# Start the development server
npm run dev          # → http://localhost:3000

# Production build (verify before committing)
npm run build

# Run unit tests
npm test
```

---

## Data format

### Log CSV (required)

One row per Windows Security Event log entry. The engine accepts several column-name aliases:

| Canonical column | Accepted aliases |
|---|---|
| `timestamp` | `TimeCreated`, `time`, `datetime` |
| `username` | `SubjectUserName`, `TargetUserName`, `user` |
| `sourceIp` | `IpAddress`, `source_ip`, `src_ip` |
| `host` | `ComputerName`, `WorkstationName`, `hostname` |
| `eventType` | `EventID`, `event_id`, `event_type` |
| `result` | `Keywords`, `Status`, `status` — `SUCCESS` / `FAILURE` |
| `logonType` | `LogonType`, `logon_type` |

Minimum viable row: `timestamp, username, host, eventType, result`.

### Assets CSV (optional)

```
host,role,privileged
DC01,domain-controller,true
FS01,file-server,false
```

### IP Location CSV (optional)

```
cidr,location
10.100.0.0/16,Corporate VPN
185.220.101.0/24,Tor Exit Node (RU)
```

---

## Training period

The training period is a date range during which the engine learns baseline behaviour:

- **Login time distributions** (to detect off-hours activity)
- **Per-user host sets** (to detect lateral movement)
- **Logon failure rates** (to detect brute-force / spray)

Events that fall _inside_ the training window contribute to the baseline but do **not** generate
incidents. Events that fall _outside_ the window are scored against the learned baselines.

If all events fall outside the training period, a warning banner is shown on the results page.

---

## Scoring methodology

Each incident receives a composite **risk score** (0–100) built from rule-specific contributions:

| Factor | Max points |
|---|---|
| Privileged account involved | +20 |
| Source IP is Tor exit node / known threat feed | +25 |
| Off-hours activity (outside 08:00–18:00 local time) | +10 |
| Failed logon immediately before success | +8 |
| Target is domain controller | +15 |
| Lateral movement (N hops within threshold window) | up to +20 |
| Account is in `approvedAccounts` list | −10 |
| Activity is within a maintenance window | −15 |
| Source IP is in `vpnCidrs` | −5 |

Raw points from all fired rules are summed, then clamped to [0, 100]. The per-rule contributions
are shown in the **Score Breakdown** panel on the incident detail view.

---

## Assumptions & disclaimers

1. **UTC by default.** All timestamps are treated as UTC unless a timezone is specified. The
   timezone setting shifts the "business hours" window for off-hours detection only; it does not
   re-interpret stored timestamps.

2. **"Suspicious indications", not confirmed compromise.** Every finding the engine produces is a
   _suspicious indication_ — a pattern that warrants analyst review. The engine does not, and
   cannot, confirm that a real attack occurred. An analyst must review, validate, and determine the
   appropriate response before taking any action.

3. **Synthetic testing does not establish real-world performance.** The sample fixture is
   hand-authored to demonstrate the dashboard. It does not represent a statistically valid
   evaluation of the engine's detection rate or false-positive rate.

4. **Client-side only.** No data leaves the browser. The engine runs in a Web Worker; no CSV
   content is ever sent to a server.

5. **Engine stub.** `src/engine/index.ts` currently returns empty results for real uploads.
   The fixture (`sampleResult`) is used for the "Load sample data" path. Replace the engine stub
   with a real implementation to get live results.

---

## Demo script

Follow these steps to explore the full dashboard with sample data:

1. Open `http://localhost:3000` in your browser.
2. Click **"Load Sample Data"** — you are taken directly to the results dashboard.
3. Review the **summary cards**: 4 incidents (1 critical, 1 high, 1 medium, 1 low),
   4,820 total events, 3 invalid rows, 16 duplicates removed.
4. The **config strip** shows the active timezone, training period, and approved accounts.
5. Click the **`INC-2024-001`** row (score 98, critical) in the incident list.
6. The **incident detail panel** opens on the right:
   - Read the score breakdown — 98 points from Tor exit-node, privileged account, lateral movement.
   - Scroll through the **event timeline** (4 events, 3-minute window, DC01 → DC02 → SQLPROD01).
   - Expand **Raw Evidence Rows** to see the parsed CSV lines.
   - Read the **Recommended Triage Steps**.
   - Note the ⚠️ **"suspicious indications, not confirmed compromise"** disclaimer at the top.
7. Use the **Filters** bar to filter by `severity: high` — only `INC-2024-002` remains.
8. Click **"Ingest Quality"** tab to see the 3 invalid rows and 16 duplicates.
9. Click **"CSV"** in the nav bar — `incidents_<timestamp>.csv` downloads with one row per alert.
10. Click **"HTML"** — `report_<timestamp>.html` downloads as a self-contained dark-theme report.
11. Click **← Upload** to return to the upload screen and try your own CSV.
