import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  BitbucketConnectionDto,
  BitbucketWebhookDeliveryDto,
  SessionUser,
  UpsertBitbucketConnectionInput,
} from '@terraplan/shared';
import {
  BitbucketApiError,
  BitbucketClient,
  formatPlanPrComment,
  maskSecret,
} from '@terraplan/shared';
import type { Prisma } from '@terraplan/shared/db';
import { AuditService } from '../audit/audit.service';
import { env } from '../env';
import { PrismaService } from '../infra/prisma.service';
import { RunQueueService } from '../infra/run-queue.service';
import { credentialsFromInput, openCredentials, sealCredentials } from './credentials';

@Injectable()
export class BitbucketService {
  private readonly logger = new Logger(BitbucketService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: RunQueueService,
  ) {}

  webhookUrl() {
    return `${env.API_PUBLIC_URL}/api/v1/hooks/bitbucket`;
  }

  async getConnectionDto(): Promise<BitbucketConnectionDto> {
    const row = await this.prisma.bitbucketConnection.findUnique({ where: { id: 'default' } });
    if (!row) {
      return {
        connected: false,
        workspace: null,
        authMode: null,
        status: 'disconnected',
        postPlanComments: true,
        autoPlanOnPr: false,
        defaultPlanEnvironment: 'dev',
        webhookUrl: this.webhookUrl(),
        webhookSecretSet: false,
        clientIdPreview: null,
        usernamePreview: null,
        lastSyncAt: null,
        lastTestAt: null,
        lastError: null,
        connectedById: null,
        updatedAt: null,
      };
    }
    let clientIdPreview: string | null = null;
    let usernamePreview: string | null = null;
    try {
      const creds = openCredentials(row.credentialsCiphertext, row.authMode);
      if (row.authMode === 'oauth_consumer') {
        clientIdPreview = maskSecret((creds as { clientId: string }).clientId);
      } else {
        usernamePreview = (creds as { username: string }).username;
      }
    } catch {
      /* ignore decrypt failures in DTO */
    }
    return {
      // Row present means credentials are stored; `status` reflects last test/sync.
      connected: true,
      workspace: row.workspace,
      authMode: row.authMode,
      status: row.status,
      postPlanComments: row.postPlanComments,
      autoPlanOnPr: row.autoPlanOnPr,
      defaultPlanEnvironment: row.defaultPlanEnvironment,
      webhookUrl: this.webhookUrl(),
      webhookSecretSet: !!row.webhookSecret,
      clientIdPreview,
      usernamePreview,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      lastTestAt: row.lastTestAt?.toISOString() ?? null,
      lastError: row.lastError,
      connectedById: row.connectedById,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async upsertConnection(actor: SessionUser, input: UpsertBitbucketConnectionInput, ip?: string | null) {
    const creds = credentialsFromInput(input);
    const ciphertext = sealCredentials(creds);
    const existing = await this.prisma.bitbucketConnection.findUnique({ where: { id: 'default' } });
    // Blank webhook secret on edit keeps the previous value.
    const webhookSecret =
      input.webhookSecret && input.webhookSecret.length > 0
        ? input.webhookSecret
        : (existing?.webhookSecret ?? null);
    const row = await this.prisma.bitbucketConnection.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        workspace: input.workspace,
        authMode: input.authMode,
        credentialsCiphertext: ciphertext,
        webhookSecret,
        postPlanComments: input.postPlanComments,
        autoPlanOnPr: input.autoPlanOnPr,
        defaultPlanEnvironment: input.defaultPlanEnvironment,
        status: 'configured',
        connectedById: actor.id,
      },
      update: {
        workspace: input.workspace,
        authMode: input.authMode,
        credentialsCiphertext: ciphertext,
        webhookSecret,
        postPlanComments: input.postPlanComments,
        autoPlanOnPr: input.autoPlanOnPr,
        defaultPlanEnvironment: input.defaultPlanEnvironment,
        status: 'configured',
        lastError: null,
        connectedById: actor.id,
      },
    });

    await this.audit.write({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'bitbucket.connect',
      targetType: 'bitbucket_connection',
      targetId: row.id,
      metadata: { workspace: row.workspace, authMode: row.authMode },
      ip,
    });

