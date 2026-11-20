import { loadWorkspaceEnv, parseEnv, webEnvSchema } from '@terraplan/shared/env';

loadWorkspaceEnv();
// Fail the dev server / build early if the web env is misconfigured.
parseEnv(webEnvSchema, 'web');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The ported terraplan.js wires DOM listeners once; StrictMode's double
  // effects in dev would boot it twice.
  reactStrictMode: false,
  output: 'standalone',
  poweredByHeader: false,
};

export default nextConfig;
