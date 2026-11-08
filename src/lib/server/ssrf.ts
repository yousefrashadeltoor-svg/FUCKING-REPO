// ============================================================================
//  SSRF guard — the server must never be tricked into fetching itself.
//  ---------------------------------------------------------------------------
//  Several routes proxy a URL that comes from the client (`/api/radio/stream`,
//  the radio clip cover, …). Without a check, that is an open proxy into the
//  internal network (cloud metadata at 169.254.169.254, localhost admin panels,
//  RFC1918 hosts, …).
//
//  Every such URL goes through `assertPublicUrl()`:
//    • http/https only,
//    • no credentials in the URL,
//    • hostname resolved via DNS and every address must be public,
//    • no loopback / private / link-local / CGNAT / multicast / metadata ranges,
//    • redirects are followed manually and re-validated at each hop.
// ============================================================================
import dns from "node:dns/promises";
import net from "node:net";

const BLOCKED_V4 = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local + cloud metadata (169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
] as const;

function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const value = v4ToInt(ip);
  if (value === null) return true;
  for (const [base, bits] of BLOCKED_V4) {
    const b = v4ToInt(base);
    if (b === null) continue;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    if ((value & mask) === (b & mask)) return true;
  }
  return false;
}

/**
 * Extract the embedded IPv4 address of an IPv4-mapped/compatible IPv6 address.
 * `new URL()` normalises `[::ffff:127.0.0.1]` to `[::ffff:7f00:1]`, so the dotted
 * form alone is not enough — both representations must be understood.
 */
function embeddedV4(v: string): string | null {
  const dotted = v.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return dotted[1];
  const hex = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  return null;
}

function isBlockedV6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fe80")) return true; // link-local
  if (v.startsWith("fc") || v.startsWith("fd")) return true; // unique local
  if (v.startsWith("ff")) return true; // multicast
  if (v.startsWith("64:ff9b:")) return true; // NAT64
  // IPv4-mapped (::ffff:…) must be judged by the IPv4 rules.
  if (v.startsWith("::ffff:") || v.includes(".")) {
    const v4 = embeddedV4(v);
    if (!v4) return true; // unmappable form → refuse rather than guess
    return isBlockedV4(v4);
  }
  return false;
}

function isIpLiteral(host: string): boolean {
  return net.isIP(host) !== 0;
}

/**
 * Throws when `raw` is not a safe public http(s) URL.
 * Returns the parsed URL on success.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new Error("Credentials in URLs are not allowed");
  if (!url.hostname) throw new Error("Invalid host");

  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (isIpLiteral(host)) {
    const blocked = net.isIPv4(host) ? isBlockedV4(host) : isBlockedV6(host);
    if (blocked) throw new Error("This address is not allowed");
    return url;
  }

  // Hostname form of "localhost" and friends, before spending a DNS query.
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".internal") || lower.endsWith(".local")) {
    throw new Error("This address is not allowed");
  }

  let records: { address: string; family: number }[];
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("Host could not be resolved");
  }
  if (records.length === 0) throw new Error("Host could not be resolved");
  for (const r of records) {
    const blocked = r.family === 4 ? isBlockedV4(r.address) : isBlockedV6(r.address);
    if (blocked) throw new Error("This host points to a private address");
  }
  return url;
}

/**
 * fetch() for client-supplied URLs: validates every hop (including redirects).
 * At most `maxHops` redirects are followed.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  opts: { maxHops?: number; allowContentTypes?: RegExp } = {},
): Promise<Response> {
  const maxHops = opts.maxHops ?? 3;
  let current = (await assertPublicUrl(raw)).toString();
  for (let hop = 0; hop <= maxHops; hop++) {
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return res;
      current = (await assertPublicUrl(new URL(location, current).toString())).toString();
      continue;
    }
    if (opts.allowContentTypes) {
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      if (ct && !opts.allowContentTypes.test(ct)) {
        try {
          await res.body?.cancel();
        } catch {
          /* noop */
        }
        throw new Error(`Unexpected content type: ${ct.split(";")[0]}`);
      }
    }
    return res;
  }
  throw new Error("Too many redirects");
}
