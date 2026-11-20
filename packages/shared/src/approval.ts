import type { ApprovalActor, ApprovalPolicy } from './environments';
import { destroyConfirmationPhrase, type Environment, type RunAction } from './domain';
import { ROLE_RANK, type RoleName } from './rbac';

export { destroyConfirmationPhrase };

/**
 * Whether a run must sit in `waiting_approval` before enqueue.
 * Plans never need approval. Apply/destroy follow the environment policy
 * (`anyone` = auto-queue; anything else = human approval required).
 * When no policy is loaded, fall back to: every destroy + every prod apply.
 */
export function requiresApproval(
  action: RunAction,
  environment: Environment,
  policy?: ApprovalPolicy | null,
): boolean {
  if (action === 'plan') return false;
  if (policy) {
    const actor = policy[action] as ApprovalActor;
    return actor !== 'anyone';
  }
  return action === 'destroy' || environment === 'prod';
}

/**
 * Can this role approve a run that the policy gates with `actor`?
 * Admin always can. Lower roles only when the policy asks for them or below.
 */
export function roleCanApprove(role: RoleName | null | undefined, actor: ApprovalActor): boolean {
  if (!role) return false;
  if (role === 'Admin') return true;
  switch (actor) {
    case 'anyone':
      return true;
    case 'planner':
      return ROLE_RANK[role] >= ROLE_RANK.Planner;
    case 'applier':
      return ROLE_RANK[role] >= ROLE_RANK.Applier;
    case 'admin':
      return false;
    default:
      return false;
  }
}

/** Lock TTL from policy (minutes), clamped. Default 45. */
export function lockTimeoutMs(policy?: ApprovalPolicy | null): number {
  const min = policy?.lockTimeoutMin ?? 45;
  const clamped = Math.min(480, Math.max(5, min));
  return clamped * 60_000;
}
