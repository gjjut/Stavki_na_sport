import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const { getSessionSecret, isSessionSigningAvailable } = await loadTypeScriptModule(
  new URL('../src/server/session-secret-policy.ts', import.meta.url),
);

test('production session signing fails closed without a strong configured secret', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSessionSecret = process.env.SESSION_SECRET;
  const previousJwtSecret = process.env.JWT_ACCESS_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.SESSION_SECRET;
    delete process.env.JWT_ACCESS_SECRET;
    assert.equal(isSessionSigningAvailable(), false);
    assert.throws(() => getSessionSecret(), /Session signing is disabled/);

    process.env.SESSION_SECRET = 'change_this_to_a_long_random_64_char_secret_string';
    assert.equal(isSessionSigningAvailable(), false);
    assert.throws(() => getSessionSecret(), /Session signing is disabled/);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
    if (previousJwtSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousJwtSecret;
  }
});

test('a sufficiently long configured production secret is used verbatim after trimming', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSessionSecret = process.env.SESSION_SECRET;
  const previousJwtSecret = process.env.JWT_ACCESS_SECRET;
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'weak';
    process.env.SESSION_SECRET = '  secret-' + 'x'.repeat(48) + '  ';
    assert.equal(isSessionSigningAvailable(), true);
    assert.equal(getSessionSecret(), `secret-${'x'.repeat(48)}`);

    process.env.JWT_ACCESS_SECRET = 'jwt-' + 'y'.repeat(48);
    assert.equal(getSessionSecret(), `jwt-${'y'.repeat(48)}`);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
    if (previousJwtSecret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = previousJwtSecret;
  }
});
