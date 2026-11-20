/**
 * Deny-list of dangerous Terraform CLI flags. The runner builds every argv
 * itself; this guard rejects anything that would disable locking, retarget
 * resources, escape the workspace, or inject vars/state paths.
 */

/** Exact flags that are always blocked. */
export const DEFAULT_DENIED_TERRAFORM_FLAGS = [
  '-lock=false',
  '-lock=0',
  '-auto-approve',
  '-chdir',
  '-target',
  '-replace',
  '-plugin-dir',
  '-plugin-cache-dir',
  '-from-module',
  '-backend=false',
  '-migrate-state',
  '-force-copy',
  '-ignore-remote-version',
  '-state',
  '-state-out',
  '-backup',
] as const;

/** Prefixes blocked even with arbitrary values. */
export const DEFAULT_DENIED_TERRAFORM_PREFIXES = [
  '-lock=false',
  '-chdir=',
  '-target=',
  '-replace=',
  '-plugin-dir=',
  '-plugin-cache-dir=',
  '-from-module=',
  '-state=',
  '-state-out=',
  '-backup=',
  // Operator-injected vars are never allowed; env configs supply -var-file only
  // through the controlled runner path (see RUNNER_ALLOWED_PREFIXES).
] as const;

/** Prefixes the runner may use when constructing argv. */
export const RUNNER_ALLOWED_PREFIXES = [
  '-backend-config=',
  '-out=',
  '-var-file=',
  '-input=',
] as const;

export class DeniedTerraformFlagError extends Error {
  constructor(public readonly flag: string) {
    super(`Terraform flag denied by policy: ${flag}`);
    this.name = 'DeniedTerraformFlagError';
  }
}

export function findDeniedTerraformFlag(
  args: readonly string[],
  opts: {
    deniedExact?: readonly string[];
    deniedPrefixes?: readonly string[];
    allowedPrefixes?: readonly string[];
  } = {},
): string | null {
  const deniedExact = new Set(
    (opts.deniedExact ?? DEFAULT_DENIED_TERRAFORM_FLAGS).map((f) => f.toLowerCase()),
  );
  const deniedPrefixes = (opts.deniedPrefixes ?? DEFAULT_DENIED_TERRAFORM_PREFIXES).map((p) =>
    p.toLowerCase(),
  );
  const allowedPrefixes = (opts.allowedPrefixes ?? RUNNER_ALLOWED_PREFIXES).map((p) =>
    p.toLowerCase(),
  );

  for (const raw of args) {
    const arg = raw.trim();
    if (!arg.startsWith('-')) continue;
    const lower = arg.toLowerCase();

    if (allowedPrefixes.some((p) => lower.startsWith(p))) continue;
    // Safe fixed flags the runner uses
    if (
      lower === '-no-color' ||
      lower === '-reconfigure' ||
      lower === '-or-create' ||
      lower === '-destroy' ||
      lower === '-json' ||
      lower === '-input=false' ||
      lower === '-var-file' // paired with next positional path from EnvironmentConfig
    ) {
      continue;
    }

    if (deniedExact.has(lower)) return arg;
    for (const prefix of deniedPrefixes) {
      if (lower === prefix.replace(/=$/, '') || lower.startsWith(prefix)) return arg;
    }
  }
  return null;
}

export function assertSafeTerraformArgs(
  args: readonly string[],
  opts?: Parameters<typeof findDeniedTerraformFlag>[1],
): void {
  const bad = findDeniedTerraformFlag(args, opts);
  if (bad) throw new DeniedTerraformFlagError(bad);
}

/** Merge env override (comma-separated) onto the default deny lists. */
export function parseDeniedFlagsEnv(raw: string | undefined): {
  exact: string[];
  prefixes: string[];
} {
  const exact: string[] = [...DEFAULT_DENIED_TERRAFORM_FLAGS];
  const prefixes: string[] = [...DEFAULT_DENIED_TERRAFORM_PREFIXES];
  if (!raw?.trim()) return { exact, prefixes };
  for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    exact.push(part);
    if (part.includes('=')) prefixes.push(part.endsWith('=') ? part : part.split('=')[0]! + '=');
    else prefixes.push(part + '=');
  }
  return { exact, prefixes };
}
