import type { Run } from '@terraplan/shared/db';

export interface ExecutionResult {
  commitSha: string | null;
  planSummary: string | null;
  terraformVersion?: string | null;
  /** Absolute paths produced during the run (uploaded by process-run). */
  planFilePath?: string | null;
  planJsonPath?: string | null;
  /** Extra secret values discovered during execution (STS, tokens, …). */
  secrets?: string[];
  /** Optional cleanup for staged artifact dirs (call after upload). */
  cleanup?: () => Promise<void>;
}

export interface ExecuteContext {
  /** Register a secret so subsequent (and final) log lines redact it. */
  addSecret: (value: string) => void;
}

export interface Executor {
  /**
   * Runs the Terraform action for `run`. Calls `emit` with each chunk of output
   * and throws on failure (the error message becomes the run's error).
   */
  execute(
    run: Run,
    emit: (chunk: string) => void,
    ctx?: ExecuteContext,
  ): Promise<ExecutionResult>;
}
