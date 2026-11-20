/**
 * Redacts secrets from terraform / git console output before it is stored,
 * streamed, or uploaded. Matching is case-sensitive on the secret value itself.
 */

const PLACEHOLDER = '***REDACTED***';

/** Extra patterns that look like secrets even when we don't know the exact value. */
const PATTERN_REDACTORS: Array<(s: string) => string> = [
  // AWS access key ids
  (s) => s.replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, PLACEHOLDER),
  // AWS secret access keys (40-char base64-ish) after common labels
  (s) =>
    s.replace(
      /((?:AWS_|aws_)?(?:SecretAccessKey|secret_access_key|SECRET_ACCESS_KEY)\s*[=:]\s*)([A-Za-z0-9/+=]{30,})/g,
      `$1${PLACEHOLDER}`,
    ),
  // Session tokens
  (s) =>
    s.replace(
      /((?:AWS_|aws_)?(?:SessionToken|session_token|SESSION_TOKEN)\s*[=:]\s*)([A-Za-z0-9/+=]{20,})/g,
      `$1${PLACEHOLDER}`,
    ),
  // Bearer tokens / Basic auth in URLs and headers
  (s) => s.replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, `$1${PLACEHOLDER}`),
  (s) => s.replace(/(Basic\s+)[A-Za-z0-9+/=]+/gi, `$1${PLACEHOLDER}`),
  // Credentials embedded in git URLs: https://user:pass@host
  (s) => s.replace(/(https?:\/\/)([^/\s:@]+):([^/\s@]+)@/gi, `$1$2:${PLACEHOLDER}@`),
  // x-access-token style
  (s) => s.replace(/(x-token-auth:)[^@\s]+/gi, `$1${PLACEHOLDER}`),
];

export function collectSecretValues(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (!v || v.length < 6) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  // Longest first so overlapping secrets redact completely.
  out.sort((a, b) => b.length - a.length);
  return out;
}

export function redactSecrets(text: string, secrets: readonly string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret) continue;
    // Split into chunks to avoid RegExp DoS on huge secrets; use split/join.
    if (out.includes(secret)) {
      out = out.split(secret).join(PLACEHOLDER);
    }
  }
  for (const fn of PATTERN_REDACTORS) {
    out = fn(out);
  }
  return out;
}
