import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  decryptSecret,
  encryptionKeyFromSecret,
  type AppPasswordCredentials,
  type BitbucketAuthMode,
  type BitbucketCredentials,
  type OAuthConsumerCredentials,
} from '@terraplan/shared';
import type { PrismaClient } from '@terraplan/shared/db';

export interface CloneResult {
  /** Absolute path to the isolated working copy. */
  workDir: string;
  commitSha: string;
  /** Secret values that appeared in clone URLs / tokens — for log redaction. */
  secrets: string[];
  cleanup: () => Promise<void>;
}

function exec(
  cmd: string,
  args: string[],
  cwd: string,
  emit: (chunk: string) => void,
  redactArgs = false,
): Promise<string> {
  return new Promise((done, fail) => {
    const shown = redactArgs
      ? args.map((a) => (a.includes('@') || a.includes('://') ? '[redacted]' : a))
      : args;
    emit(`$ ${[cmd, ...shown].join(' ')}\n`);
    let out = '';
    const child = spawn(cmd, args, { cwd, env: process.env });
    const onData = (d: Buffer) => {
      const s = d.toString();
      out += s;
      emit(s);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done(out) : fail(new Error(`${cmd} exited with code ${code}`)),
    );
  });
}

function openCredentials(
  ciphertext: string,
  authMode: BitbucketAuthMode,
  keyMaterial: string,
): BitbucketCredentials {
  const raw = JSON.parse(
    decryptSecret(ciphertext, encryptionKeyFromSecret(keyMaterial)),
  ) as BitbucketCredentials;
  if (authMode === 'oauth_consumer') {
    const c = raw as OAuthConsumerCredentials;
    if (!c.clientId || !c.clientSecret) throw new Error('Invalid oauth_consumer credentials');
    return c;
  }
  const c = raw as AppPasswordCredentials;
  if (!c.username || !c.appPassword) throw new Error('Invalid app_password credentials');
  return c;
}

async function fetchBitbucketToken(creds: OAuthConsumerCredentials): Promise<string> {
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
  const res = await fetch('https://bitbucket.org/site/oauth2/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Bitbucket token exchange failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

/**
 * Clones the Bitbucket repo into an isolated temp directory at the requested
 * branch (or commitSha when provided). Always call `cleanup()` in a finally.
 */
export async function cloneRepository(opts: {
  prisma: PrismaClient;
  repository: string;
  branch: string;
  commitSha?: string | null;
  workspacesDir: string;
  encryptionKeyMaterial: string;
  emit: (chunk: string) => void;
}): Promise<CloneResult> {
  const connection = await opts.prisma.bitbucketConnection.findUnique({ where: { id: 'default' } });
  if (!connection) {
    throw new Error(
      'Bitbucket is not connected. An admin must connect a workspace before terraform runs can clone.',
    );
  }

  const creds = openCredentials(
    connection.credentialsCiphertext,
    connection.authMode,
    opts.encryptionKeyMaterial,
  );
  const secrets: string[] = [];
  let cloneUrl: string;

  if (connection.authMode === 'app_password') {
    const c = creds as AppPasswordCredentials;
    secrets.push(c.appPassword);
    const user = encodeURIComponent(c.username);
    const pass = encodeURIComponent(c.appPassword);
    cloneUrl = `https://${user}:${pass}@bitbucket.org/${connection.workspace}/${opts.repository}.git`;
  } else {
    const c = creds as OAuthConsumerCredentials;
    const accessToken = await fetchBitbucketToken(c);
    secrets.push(accessToken, c.clientSecret);
    cloneUrl = `https://x-token-auth:${encodeURIComponent(accessToken)}@bitbucket.org/${connection.workspace}/${opts.repository}.git`;
  }

  await mkdir(opts.workspacesDir, { recursive: true });
  const workDir = await mkdtemp(join(opts.workspacesDir, 'run-'));
  const cleanup = async () => {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    opts.emit(`# cloning ${connection.workspace}/${opts.repository} (isolated)\n`);
    await exec(
      'git',
      [
        'clone',
        '--quiet',
        '--branch',
        opts.branch,
        '--single-branch',
        '--depth',
        '50',
        cloneUrl,
        workDir,
      ],
      tmpdir(),
      opts.emit,
      true,
    );

    let commitSha = (await exec('git', ['rev-parse', 'HEAD'], workDir, () => {})).trim();

    if (opts.commitSha && opts.commitSha !== commitSha) {
      try {
        await exec('git', ['fetch', '--quiet', 'origin', opts.commitSha], workDir, opts.emit);
      } catch {
        await exec('git', ['fetch', '--quiet', '--unshallow'], workDir, opts.emit);
        await exec('git', ['fetch', '--quiet', 'origin', opts.commitSha], workDir, opts.emit);
      }
      await exec('git', ['checkout', '--quiet', opts.commitSha], workDir, opts.emit);
      commitSha = opts.commitSha;
    }

    opts.emit(`# checked out ${commitSha.slice(0, 7)} on ${opts.branch}\n`);
    return { workDir, commitSha, secrets, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
