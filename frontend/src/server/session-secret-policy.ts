import { randomBytes } from 'node:crypto';

const MIN_SESSION_SECRET_LENGTH = 32;
const KNOWN_WEAK_SESSION_SECRETS = new Set([
  'valuex-prod-default-hmac-secret-change-in-env-2026',
  'change_this_to_a_long_random_64_char_secret_string',
]);
let ephemeralDevelopmentSecret: string | null = null;

function getConfiguredSessionSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return [env.JWT_ACCESS_SECRET, env.SESSION_SECRET]
    .map((value) => (value || '').trim())
    .find(
      (secret) =>
        secret.length >= MIN_SESSION_SECRET_LENGTH &&
        !KNOWN_WEAK_SESSION_SECRETS.has(secret),
    ) ?? null;
}

export function isSessionSigningAvailable(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(getConfiguredSessionSecret(env)) || env.NODE_ENV !== 'production';
}

export function getSessionSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = getConfiguredSessionSecret(env);
  if (configured) return configured;
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Session signing is disabled: configure SESSION_SECRET or JWT_ACCESS_SECRET with at least 32 characters.',
    );
  }
  ephemeralDevelopmentSecret ??= randomBytes(32).toString('base64url');
  return ephemeralDevelopmentSecret;
}
