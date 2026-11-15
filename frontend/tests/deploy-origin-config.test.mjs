import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const file of ['install-regru.sh', 'setup-domain-ssl.sh']) {
  test(`${file}: generated nginx forwards the original Host including its port`, () => {
    const text = readFileSync(new URL(`../../deploy/${file}`, import.meta.url), 'utf8');
    assert.match(text, /proxy_set_header Host \\?\$http_host;/);
    assert.match(text, /proxy_set_header X-Real-IP \\?\$remote_addr;/);
    assert.match(text, /proxy_set_header X-Forwarded-Proto \\?\$scheme;/);
  });
}

test('fresh PM2 install initializes PostgreSQL schema as the application role and does not hide SQL errors', () => {
  const text = readFileSync(new URL('../../deploy/install-regru.sh', import.meta.url), 'utf8');
  assert.match(text, /psql -v ON_ERROR_STOP=1 -d tipster_db\s+\\\s*\n\s*-c "SET ROLE tipster_user;" -f "\$\{PROJECT_DIR\}\/database\/schema\.sql"/);
  assert.doesNotMatch(text, /-f "\$\{PROJECT_DIR\}\/database\/schema\.sql"[^\n]*\|\| true/);
});

test('fresh installer points to the current domain and HTTPS guide instead of obsolete syntax', () => {
  const text = readFileSync(new URL('../../deploy/install-regru.sh', import.meta.url), 'utf8');
  assert.match(text, /deploy\/PREDICTLAB-DOMAIN-SSL\.md/);
  assert.doesNotMatch(text, /bash deploy\/setup-domain-ssl\.sh ваш-домен\.ru ваш@email\.ru/);
});
