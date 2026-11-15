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
