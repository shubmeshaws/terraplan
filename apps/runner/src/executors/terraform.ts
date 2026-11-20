import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  assertSafeTerraformArgs,
  assumeRole,
  credentialsToEnv,
  getArtifactFile,
  parseDeniedFlagsEnv,
  scrubPlanOutput,
  SecretScanBlockedError,
  type ArtifactStoreConfig,
} from '@terraplan/shared';
import type { EnvironmentConfig, PrismaClient, Run } from '@terraplan/shared/db';
import { cloneRepository } from '../clone';
import { resolveTerraformBinary } from '../terraform-bin';
import type { ExecuteContext, Executor, ExecutionResult } from './types';

export interface ExecOptions {
  timeoutMs: number;
  deniedExact: string[];
  deniedPrefixes: string[];
  secretScanFailOnHigh: boolean;
}

function exec(
  cmd: string,
  args: string[],
  cwd: string,
  emit: (chunk: string) => void,
  extraEnv: Record<string, string> | undefined,
  opts: ExecOptions,
): Promise<string> {
  assertSafeTerraformArgs(args, {
    deniedExact: opts.deniedExact,
    deniedPrefixes: opts.deniedPrefixes,
  });
  return new Promise((done, fail) => {
    emit(`$ ${[cmd, ...args].join(' ')}\n`);
    let out = '';
    const child = spawn(cmd, args, {
      cwd,
      env: {
        ...process.env,
        TF_IN_AUTOMATION: '1',
        TF_INPUT: '0',
        ...(extraEnv || {}),
      },
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5_000).unref();
      fail(new Error(`terraform ${args[0] ?? ''} timed out after ${opts.timeoutMs}ms`));
    }, opts.timeoutMs);
    const onData = (d: Buffer) => {
      const s = d.toString();
      out += s;
      emit(s);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => {
      clearTimeout(timer);
      fail(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      code === 0 ? done(out) : fail(new Error(`${cmd} ${args[0]} exited with code ${code}`));
    });
  });
}

function backendArgs(cfg: EnvironmentConfig): string[] {
  const backend = (cfg.backendConfig || {}) as {
    bucket?: string;
    key?: string;
    region?: string;
    dynamodbTable?: string;
    encrypt?: boolean;
  };
  const args: string[] = [];
  if (backend.bucket) args.push(`-backend-config=bucket=${backend.bucket}`);
  if (backend.key) args.push(`-backend-config=key=${backend.key}`);
  if (backend.region) args.push(`-backend-config=region=${backend.region}`);
  if (backend.dynamodbTable) args.push(`-backend-config=dynamodb_table=${backend.dynamodbTable}`);
  if (backend.encrypt !== false) args.push('-backend-config=encrypt=true');
  return args;
}

function varFileArgs(cfg: EnvironmentConfig): string[] {
  const files = Array.isArray(cfg.variableFiles) ? (cfg.variableFiles as string[]) : [];
  return files.flatMap((f) => ['-var-file', f]);
}

export interface TerraformExecutorOptions {
  versionsDir: string;
  workspacesDir: string;
  encryptionKeyMaterial: string;
  fallbackBin: string;
  artifacts: ArtifactStoreConfig;
  runTimeoutSeconds: number;
  deniedFlagsEnv?: string;
  secretScanFailOnHigh: boolean;
}

/**
 * Isolated clone → pinned terraform binary → init / validate /
 * plan -out + show -json (plan/destroy) OR apply exact saved plan (apply).
 */
