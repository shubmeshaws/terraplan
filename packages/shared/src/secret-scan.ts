/**
 * Secret scanning for plan/log output. Complements known-value redaction with
 * heuristic detectors. Findings are redacted in-place; high-severity hits can
 * fail a run when `failOnFindings` is enabled.
 */

export type SecretSeverity = 'high' | 'medium' | 'low';

export interface SecretFinding {
  rule: string;
  severity: SecretSeverity;
  /** 0-based index into the original string (approximate). */
  index: number;
  excerpt: string;
}

const PLACEHOLDER = '***REDACTED***';

interface Rule {
  id: string;
  severity: SecretSeverity;
  re: RegExp;
  replace?: string | ((m: string) => string);
}

const RULES: Rule[] = [
  {
    id: 'aws-access-key',
    severity: 'high',
    re: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    id: 'aws-secret-key-labeled',
    severity: 'high',
    re: /((?:AWS_|aws_)?(?:SecretAccessKey|secret_access_key|SECRET_ACCESS_KEY)\s*[=:]\s*)([A-Za-z0-9/+=]{30,})/g,
    replace: `$1${PLACEHOLDER}`,
  },
  {
    id: 'private-key',
    severity: 'high',
    re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
  },
  {
    id: 'github-pat',
    severity: 'high',
    re: /\bghp_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'github-oauth',
    severity: 'high',
    re: /\bgho_[A-Za-z0-9]{36}\b/g,
  },
  {
    id: 'slack-token',
    severity: 'high',
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    id: 'stripe-key',
    severity: 'high',
    re: /\bsk_live_[A-Za-z0-9]{20,}\b/g,
  },
  {
    id: 'generic-api-key-labeled',
    severity: 'medium',
    re: /((?:api[_-]?key|apikey|secret|password|token)\s*[=:]\s*["']?)([A-Za-z0-9/+=_\-.]{16,})/gi,
    replace: `$1${PLACEHOLDER}`,
  },
  {
    id: 'jwt',
    severity: 'medium',
    re: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  },
  {
    id: 'connection-string-password',
    severity: 'high',
    re: /((?:postgres|mysql|mongodb(?:\+srv)?|redis):\/\/[^:\s/]+:)([^@\s/]+)(@)/gi,
    replace: `$1${PLACEHOLDER}$3`,
  },
];

function excerptAt(text: string, index: number, len = 48): string {
  const start = Math.max(0, index - 8);
  const end = Math.min(text.length, index + len);
  return text.slice(start, end).replace(/\s+/g, ' ');
}

export function scanForSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text)) !== null) {
      findings.push({
        rule: rule.id,
        severity: rule.severity,
        index: m.index,
        excerpt: excerptAt(text, m.index),
      });
      if (!rule.re.global) break;
    }
  }
  return findings;
}

export function redactScannedSecrets(text: string): { text: string; findings: SecretFinding[] } {
  const findings = scanForSecrets(text);
  let out = text;
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    if (rule.replace) {
      out = out.replace(rule.re, rule.replace as string);
    } else {
      out = out.replace(rule.re, PLACEHOLDER);
    }
  }
  return { text: out, findings };
}

/**
 * Scan + scrub terraform plan JSON (or any large text artifact).
 * Returns scrubbed content and whether high-severity secrets were present.
 */
export function scrubPlanOutput(text: string): {
  text: string;
  findings: SecretFinding[];
  hasHighSeverity: boolean;
} {
  const { text: scrubbed, findings } = redactScannedSecrets(text);
  return {
    text: scrubbed,
    findings,
    hasHighSeverity: findings.some((f) => f.severity === 'high'),
  };
}

export class SecretScanBlockedError extends Error {
  constructor(public readonly findings: SecretFinding[]) {
    const rules = [...new Set(findings.filter((f) => f.severity === 'high').map((f) => f.rule))];
    super(
      `Plan/output blocked: high-severity secrets detected (${rules.join(', ') || 'unknown'})`,
    );
    this.name = 'SecretScanBlockedError';
  }
}
