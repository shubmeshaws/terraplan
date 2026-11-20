import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rename, rm } from 'node:fs/promises';
import { arch as osArch, platform as osPlatform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

function platformArch(): { os: string; arch: string } {
  const p = osPlatform();
  const a = osArch();
  const os = p === 'darwin' ? 'darwin' : p === 'win32' ? 'windows' : 'linux';
  const arch = a === 'arm64' ? 'arm64' : a === 'x64' ? 'amd64' : a;
  return { os, arch };
}

function execFile(cmd: string, args: string[]): Promise<void> {
  return new Promise((done, fail) => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done() : fail(new Error(`${cmd} exited with code ${code}`)),
    );
  });
}

/**
 * Returns an absolute path to a terraform binary pinned to `version`.
 * Downloads from HashiCorp releases into `versionsDir` on first use.
 */
export async function resolveTerraformBinary(
  version: string,
  versionsDir: string,
  emit: (chunk: string) => void,
): Promise<string> {
  const { os, arch } = platformArch();
  const destDir = join(versionsDir, version);
  const destBin = join(destDir, os === 'windows' ? 'terraform.exe' : 'terraform');

  if (existsSync(destBin)) {
    emit(`# using pinned terraform ${version} (${destBin})\n`);
    return destBin;
  }

  const zipName = `terraform_${version}_${os}_${arch}.zip`;
  const url = `https://releases.hashicorp.com/terraform/${version}/${zipName}`;
  emit(`# downloading terraform ${version} from HashiCorp releases…\n`);

  await mkdir(destDir, { recursive: true });
  const scratch = await mkdtemp(join(tmpdir(), 'tf-dl-'));
  const zipPath = join(scratch, zipName);

  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      throw new Error(`Failed to download terraform ${version}: HTTP ${res.status}`);
    }
    await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(zipPath));
    await execFile('unzip', ['-o', '-q', zipPath, '-d', scratch]);
    const extracted = join(scratch, os === 'windows' ? 'terraform.exe' : 'terraform');
    if (!existsSync(extracted)) {
      throw new Error(`terraform binary missing from ${zipName}`);
    }
    await rename(extracted, destBin);
    await chmod(destBin, 0o755);
    emit(`# terraform ${version} ready at ${destBin}\n`);
    return destBin;
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}
