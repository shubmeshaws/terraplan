import type {
  AppPasswordCredentials,
  BitbucketAuthMode,
  BitbucketBranchDto,
  BitbucketCommitDto,
  BitbucketCredentials,
  BitbucketPullRequestDto,
  BitbucketRepoDto,
  OAuthConsumerCredentials,
} from './bitbucket';

const API = 'https://api.bitbucket.org/2.0';
const TOKEN_URL = 'https://bitbucket.org/site/oauth2/access_token';

export class BitbucketApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'BitbucketApiError';
  }
}

export class BitbucketClient {
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly workspace: string,
    private readonly authMode: BitbucketAuthMode,
    private readonly credentials: BitbucketCredentials,
  ) {}

  async test(): Promise<{ workspace: string; displayName: string }> {
    const ws = await this.get<{ slug: string; name?: string }>(`/workspaces/${this.workspace}`);
    return { workspace: ws.slug, displayName: ws.name || ws.slug };
  }

  async listRepositories(pageLen = 50): Promise<BitbucketRepoDto[]> {
    const values = await this.paginate<{
      slug: string;
      name: string;
      full_name: string;
      description?: string;
      is_private?: boolean;
      mainbranch?: { name?: string };
      links?: { html?: { href?: string } };
      updated_on?: string;
    }>(`/repositories/${this.workspace}?pagelen=${pageLen}&sort=-updated_on`);
    return values.map((r) => ({
      slug: r.slug,
      name: r.name,
      fullName: r.full_name,
      description: r.description || null,
      isPrivate: !!r.is_private,
      defaultBranch: r.mainbranch?.name ?? null,
      htmlUrl: r.links?.html?.href ?? `https://bitbucket.org/${r.full_name}`,
      updatedOn: r.updated_on ?? null,
    }));
  }

  async listBranches(repo: string, pageLen = 50): Promise<BitbucketBranchDto[]> {
    const values = await this.paginate<{
      name: string;
      target?: { hash?: string; links?: { html?: { href?: string } } };
    }>(`/repositories/${this.workspace}/${repo}/refs/branches?pagelen=${pageLen}`);
    return values.map((b) => ({
      name: b.name,
      commitSha: b.target?.hash ?? null,
      commitUrl: b.target?.links?.html?.href ?? null,
    }));
  }

  async listPullRequests(
    repo: string,
    state: 'OPEN' | 'MERGED' | 'DECLINED' | 'SUPERSEDED' = 'OPEN',
    pageLen = 50,
  ): Promise<BitbucketPullRequestDto[]> {
    const values = await this.paginate<{
      id: number;
      title: string;
      state: string;
      source?: { branch?: { name?: string }; commit?: { hash?: string } };
      destination?: { branch?: { name?: string } };
      author?: { display_name?: string; nickname?: string };
      links?: { html?: { href?: string } };
      updated_on?: string;
    }>(`/repositories/${this.workspace}/${repo}/pullrequests?state=${state}&pagelen=${pageLen}`);
    return values.map((pr) => ({
      id: pr.id,
      title: pr.title,
      state: pr.state,
      sourceBranch: pr.source?.branch?.name ?? '',
      destinationBranch: pr.destination?.branch?.name ?? '',
      author: pr.author?.display_name || pr.author?.nickname || null,
      commitSha: pr.source?.commit?.hash ?? null,
      htmlUrl: pr.links?.html?.href ?? '',
      updatedOn: pr.updated_on ?? null,
    }));
  }

  async listCommits(repo: string, branch?: string, pageLen = 30): Promise<BitbucketCommitDto[]> {
    const qs = new URLSearchParams({ pagelen: String(pageLen) });
    if (branch) qs.set('include', branch);
    const values = await this.paginate<{
      hash: string;
      message?: string;
      date?: string;
      author?: { raw?: string; user?: { display_name?: string } };
      links?: { html?: { href?: string } };
    }>(`/repositories/${this.workspace}/${repo}/commits?${qs}`);
    return values.map((c) => ({
      sha: c.hash,
      shortSha: c.hash.slice(0, 7),
      message: (c.message || '').split('\n')[0] || '',
      author: c.author?.user?.display_name || c.author?.raw || null,
      date: c.date ?? null,
      htmlUrl: c.links?.html?.href ?? '',
    }));
  }

  async getCommitSha(repo: string, ref: string): Promise<string | null> {
    try {
      const commit = await this.get<{ hash: string }>(
        `/repositories/${this.workspace}/${repo}/commit/${encodeURIComponent(ref)}`,
      );
      return commit.hash;
    } catch {
      return null;
    }
  }

  async postPullRequestComment(
    repo: string,
    pullRequestId: number,
    contentMarkdown: string,
  ): Promise<{ id: string }> {
    const res = await this.post<{ id: number | string }>(
      `/repositories/${this.workspace}/${repo}/pullrequests/${pullRequestId}/comments`,
      { content: { raw: contentMarkdown } },
    );
    return { id: String(res.id) };
  }

  private async paginate<T>(path: string, maxPages = 5): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = path.startsWith('http') ? path : `${API}${path}`;
    let pages = 0;
    while (next && pages < maxPages) {
      const page: { values?: T[]; next?: string } = await this.request(next);
      out.push(...(page.values ?? []));
      next = page.next ?? null;
      pages += 1;
    }
    return out;
  }

  private get<T>(path: string) {
    return this.request<T>(`${API}${path}`);
  }

  private post<T>(path: string, body: unknown) {
    return this.request<T>(`${API}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    await this.applyAuth(headers);
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BitbucketApiError(
        `Bitbucket API ${res.status}: ${text.slice(0, 300) || res.statusText}`,
        res.status,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private async applyAuth(headers: Headers) {
    if (this.authMode === 'app_password') {
      const c = this.credentials as AppPasswordCredentials;
      const basic = Buffer.from(`${c.username}:${c.appPassword}`).toString('base64');
      headers.set('authorization', `Basic ${basic}`);
      return;
    }
    const token = await this.getClientCredentialsToken();
    headers.set('authorization', `Bearer ${token}`);
  }

  private async getClientCredentialsToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 30_000) {
      return this.accessToken;
    }
    const c = this.credentials as OAuthConsumerCredentials;
    const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new BitbucketApiError(
        `Bitbucket token exchange failed (${res.status}): ${text.slice(0, 200)}`,
        res.status,
      );
    }
    const body = (await res.json()) as { access_token: string; expires_in?: number };
    this.accessToken = body.access_token;
    this.tokenExpiresAt = Date.now() + (body.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }
}

/** Formats a terraplan plan result as a Bitbucket PR comment (markdown). */
export function formatPlanPrComment(input: {
  runId: string;
  repository: string;
  branch: string;
  environment: string;
  status: 'succeeded' | 'failed';
  planSummary: string | null;
  output: string | null;
  error: string | null;
  commitSha: string | null;
  webUrl?: string | null;
}): string {
  const short = input.runId.slice(-6);
  const statusLine =
    input.status === 'succeeded'
      ? '✅ **Plan succeeded**'
      : `❌ **Plan failed**${input.error ? `: ${input.error}` : ''}`;
  const summary = input.planSummary || (input.status === 'succeeded' ? 'No summary.' : 'See log.');
  const log = (input.output || '').trim();
  const clipped = log.length > 3500 ? `${log.slice(0, 3500)}\n…(truncated)` : log;
  const link = input.webUrl ? `\n\n[Open run in terraplan](${input.webUrl})` : '';
  return [
    `### terraplan. · \`run-${short}\``,
    statusLine,
    '',
    `| | |`,
    `|---|---|`,
    `| Repository | \`${input.repository}\` |`,
    `| Branch | \`${input.branch}\` |`,
    `| Environment | \`${input.environment}\` |`,
    `| Commit | \`${input.commitSha?.slice(0, 7) || '—'}\` |`,
    '',
    `**${summary}**`,
    clipped ? `\n\`\`\`diff\n${clipped}\n\`\`\`` : '',
    link,
  ]
    .filter((l) => l !== undefined)
    .join('\n');
}
