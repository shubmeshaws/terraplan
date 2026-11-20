import { loadWorkspaceEnv, parseEnv, runnerEnvSchema } from '@terraplan/shared/env';

loadWorkspaceEnv();

export const env = parseEnv(runnerEnvSchema, 'runner');
