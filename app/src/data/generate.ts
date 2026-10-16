/**
 * Seeded synthetic log-data generator for testing.
 * Owner: Person A (src/engine/, src/data/, tests/)
 *
 * Produces two artefacts:
 *   1. A realistic Windows Security-log CSV string.
 *   2. An `expected.json`-compatible object listing planted scenarios.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IMPORTANT: The expected-scenarios object must NEVER be imported by
 * detection code. It is for test assertions only.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * No network access. No browser APIs. All randomness is seeded and
 * deterministic — the same seed always produces the same CSV.
 */

// ─── Tiny seeded PRNG (mulberry32) ───────────────────────────────────────────

function makePrng(seed: number) {
  let s = seed >>> 0;
  return function rand(): number {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function isoUtc(ms: number): string {
  return new Date(ms).toISOString().replace(".000", "");
}

function dateMs(year: number, month: number, day: number, hour = 9, min = 0): number {
  return Date.UTC(year, month - 1, day, hour, min, 0);
}

// ─── Fixture data ─────────────────────────────────────────────────────────────

const USERS = [
  "jdoe", "mmiller", "pwilson", "rthompson", "klee",
  "sgomez", "bmartinez", "cjohnson", "hwhite", "tclark",
  "abrown", "fnelson", "gwang", "lhall", "adm-svc",
];

const PRIVILEGED_USERS = ["adm-svc"];

const HOSTS_NORMAL = ["WS-001", "WS-002", "WS-003", "WS-004", "WS-005", "WS-006"];
const HOSTS_SERVERS = ["SRV-FIN01", "SRV-HR01", "DC01"];

const INTERNAL_IPS = [
  "192.168.1.10", "192.168.1.11", "192.168.1.12",
  "192.168.1.20", "192.168.1.21", "192.168.2.5",
];
const VPN_IP = "10.100.5.22";
const EXTERNAL_IP_NEW = "203.0.113.45"; // outside known ranges
const TOR_IP = "185.220.101.47";

const EVENT_TYPES = ["4624", "4625", "4634", "4648"];
const LOGON_TYPES = ["2", "3", "10"];

// ─── Date boundaries ──────────────────────────────────────────────────────────
// Training period: 2024-03-01 – 2024-03-14
// Detection period: 2024-03-15 – 2024-03-28

const TRAIN_START_MS = dateMs(2024, 3, 1);
const TRAIN_END_MS   = dateMs(2024, 3, 14, 23, 59);
const DET_START_MS   = dateMs(2024, 3, 15);
const DET_END_MS     = dateMs(2024, 3, 28, 23, 59);

// Maintenance window: 2024-03-20 02:00 – 04:00 UTC
const MAINT_START_MS = dateMs(2024, 3, 20, 2, 0);
const MAINT_END_MS   = dateMs(2024, 3, 20, 4, 0);

// ─── Row builder ──────────────────────────────────────────────────────────────

interface RowOpts {
  ts: number;
  user: string;
  ip: string;
  host: string;
  eventType?: string;
  result?: string;
  logonType?: string;
}

function buildRow(o: RowOpts): string {
  return [
    isoUtc(o.ts),
    o.user,
    o.ip,
    o.host,
    o.eventType  ?? "4624",
    o.result     ?? "SUCCESS",
    o.logonType  ?? "3",
  ].join(",");
}

// ─── Planted-scenario descriptor ──────────────────────────────────────────────

export interface PlantedScenario {
  rule: string;
  user: string;
  /** Rough timestamp string (ISO) at which the scenario occurs. */
  approxTime: string;
  /** Whether the scenario should suppress / not alert (negative test). */
  shouldNotAlert?: boolean;
  description: string;
}

// ─── Generator ────────────────────────────────────────────────────────────────

export interface GenerateResult {
  /** The full CSV string (header + rows). */
  csv: string;
  /**
   * Array of planted scenarios.
   * MUST NOT be imported by detection code.
   * Consume only from test files and the expected.json writer.
   */
  expectedScenarios: PlantedScenario[];
}

export function generateSyntheticLog(seed = 0xdeadbeef): GenerateResult {
  const rand = makePrng(seed);
  const rows: string[] = [];
  const scenarios: PlantedScenario[] = [];

  const header = "timestamp,username,sourceip,host,eventtype,result,logontype";
  rows.push(header);

  // ── 1. Normal office-hours traffic — training period ─────────────────────
  // Generate ~20–30 events per workday per user during training.
  const workdays: number[] = [];
  for (let day = 1; day <= 14; day++) {
    const dow = new Date(dateMs(2024, 3, day)).getUTCDay(); // 0=Sun
    if (dow !== 0 && dow !== 6) workdays.push(day);
  }

  for (const user of USERS.filter((u) => u !== "adm-svc")) {
    const ip = pick(INTERNAL_IPS, rand);
    const ws  = pick(HOSTS_NORMAL, rand);
    for (const day of workdays) {
      const evCount = 15 + Math.floor(rand() * 20);
      for (let i = 0; i < evCount; i++) {
        const hour = 8 + Math.floor(rand() * 9); // 08–16 UTC
        const min  = Math.floor(rand() * 60);
        const ts   = dateMs(2024, 3, day, hour, min);
        if (ts < TRAIN_START_MS || ts > TRAIN_END_MS) continue;
        rows.push(buildRow({ ts, user, ip, host: ws }));
      }
    }
  }

  // adm-svc normal activity during training
  for (const day of workdays) {
    const ts = dateMs(2024, 3, day, 9, 0);
    rows.push(buildRow({ ts, user: "adm-svc", ip: INTERNAL_IPS[0], host: "DC01" }));
  }

  // ── 2. Normal office-hours traffic — detection period ───────────────────
  const detWorkdays: number[] = [];
  for (let day = 15; day <= 28; day++) {
    const dow = new Date(dateMs(2024, 3, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) detWorkdays.push(day);
  }

  for (const user of USERS.filter((u) => !["jdoe", "mmiller", "pwilson", "rthompson", "klee", "adm-svc"].includes(u))) {
    const ip = pick(INTERNAL_IPS, rand);
    const ws  = pick(HOSTS_NORMAL, rand);
    for (const day of detWorkdays) {
      const evCount = 8 + Math.floor(rand() * 12);
      for (let i = 0; i < evCount; i++) {
        const hour = 8 + Math.floor(rand() * 9);
        const min  = Math.floor(rand() * 60);
        const ts   = dateMs(2024, 3, day, hour, min);
        if (ts < DET_START_MS || ts > DET_END_MS) continue;
        rows.push(buildRow({ ts, user, ip, host: ws }));
      }
    }
  }

  // ── SCENARIO A: Brute-force failures (jdoe, 2024-03-15) ─────────────────
  {
    const user = "jdoe";
    const baseTs = dateMs(2024, 3, 15, 10, 5);
    for (let i = 0; i < 22; i++) {
      rows.push(buildRow({
        ts: baseTs + i * 3000,
        user,
        ip: INTERNAL_IPS[0],
        host: "DC01",
        eventType: "4625",
        result: "FAILURE",
        logonType: "3",
      }));
    }
    scenarios.push({
      rule: "RULE-BRUTE-FORCE",
      user,
      approxTime: isoUtc(baseTs),
      description: "22 consecutive 4625 failures for jdoe against DC01 within 1 minute.",
    });
  }

  // ── SCENARIO B: Failure burst then success (mmiller, 2024-03-15) ─────────
  {
    const user = "mmiller";
    const baseTs = dateMs(2024, 3, 15, 14, 22);
    for (let i = 0; i < 8; i++) {
      rows.push(buildRow({
        ts: baseTs + i * 4000,
        user,
        ip: INTERNAL_IPS[1],
        host: "SRV-FIN01",
        eventType: "4625",
        result: "FAILURE",
        logonType: "3",
      }));
    }
    rows.push(buildRow({
      ts: baseTs + 40000,
      user,
      ip: INTERNAL_IPS[1],
      host: "SRV-FIN01",
      eventType: "4624",
      result: "SUCCESS",
      logonType: "3",
    }));
    scenarios.push({
      rule: "RULE-FAILURE-THEN-SUCCESS",
      user,
      approxTime: isoUtc(baseTs),
      description: "8 failures then a success for mmiller on SRV-FIN01.",
    });
  }

  // ── SCENARIO C: Password spray (many accounts, 2024-03-16) ───────────────
  {
    const attackIp = "192.168.5.99";
    const baseTs   = dateMs(2024, 3, 16, 9, 0);
    const sprayTargets = ["abrown", "cjohnson", "fnelson", "gwang", "hwhite", "tclark", "lhall", "klee", "sgomez", "bmartinez"];
    let offset = 0;
    for (const target of sprayTargets) {
      rows.push(buildRow({
        ts: baseTs + offset,
        user: target,
        ip: attackIp,
        host: "DC01",
        eventType: "4625",
        result: "FAILURE",
        logonType: "3",
      }));
      offset += 1500;
    }
    scenarios.push({
      rule: "RULE-PASSWORD-SPRAY",
      user: "(multiple)",
      approxTime: isoUtc(baseTs),
      description: `Password spray from ${attackIp} against 10 accounts within 15 seconds on DC01.`,
    });
  }

  // ── SCENARIO D: Night-time login (pwilson, 2024-03-17 03:14) ─────────────
  {
    const user = "pwilson";
    const ts   = dateMs(2024, 3, 17, 3, 14);
    rows.push(buildRow({ ts, user, ip: INTERNAL_IPS[2], host: "WS-003", logonType: "2" }));
    scenarios.push({
      rule: "RULE-OFF-HOURS",
      user,
      approxTime: isoUtc(ts),
      description: "pwilson logged in at 03:14 UTC, outside their normal 08–16 window.",
    });
  }

  // ── SCENARIO E: Login from new/external IP (rthompson, 2024-03-18) ───────
  {
    const user = "rthompson";
    const ts   = dateMs(2024, 3, 18, 11, 45);
    rows.push(buildRow({ ts, user, ip: EXTERNAL_IP_NEW, host: "WS-004" }));
    scenarios.push({
      rule: "RULE-NEW-SOURCE-IP",
      user,
      approxTime: isoUtc(ts),
      description: `rthompson logged in from a never-before-seen external IP ${EXTERNAL_IP_NEW}.`,
    });
  }

  // ── SCENARIO F: Lateral movement — many new hosts (klee, 2024-03-19) ─────
  {
    const user  = "klee";
    const baseTs = dateMs(2024, 3, 19, 15, 0);
    const lateralHosts = ["SRV-FIN01", "SRV-HR01", "DC01", "WS-001", "WS-002", "WS-003"];
    let offset = 0;
    for (const host of lateralHosts) {
      rows.push(buildRow({
        ts: baseTs + offset,
        user,
        ip: INTERNAL_IPS[0],
        host,
        logonType: "3",
      }));
      offset += 45000; // 45 seconds apart
    }
    scenarios.push({
      rule: "RULE-LATERAL-MOVEMENT",
      user,
      approxTime: isoUtc(baseTs),
      description: "klee accessed 6 distinct hosts (including servers) within ~4 minutes.",
    });
  }

  // ── SCENARIO G: Maintenance-window event — should NOT alert ─────────────
  {
    const user = "adm-svc";
    const ts   = MAINT_START_MS + 30 * 60 * 1000; // 30 min into window
    rows.push(buildRow({ ts, user, ip: INTERNAL_IPS[0], host: "DC01", logonType: "3" }));
    scenarios.push({
      rule: "RULE-OFF-HOURS",
      user,
      approxTime: isoUtc(ts),
      shouldNotAlert: true,
      description: "adm-svc login during declared maintenance window — must not produce an off-hours alert.",
    });
  }

  // ── SCENARIO H: VPN-range event — should NOT alert for new-IP ───────────
  {
    const user = "sgomez";
    const ts   = dateMs(2024, 3, 21, 10, 0);
    rows.push(buildRow({ ts, user, ip: VPN_IP, host: "WS-001", logonType: "3" }));
    scenarios.push({
      rule: "RULE-NEW-SOURCE-IP",
      user,
      approxTime: isoUtc(ts),
      shouldNotAlert: true,
      description: `sgomez connected from VPN IP ${VPN_IP} which is in an approved VPN CIDR.`,
    });
  }

  // ── SCENARIO I: Privileged account via Tor (adm-svc, 2024-03-22) ─────────
  {
    const user = "adm-svc";
    const ts   = dateMs(2024, 3, 22, 2, 44);
    rows.push(buildRow({ ts, user, ip: TOR_IP, host: "DC01", logonType: "3" }));
    scenarios.push({
      rule: "RULE-TOR-PRIV-LOGON",
      user,
      approxTime: isoUtc(ts),
      description: `Privileged adm-svc logged in from Tor exit node ${TOR_IP} at 02:44 UTC.`,
    });
  }

  // ── MALFORMED ROWS ────────────────────────────────────────────────────────
  // Bad timestamp
  rows.push("not-a-date,testuser,192.168.1.1,WS-001,4624,SUCCESS,3");
  // Extra columns (still parseable)
  rows.push(`${isoUtc(dateMs(2024, 3, 23, 9, 0))},extrauser,192.168.1.5,WS-002,4624,SUCCESS,3,extra_col_value`);
  // Missing timestamp field entirely (empty first column)
  rows.push(",emptyts,192.168.1.3,WS-003,4624,SUCCESS,3");

  // ── DUPLICATES ────────────────────────────────────────────────────────────
  const dupRow = buildRow({
    ts: dateMs(2024, 3, 24, 9, 30),
    user: "lhall",
    ip: INTERNAL_IPS[3],
    host: "WS-005",
  });
  rows.push(dupRow);
  rows.push(dupRow); // exact duplicate

  return { csv: rows.join("\n"), expectedScenarios: scenarios };
}

// ─── Config companion ─────────────────────────────────────────────────────────

/** Return a Config object that matches the generated data. */
export function syntheticConfig() {
  return {
    thresholds: {
      failureCount: 5,
      failureWindowMinutes: 10,
      burstFailures: 3,
      burstWindowMinutes: 15,
      sprayAccounts: 5,
      sprayWindowMinutes: 10,
      minBaselineLogins: 10,
      newHostCount: 3,
      newHostWindowHours: 24,
      incidentWindowMinutes: 60,
    },
    trainingPeriod: { start: "2024-03-01T00:00:00Z", end: "2024-03-14T23:59:59Z" },
    timezone: "UTC",
    maintenanceWindows: [
      { start: "2024-03-20T02:00:00Z", end: "2024-03-20T04:00:00Z" },
    ],
    approvedAccounts: ["adm-svc"],
    vpnCidrs: ["10.100.0.0/16"],
    assets: [
      { host: "DC01",      role: "domain-controller", privileged: true },
      { host: "SRV-FIN01", role: "file-server",        privileged: false },
      { host: "SRV-HR01",  role: "file-server",        privileged: false },
      ...HOSTS_NORMAL.map((h) => ({ host: h, role: "user-workstation", privileged: false })),
    ],
    privilegedAccounts: PRIVILEGED_USERS,
    ipLocations: [
      { cidr: "192.168.0.0/16",   location: "HQ LAN" },
      { cidr: "10.100.0.0/16",    location: "Corporate VPN" },
      { cidr: "185.220.101.0/24", location: "Tor Exit Node" },
    ],
  };
}

/**
 * Alias for integration tests: generates the synthetic CSV and expected scenarios.
 * expectedScenarios MUST NOT be imported by detection code.
 */
export function generateDataset(seed = 0xdeadbeef): GenerateResult {
  return generateSyntheticLog(seed);
}

/** Alias for integration tests: returns the default config matching the generated dataset. */
export function defaultConfig() {
  return syntheticConfig();
}
