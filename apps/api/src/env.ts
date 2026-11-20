import { apiEnvSchema, loadWorkspaceEnv, parseEnv } from '@terraplan/shared/env';

loadWorkspaceEnv();

export const env = parseEnv(apiEnvSchema, 'api');
