import { logger } from './logger';

export async function notifyRunFinished(opts: {
  slackUrl?: string;
  teamsUrl?: string;
  notifyOn: string[];
  status: 'succeeded' | 'failed';
  runId: string;
  action: string;
  environment: string;
  repository: string;
  branch: string;
  triggeredBy: string;
  planSummary?: string | null;
  error?: string | null;
}) {
  if (!opts.notifyOn.includes(opts.status)) return;
  const title = `terraplan · ${opts.action} ${opts.status}`;
  const text = [
    `*${opts.action}* on *${opts.environment}* → \`${opts.status}\``,
    `Repo: \`${opts.repository}\` · Branch: \`${opts.branch}\``,
    `Run: \`${opts.runId}\` · By: ${opts.triggeredBy}`,
    opts.planSummary ? `Summary: ${opts.planSummary}` : null,
    opts.error ? `Error: ${opts.error}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  await Promise.allSettled([
    postSlack(opts.slackUrl, title, text),
    postTeams(opts.teamsUrl, title, text, opts.status),
  ]);
}

async function postSlack(url: string | undefined, title: string, text: string) {
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: title,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `*${title}*\n${text}` } }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) logger.warn('slack webhook failed', { status: res.status });
  } catch (err) {
    logger.warn('slack notify error', { error: err instanceof Error ? err.message : String(err) });
  }
}

async function postTeams(
  url: string | undefined,
  title: string,
  text: string,
  status: string,
) {
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        '@type': 'MessageCard',
        '@context': 'http://schema.org/extensions',
        themeColor: status === 'failed' ? 'd91515' : '0a7a3a',
        summary: title,
        sections: [{ activityTitle: title, text: text.replace(/\*/g, '') }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) logger.warn('teams webhook failed', { status: res.status });
  } catch (err) {
    logger.warn('teams notify error', { error: err instanceof Error ? err.message : String(err) });
  }
}