    // Validate immediately so the admin sees a clear error.
    await this.testConnection(actor, ip);
    return this.getConnectionDto();
  }

  async disconnect(actor: SessionUser, ip?: string | null) {
    const existing = await this.prisma.bitbucketConnection.findUnique({ where: { id: 'default' } });
    if (!existing) throw new NotFoundException('No Bitbucket connection configured');
    await this.prisma.bitbucketConnection.delete({ where: { id: 'default' } });
    await this.audit.write({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'bitbucket.disconnect',
      targetType: 'bitbucket_connection',
      targetId: 'default',
      metadata: { workspace: existing.workspace },
      ip,
    });
    return this.getConnectionDto();
  }

  async testConnection(actor?: SessionUser | null, ip?: string | null) {
    const client = await this.requireClient();
    try {
      const info = await client.test();
      await this.prisma.bitbucketConnection.update({
        where: { id: 'default' },
        data: { status: 'connected', lastTestAt: new Date(), lastError: null },
      });
      if (actor) {
        await this.audit.write({
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'bitbucket.test',
          targetType: 'bitbucket_connection',
          targetId: 'default',
          metadata: info,
          ip,
        });
      }
      return { ok: true as const, ...info };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.bitbucketConnection.update({
        where: { id: 'default' },
        data: { status: 'error', lastTestAt: new Date(), lastError: message },
      });
      throw new BadRequestException(message);
    }
  }

  async sync(actor: SessionUser, ip?: string | null) {
    const repos = await this.listRepositories();
    await this.prisma.bitbucketConnection.update({
      where: { id: 'default' },
      data: { lastSyncAt: new Date(), status: 'connected', lastError: null },
    });
    await this.audit.write({
      actorId: actor.id,
      actorEmail: actor.email,
      action: 'bitbucket.sync',
      targetType: 'bitbucket_connection',
      targetId: 'default',
      metadata: { repositories: repos.length },
      ip,
    });
    return { repositories: repos.length, syncedAt: new Date().toISOString() };
  }

  async listRepositories() {
    return this.withBitbucket(() => this.requireClient().then((c) => c.listRepositories()));
  }

  async listBranches(repo: string) {
    return this.withBitbucket(() => this.requireClient().then((c) => c.listBranches(repo)));
  }

  async listPullRequests(repo: string) {
    return this.withBitbucket(() =>
      this.requireClient().then((c) => c.listPullRequests(repo, 'OPEN')),
    );
  }

  async listCommits(repo: string, branch?: string) {
    return this.withBitbucket(() => this.requireClient().then((c) => c.listCommits(repo, branch)));
  }

  private async withBitbucket<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof NotFoundException || err instanceof ServiceUnavailableException) throw err;
      const message = err instanceof Error ? err.message : String(err);
      throw new BadGatewayException(message);
    }
  }

  async listWebhookDeliveries(limit = 50): Promise<BitbucketWebhookDeliveryDto[]> {
    const rows = await this.prisma.bitbucketWebhookDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      event: r.event,
      deliveryId: r.deliveryId,
      repository: r.repository,
      pullRequestId: r.pullRequestId,
      result: r.result,
      error: r.error,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Handles Bitbucket Cloud webhook payloads for pullrequest:created / updated.
   * Optionally auto-queues a plan when `autoPlanOnPr` is enabled.
   */
  async handleWebhook(
    event: string,
    body: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ) {
    const connection = await this.prisma.bitbucketConnection.findUnique({ where: { id: 'default' } });
    if (!connection) {
      throw new ServiceUnavailableException('Bitbucket is not connected');
    }
    this.assertWebhookAuth(connection.webhookSecret, headers);

    const pr = (body.pullrequest ?? body.pull_request) as
      | {
          id?: number;
          title?: string;
          links?: { html?: { href?: string } };
          source?: { branch?: { name?: string }; commit?: { hash?: string } };
          destination?: { branch?: { name?: string } };
        }
      | undefined;
    const repo = (body.repository as { name?: string; full_name?: string } | undefined) ?? undefined;
    const repoSlug =
      repo?.name ||
      (repo?.full_name?.includes('/') ? repo.full_name.split('/').pop() : repo?.full_name) ||
      null;
    const pullRequestId = pr?.id ?? null;

    const delivery = await this.prisma.bitbucketWebhookDelivery.create({
      data: {
        connectionId: 'default',
        event,
        deliveryId: headers['x-request-uuid'] || headers['x-hook-uuid'] || null,
        repository: repoSlug,
        pullRequestId,
        payload: body as Prisma.InputJsonValue,
        result: 'received',
      },
    });

    if (!['pullrequest:created', 'pullrequest:updated'].includes(event)) {
      await this.prisma.bitbucketWebhookDelivery.update({
        where: { id: delivery.id },
        data: { result: 'ignored' },
      });
      return { ok: true, ignored: true, event };
    }

    if (!connection.autoPlanOnPr || !repoSlug || !pr?.source?.branch?.name || !pullRequestId) {
      await this.prisma.bitbucketWebhookDelivery.update({
        where: { id: delivery.id },
        data: { result: 'recorded' },
      });
      return { ok: true, autoPlan: false };
    }

    try {
      const run = await this.prisma.run.create({
        data: {
          repository: repoSlug,
          branch: pr.source.branch.name,
          environment: connection.defaultPlanEnvironment,
          action: 'plan',
          status: 'queued',
          triggeredBy: 'bitbucket-webhook',
          commitSha: pr.source.commit?.hash ?? null,
          pullRequestId,
          pullRequestUrl: pr.links?.html?.href ?? null,
        },
      });
      await this.queue.enqueue(run.id);
      await this.prisma.bitbucketWebhookDelivery.update({
        where: { id: delivery.id },
        data: { result: 'plan_queued' },
      });
      return { ok: true, autoPlan: true, runId: run.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.bitbucketWebhookDelivery.update({
        where: { id: delivery.id },
        data: { result: 'error', error: message },
      });
      throw err;
    }
  }

  async postPlanComment(runId: string) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) return { skipped: true, reason: 'run_missing' };
    if (run.action !== 'plan') return { skipped: true, reason: 'not_a_plan' };
    if (!run.pullRequestId) return { skipped: true, reason: 'no_pr' };
    if (!['succeeded', 'failed'].includes(run.status)) {
      return { skipped: true, reason: 'not_finished' };
    }

    const connection = await this.prisma.bitbucketConnection.findUnique({ where: { id: 'default' } });
    if (!connection?.postPlanComments) return { skipped: true, reason: 'comments_disabled' };

    const client = await this.clientFromRow(connection);
    const markdown = formatPlanPrComment({
      runId: run.id,
      repository: run.repository,
      branch: run.branch,
      environment: run.environment,
      status: run.status as 'succeeded' | 'failed',
      planSummary: run.planSummary,
      output: run.output,
      error: run.error,
      commitSha: run.commitSha,
      webUrl: `${env.WEB_PUBLIC_URL}/#dashboard`,
    });

    try {
      const comment = await client.postPullRequestComment(
        run.repository,
        run.pullRequestId,
        markdown,
      );
      await this.prisma.run.update({
        where: { id: run.id },
        data: { prCommentId: comment.id, prCommentPostedAt: new Date() },
      });
      this.logger.log(`Posted PR comment ${comment.id} for run ${run.id}`);
      return { ok: true, commentId: comment.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to post PR comment for run ${run.id}: ${message}`);
      if (err instanceof BitbucketApiError) {
        return { ok: false, error: message, status: err.status };
      }
      return { ok: false, error: message };
    }
  }

  private assertWebhookAuth(
    secret: string | null,
    headers: Record<string, string | undefined>,
  ) {
    if (!secret) return;
    const provided =
      headers['x-terraplan-webhook-secret'] ||
      headers['x-hook-secret'] ||
      (headers.authorization?.startsWith('Bearer ')
        ? headers.authorization.slice(7)
        : undefined);
    if (provided !== secret) {
      throw new BadRequestException('Invalid webhook secret');
    }
  }

  private async requireClient() {
    const row = await this.prisma.bitbucketConnection.findUnique({ where: { id: 'default' } });
    if (!row) throw new NotFoundException('Connect a Bitbucket workspace first');
    return this.clientFromRow(row);
  }

  private async clientFromRow(row: {
    workspace: string;
    authMode: 'oauth_consumer' | 'app_password';
    credentialsCiphertext: string;
  }) {
    const creds = openCredentials(row.credentialsCiphertext, row.authMode);
    return new BitbucketClient(row.workspace, row.authMode, creds);
  }
}