export class TerraformExecutor implements Executor {
  private readonly execOpts: ExecOptions;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly opts: TerraformExecutorOptions,
  ) {
    const denied = parseDeniedFlagsEnv(opts.deniedFlagsEnv);
    this.execOpts = {
      timeoutMs: opts.runTimeoutSeconds * 1000,
      deniedExact: denied.exact,
      deniedPrefixes: denied.prefixes,
      secretScanFailOnHigh: opts.secretScanFailOnHigh,
    };
  }

  async execute(run: Run, emit: (chunk: string) => void, ctx?: ExecuteContext) {
    const cfg = await this.prisma.environmentConfig.findUnique({
      where: { name: run.environment },
    });
    if (!cfg || !cfg.enabled) {
      throw new Error(
        `Environment "${run.environment}" is not configured or is disabled. Ask an admin to set it up under Admin → Environments.`,
      );
    }

    const secrets: string[] = [];
    const track = (v: string) => {
      secrets.push(v);
      ctx?.addSecret(v);
    };

    const clone = await cloneRepository({
      prisma: this.prisma,
      repository: cfg.repository || run.repository,
      branch: run.branch,
      commitSha: run.commitSha,
      workspacesDir: this.opts.workspacesDir,
      encryptionKeyMaterial: this.opts.encryptionKeyMaterial,
      emit,
    });
    for (const s of clone.secrets) track(s);

    try {
      const repoRoot = clone.workDir;
      const dir = resolve(repoRoot, cfg.terraformDir || '.');
      if (!dir.startsWith(repoRoot) || !existsSync(dir)) {
        throw new Error(`Terraform dir not found at ${cfg.terraformDir || '.'}`);
      }

      const version = cfg.terraformVersion || '1.9.8';
      let bin: string;
      try {
        bin = await resolveTerraformBinary(version, this.opts.versionsDir, emit);
      } catch (err) {
        emit(
          `# pinned download failed (${err instanceof Error ? err.message : String(err)}); falling back to ${this.opts.fallbackBin}\n`,
        );
        bin = this.opts.fallbackBin;
      }

      emit(
        `# assuming role ${cfg.roleArn} (account ${cfg.awsAccountId}, session ${cfg.sessionDurationSeconds}s)\n`,
      );
      let awsEnv: Record<string, string>;
      try {
        const creds = await assumeRole({
          roleArn: cfg.roleArn,
          sessionName: `terraplan-${run.environment}-${run.id.slice(-8)}`,
          durationSeconds: cfg.sessionDurationSeconds,
          externalId: cfg.externalId,
          region: (cfg.backendConfig as { region?: string } | null)?.region,
        });
        awsEnv = credentialsToEnv(creds);
        track(creds.accessKeyId);
        track(creds.secretAccessKey);
        track(creds.sessionToken);
        emit(`# STS credentials expire at ${creds.expiration.toISOString()}\n`);
        await this.prisma.environmentConfig.update({
          where: { id: cfg.id },
          data: { lastAssumedAt: new Date(), lastAssumeError: null },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.prisma.environmentConfig.update({
          where: { id: cfg.id },
          data: { lastAssumeError: message },
        });
        throw new Error(`Failed to assume role ${cfg.roleArn}: ${message}`);
      }

      const tf = (...args: string[]) => exec(bin, args, dir, emit, awsEnv, this.execOpts);
      const quietShow = (...args: string[]) =>
        exec(bin, args, dir, () => {}, awsEnv, this.execOpts);

      await tf('init', '-input=false', '-no-color', '-reconfigure', ...backendArgs(cfg));
      await tf('validate', '-no-color');
      await tf('workspace', 'select', '-or-create', run.environment).catch(() =>
        emit(`# workspace select skipped (backend may not support workspaces)\n`),
      );

      await mkdir(this.opts.workspacesDir, { recursive: true });
      const stageDir = await mkdtemp(join(this.opts.workspacesDir, 'artifacts-'));
      const stagedPlan = join(stageDir, 'plan.tfplan');
      const stagedJson = join(stageDir, 'plan.json');
      const cleanupStage = async () => {
        await rm(stageDir, { recursive: true, force: true }).catch(() => {});
      };

      // ——— APPLY: use the exact saved plan binary from the source plan run ———
      if (run.action === 'apply') {
        const planKey = run.planFileKey;
        if (!planKey) {
          await cleanupStage();
          throw new Error(
            'Apply is missing planFileKey — create apply from a succeeded plan run so the exact .tfplan is reused.',
          );
        }
        const planFile = join(dir, `${run.id}.tfplan`);
        emit(`# downloading saved plan artifact ${planKey}\n`);
        await getArtifactFile(this.opts.artifacts, planKey, planFile);
        await copyFile(planFile, stagedPlan);

        if (run.planJsonKey) {
          try {
            await getArtifactFile(this.opts.artifacts, run.planJsonKey, stagedJson);
          } catch {
            const jsonOut = await quietShow('show', '-json', planFile);
            await writeFile(stagedJson, this.scrubAndMaybeBlock(jsonOut, emit), 'utf8');
          }
        } else {
          const jsonOut = await quietShow('show', '-json', planFile);
          await writeFile(stagedJson, this.scrubAndMaybeBlock(jsonOut, emit), 'utf8');
        }

        emit(`# applying exact saved plan (no re-plan)\n`);
        const applyOut = await tf('apply', '-input=false', '-no-color', planFile);
        const summary =
          applyOut.match(/^((Apply|Destroy) complete!.*)$/m)?.[1] ?? run.planSummary;

        return {
          commitSha: clone.commitSha,
          planSummary: summary,
          terraformVersion: version,
          planFilePath: stagedPlan,
          planJsonPath: stagedJson,
          secrets,
          cleanup: cleanupStage,
        } satisfies ExecutionResult;
      }

      // ——— PLAN / DESTROY: generate plan -out, show -json, then apply for destroy ———
      const planFile = join(dir, `${run.id}.tfplan`);
      const planJsonFile = join(dir, `${run.id}.tfplan.json`);
      const planArgs = [
        'plan',
        '-input=false',
        '-no-color',
        `-out=${planFile}`,
        ...varFileArgs(cfg),
      ];
      if (run.action === 'destroy') planArgs.push('-destroy');

      const planOut = await tf(...planArgs);
      const planSummary = planOut.match(/^(Plan: .*|No changes\..*)$/m)?.[1] ?? null;

      const jsonOut = await quietShow('show', '-json', planFile);
      await writeFile(planJsonFile, this.scrubAndMaybeBlock(jsonOut, emit), 'utf8');
      emit(`# wrote plan JSON (${(await readFile(planJsonFile)).byteLength} bytes)\n`);

      let summary = planSummary;
      if (run.action === 'destroy') {
        const applyOut = await tf('apply', '-input=false', '-no-color', planFile);
        summary = applyOut.match(/^((Apply|Destroy) complete!.*)$/m)?.[1] ?? planSummary;
      }

      await copyFile(planFile, stagedPlan);
      await copyFile(planJsonFile, stagedJson);

      return {
        commitSha: clone.commitSha,
        planSummary: summary,
        terraformVersion: version,
        planFilePath: stagedPlan,
        planJsonPath: stagedJson,
        secrets,
        cleanup: cleanupStage,
      } satisfies ExecutionResult;
    } finally {
      await clone.cleanup();
    }
  }

  private scrubAndMaybeBlock(text: string, emit: (chunk: string) => void): string {
    const { text: scrubbed, findings, hasHighSeverity } = scrubPlanOutput(text);
    if (findings.length) {
      emit(
        `# secret scan: ${findings.length} finding(s)` +
          (hasHighSeverity ? ' (high severity)' : '') +
          '\n',
      );
      for (const f of findings.slice(0, 10)) {
        emit(`#   - ${f.severity} ${f.rule}\n`);
      }
    }
    if (hasHighSeverity && this.execOpts.secretScanFailOnHigh) {
      throw new SecretScanBlockedError(findings);
    }
    return scrubbed;
  }
}
