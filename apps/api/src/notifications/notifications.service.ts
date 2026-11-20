import { Injectable, Logger } from '@nestjs/common';
import type { RunDto } from '@terraplan/shared';
import { env } from '../env';

type NotifyEvent =
  | 'waiting_approval'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly events = new Set(env.NOTIFY_ON);

  shouldNotify(status: string): boolean {
    return this.events.has(status);
  }

  async notifyRunEvent(run: RunDto, event: NotifyEvent): Promise<void> {
    if (!this.shouldNotify(event)) return;
    const title = `terraplan · ${run.action} ${event}`;
    const text = [
      `*${run.action}* on *${run.environment}* → \`${event}\``,
      `Repo: \`${run.repository}\` · Branch: \`${run.branch}\``,
      `Run: \`${run.id}\` · By: ${run.triggeredBy}`,
      run.planSummary ? `Summary: ${run.planSummary}` : null,
      run.error ? `Error: ${run.error}` : null,
      run.pullRequestUrl ? `PR: ${run.pullRequestUrl}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    await Promise.allSettled([
      this.sendSlack(title, text, event),
      this.sendTeams(title, text, event),
    ]);
  }

  private async sendSlack(title: string, text: string, event: string) {
    const url = env.SLACK_WEBHOOK_URL;
    if (!url) return;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text: title,
          blocks: [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*${title}*\n${text}` },
            },
          ],
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        this.logger.warn(`Slack webhook ${res.status} for ${event}`);
      }
    } catch (err) {
      this.logger.warn(`Slack notify failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async sendTeams(title: string, text: string, event: string) {
    const url = env.TEAMS_WEBHOOK_URL;
    if (!url) return;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          '@type': 'MessageCard',
          '@context': 'http://schema.org/extensions',
          themeColor: event === 'failed' ? 'd91515' : event === 'succeeded' ? '0a7a3a' : '1f5eff',
          summary: title,
          sections: [{ activityTitle: title, text: text.replace(/\*/g, '') }],
        }),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        this.logger.warn(`Teams webhook ${res.status} for ${event}`);
      }
    } catch (err) {
      this.logger.warn(`Teams notify failed: ${err instanceof Error ? err.message : err}`);
    }
  }
}
