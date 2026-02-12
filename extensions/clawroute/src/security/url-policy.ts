import { minimatch } from "minimatch";
import { isIP } from "node:net";

const PRIVATE_RANGES_V4 = [
  { prefix: "10.", mask: 8 },
  { prefix: "127.", mask: 8 },
  { prefix: "169.254.", mask: 16 },
  { prefix: "192.168.", mask: 16 },
];

// 172.16.0.0 - 172.31.255.255
function isPrivate172(ip: string): boolean {
  if (!ip.startsWith("172.")) return false;
  const second = parseInt(ip.split(".")[1], 10);
  return second >= 16 && second <= 31;
}

const PRIVATE_V6_PREFIXES = ["fc", "fd", "fe80:", "::1", "::ffff:"];

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  return PRIVATE_V6_PREFIXES.some((p) => lower.startsWith(p));
}

function isPrivateIP(hostname: string): boolean {
  if (isIP(hostname) === 4) {
    if (PRIVATE_RANGES_V4.some((r) => hostname.startsWith(r.prefix))) return true;
    if (isPrivate172(hostname)) return true;
    if (hostname === "0.0.0.0") return true;
    return false;
  }
  if (isIP(hostname) === 6) {
    return isPrivateIPv6(hostname);
  }
  // Hostnames like "localhost"
  if (hostname === "localhost" || hostname.endsWith(".local")) return true;
  return false;
}

export interface UrlPolicyConfig {
  allowGlobs: string[];
  denyGlobs: string[];
  allowPrivateIps?: boolean;
}

export class UrlPolicy {
  private allow: string[];
  private deny: string[];
  private allowPrivateIps: boolean;

  constructor(config: UrlPolicyConfig) {
    this.allow = config.allowGlobs;
    this.deny = config.denyGlobs;
    this.allowPrivateIps = config.allowPrivateIps ?? false;
  }

  check(urlStr: string): { allowed: boolean; reason?: string } {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return { allowed: false, reason: "Invalid URL" };
    }

    // Only HTTP(S) allowed
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        allowed: false,
        reason: `Protocol ${parsed.protocol} not allowed, only http/https`,
      };
    }

    // Block private/internal IPs (unless explicitly allowed for testing)
    if (!this.allowPrivateIps && isPrivateIP(parsed.hostname)) {
      return {
        allowed: false,
        reason: `Private/internal IP blocked: ${parsed.hostname}`,
      };
    }

    // Check deny globs first (deny wins over allow)
    for (const pattern of this.deny) {
      if (minimatch(urlStr, pattern) || minimatch(parsed.hostname, pattern)) {
        return { allowed: false, reason: `Denied by pattern: ${pattern}` };
      }
    }

    // Check allow globs
    if (this.allow.length > 0) {
      const matched = this.allow.some(
        (pattern) =>
          minimatch(urlStr, pattern) || minimatch(parsed.hostname, pattern)
      );
      if (!matched) {
        return { allowed: false, reason: "URL not in allowlist" };
      }
    }

    return { allowed: true };
  }
}
