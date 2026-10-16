/**
 * Normalization utilities for security log ingestion.
 *
 * - Lowercases usernames and strips Windows DOMAIN\ or @domain suffixes.
 * - Identifies and filters machine accounts ending in $ and placeholders (-, empty, null).
 * - Trims IP addresses and normalizes loopbacks (::1, 127.0.0.1) and placeholders (-) to null.
 * - Handles IPv6 addresses and extracts IPv4 from ::ffff: prefixes.
 */

/**
 * Strips Windows NetBIOS domain prefix (DOMAIN\) and UPN/email suffix (@domain).
 */
export function stripDomain(username: string): string {
  if (!username) return "";
  let u = username.trim();

  // Strip NetBIOS domain prefix (e.g., "CORP\alice" -> "alice")
  const backslashIdx = u.lastIndexOf("\\");
  if (backslashIdx !== -1) {
    u = u.slice(backslashIdx + 1);
  }

  // Strip UPN / email domain suffix (e.g., "alice@corp.local" -> "alice")
  const atIdx = u.indexOf("@");
  if (atIdx !== -1) {
    u = u.slice(0, atIdx);
  }

  return u.trim();
}

/**
 * Checks whether an account is a Windows machine account (ends with $).
 */
export function isMachineAccount(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const stripped = stripDomain(raw);
  return stripped.endsWith("$");
}

/**
 * Checks whether a username is a placeholder (- or empty or null indicator).
 */
export function isPlaceholderUser(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-") return true;
  const lower = trimmed.toLowerCase();
  return lower === "n/a" || lower === "(null)" || lower === "null" || lower === "undefined";
}

/**
 * Normalizes a username:
 * - Returns null if the username is empty, a placeholder (-), or a machine account ending in $.
 * - Strips DOMAIN\ prefix and @domain suffix.
 * - Lowercases the username.
 */
export function normalizeUsername(raw: string | null | undefined): string | null {
  if (!raw || isPlaceholderUser(raw)) return null;

  const stripped = stripDomain(raw);
  if (!stripped || stripped === "-" || isPlaceholderUser(stripped)) return null;

  if (stripped.endsWith("$")) {
    return null; // Skip machine accounts
  }

  return stripped.toLowerCase();
}

/**
 * Normalizes an IP address:
 * - Trims whitespace.
 * - Returns null for ::1, 127.0.0.1, 127.0.0.0/8 loopbacks, -, and empty values.
 * - Extracts IPv4 from IPv4-mapped IPv6 addresses (::ffff:x.x.x.x).
 * - Normalizes general IPv6 addresses by removing brackets and lowercasing.
 */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim();

  // Placeholder or empty checks
  if (ip === "" || ip === "-" || ip === "null" || ip === "(null)") return null;

  // Strip surrounding brackets for IPv6 notation [::1] or [::ffff:192.168.1.1]
  if (ip.startsWith("[") && ip.endsWith("]")) {
    ip = ip.slice(1, -1).trim();
  }

  // Handle IPv4-mapped IPv6 prefix ::ffff:x.x.x.x
  const mappedMatch = ip.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (mappedMatch) {
    ip = mappedMatch[1];
  }

  // Check loopback / unspecified / placeholder addresses
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "0.0.0.0" ||
    ip === "::" ||
    ip === "localhost" ||
    ip.startsWith("127.")
  ) {
    return null;
  }

  // Check for expanded IPv6 loopback (e.g. 0:0:0:0:0:0:0:1)
  if (ip.includes(":")) {
    const segments = ip.split(":");
    const isAllZerosExceptLast =
      segments.length >= 3 &&
      segments.slice(0, -1).every((s) => s === "" || /^0+$/.test(s)) &&
      /^0*1$/.test(segments[segments.length - 1]);
    if (isAllZerosExceptLast) {
      return null;
    }
    return ip.toLowerCase();
  }

  return ip;
}
