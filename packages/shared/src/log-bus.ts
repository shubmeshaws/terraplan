/**
 * Redis pub/sub + short buffer for live run logs (SSE consumers).
 * Channel per run; buffer retains recent chunks for late subscribers.
 */

export const runLogChannel = (runId: string) => `terraplan:run-logs:${runId}`;
export const runLogBufferKey = (runId: string) => `terraplan:run-logs:${runId}:buf`;

export const RUN_LOG_BUFFER_MAX = 2_000;
export const RUN_LOG_BUFFER_TTL_SEC = 60 * 60 * 6; // 6h

export type RunLogEvent =
  | { type: 'chunk'; text: string }
  | { type: 'done'; status: 'succeeded' | 'failed' | 'cancelled' };

export function encodeRunLogEvent(event: RunLogEvent): string {
  return JSON.stringify(event);
}

export function decodeRunLogEvent(raw: string): RunLogEvent | null {
  try {
    const parsed = JSON.parse(raw) as RunLogEvent;
    if (parsed?.type === 'chunk' && typeof parsed.text === 'string') return parsed;
    if (
      parsed?.type === 'done' &&
      (parsed.status === 'succeeded' || parsed.status === 'failed' || parsed.status === 'cancelled')
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
