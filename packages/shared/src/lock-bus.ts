import type { EnvironmentLockDto } from './domain';

/** Redis pub/sub channel for live environment lock updates. */
export const LOCKS_CHANNEL = 'terraplan:locks';

/** Redis key holding the latest JSON snapshot of all env locks (+ waiting queues). */
export const LOCKS_SNAPSHOT_KEY = 'terraplan:locks:snapshot';

export const envLockKey = (environment: string) => `terraplan:env-lock:${environment}`;
export const envWaitKey = (environment: string) => `terraplan:env-wait:${environment}`;

export type LockBusEvent =
  | { type: 'snapshot'; locks: EnvironmentLockDto[] }
  | { type: 'acquired'; environment: string; locks: EnvironmentLockDto[] }
  | { type: 'released'; environment: string; locks: EnvironmentLockDto[] }
  | { type: 'waiting'; environment: string; locks: EnvironmentLockDto[] };

export function encodeLockBusEvent(event: LockBusEvent): string {
  return JSON.stringify(event);
}

export function decodeLockBusEvent(raw: string): LockBusEvent | null {
  try {
    const parsed = JSON.parse(raw) as LockBusEvent;
    if (!parsed?.type || !Array.isArray(parsed.locks)) return null;
    return parsed;
  } catch {
    return null;
  }
}
