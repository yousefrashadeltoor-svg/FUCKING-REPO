// Real, runnable check for the SSRF guard: `npx tsx tests/ssrf.test.mts`
import { assertPublicUrl } from "../src/lib/server/ssrf.js";

const cases: [string, boolean][] = [
  ["http://169.254.169.254/latest/meta-data/", false],
  ["http://127.0.0.1:3000/api/health", false],
  ["http://localhost/admin", false],
  ["http://example.localhost/", false],
  ["http://10.0.0.5/", false],
  ["http://192.168.1.1/", false],
  ["http://172.20.0.1/", false],
  ["http://100.64.1.1/", false],
  ["http://[::1]/", false],
  ["http://[::ffff:127.0.0.1]/", false],
  ["file:///etc/passwd", false],
  ["http://user:pass@example.com/", false],
  ["https://example.com/", true],
  ["https://stream.radiojar.com/abc", true],
];

let failed = 0;
for (const [url, shouldPass] of cases) {
  let passed = true;
  try {
    await assertPublicUrl(url);
  } catch {
    passed = false;
  }
  const ok = passed === shouldPass;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${url.padEnd(45)} expected=${shouldPass ? "allowed" : "blocked"} got=${passed ? "allowed" : "blocked"}`);
}
console.log(failed === 0 ? "\nALL SSRF CHECKS PASSED" : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
