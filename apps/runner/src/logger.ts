import { env } from './env';

const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];

const threshold = LEVELS.indexOf(env.LOG_LEVEL);

function log(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (LEVELS.indexOf(level) < threshold) return;
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    service: 'runner',
    msg,
    ...meta,
  });
  (level === 'error' || level === 'warn' ? console.error : console.log)(line);
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
