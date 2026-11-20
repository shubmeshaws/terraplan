import 'server-only';
import { loadWorkspaceEnv, parseEnv, webEnvSchema } from '@terraplan/shared/env';

loadWorkspaceEnv();

export const env = parseEnv(webEnvSchema, 'web');
