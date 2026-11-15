import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, symlinkSync, existsSync, lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const originalScript = readFileSync(new URL('../../deploy/setup-domain-ssl.sh', import.meta.url), 'utf8');

function sandbox() {
  const root = mkdtempSync(path.join(tmpdir(), 'predictlab-ssl-test-'));
  const nginx = path.join(root, 'nginx');
  const acme = path.join(root, 'acme');
  const lets = path.join(root, 'letsencrypt');
  const lock = path.join(root, 'lock');
  const bin = path.join(root, 'bin');
  for (const dir of [path.join(nginx, 'sites-available'), path.join(nginx, 'sites-enabled'), acme, lets, lock, bin]) mkdirSync(dir, { recursive: true });
  const oldSite = path.join(nginx, 'sites-available/valuex');
  writeFileSync(oldSite, 'server { server_name old.example; }\n');
  const dump = path.join(root, 'nginx-dump');
  writeFileSync(dump, 'server { server_name old.example; }\n');
  const calls = path.join(root, 'calls');
  writeFileSync(calls, '');
  let script = originalScript;
  for (const [from, to] of [
    ["NGINX_ROOT='/etc/nginx'", `NGINX_ROOT='${nginx}'`],
    ["ACME_ROOT='/var/www/predictlab-acme'", `ACME_ROOT='${acme}'`],
    ["LETSENCRYPT_ROOT='/etc/letsencrypt'", `LETSENCRYPT_ROOT='${lets}'`],
    ["LOCK_DIR='/run/lock'", `LOCK_DIR='${lock}'`],
    ["(( EUID == 0 )) || die 'Запустите от root через sudo.'", ': # root check replaced only in isolated test copy'],
  ]) {
    assert.ok(script.includes(from), `test replacement exists: ${from}`);
    script = script.replace(from, to);
  }
  const scriptPath = path.join(root, 'setup.sh');
  writeFileSync(scriptPath, script);
  const mock = (name, source) => writeFileSync(path.join(bin, name), `#!/usr/bin/env bash\nset -eu\n${source}\n`, { mode: 0o755 });
  mock('sleep', 'exit 0'); // Retry loops are instantaneous in the isolated mocks.
  mock('nginx', `
if [[ "\${1:-}" == -T ]]; then cat "$TEST_DUMP"; exit 0; fi
if [[ "\${TEST_TLS_NGINX_FAIL:-0}" == 1 ]] && [[ -f "$TEST_AVAILABLE" ]] && grep -q 'listen 443 ssl' "$TEST_AVAILABLE"; then echo 'bad TLS config' >&2; exit 1; fi
if [[ "\${TEST_CONFLICT:-0}" == 1 ]]; then echo 'conflicting server name' >&2; exit 0; fi
echo 'syntax is ok' >&2
`);
  mock('systemctl', `
echo "systemctl $*" >> "$TEST_CALLS"
if [[ "\${1:-}" == reload && "\${TEST_TLS_RELOAD_FAIL:-0}" == 1 ]] && [[ -f "$TEST_AVAILABLE" ]] && grep -q 'listen 443 ssl' "$TEST_AVAILABLE"; then exit 1; fi
exit 0
`);
  mock('dig', `
type="\${@: -2:1}"; host="\${@: -1}"
if [[ "$type" == A ]]; then
  if [[ "$host" == www.* && "\${TEST_CNAME:-0}" == 1 ]]; then echo 'predictlab.ru.'; fi
  if [[ "$host" == www.* && "\${TEST_WWW_MISMATCH:-0}" == 1 ]]; then echo 192.0.2.9; else echo "\${TEST_A:-203.0.113.10}"; fi
elif [[ "$type" == AAAA && "\${TEST_AAAA:-0}" == 1 ]]; then
  echo '2001:db8::1'
fi
`);
  mock('curl', `
url="\${@: -1}"
if [[ "$url" == *'/.well-known/acme-challenge/'* ]]; then
  if [[ "\${TEST_PROBE_FAIL:-0}" == 1 ]]; then echo wrong; exit 0; fi
  cat "$TEST_ACME/.well-known/acme-challenge/\${url##*/}"
elif [[ "$url" == 'http://127.0.0.1:3000/api/health' ]]; then
  [[ "\${TEST_APP_FAIL:-0}" != 1 ]] || exit 22
  echo '{"status":"ok"}'
elif [[ "$url" == 'https://predictlab.ru/api/health' ]]; then
  [[ "\${TEST_HTTPS_FAIL:-0}" != 1 ]] || exit 22
  echo '{"status":"ok"}'
elif [[ "$url" == *'/predictlab-check?x=1' ]]; then
  printf '%s' '308 https://predictlab.ru/predictlab-check?x=1'
else
  echo "unexpected test curl: $url" >&2; exit 1
fi
`);
  mock('certbot', `
echo "certbot $*" >> "$TEST_CALLS"
[[ "\${TEST_CERTBOT_FAIL:-0}" != 1 ]] || exit 1
mkdir -p "$TEST_LE/live/predictlab.ru" "$TEST_LE/renewal"
printf 'test chain' > "$TEST_LE/live/predictlab.ru/fullchain.pem"
printf 'test key' > "$TEST_LE/live/predictlab.ru/privkey.pem"
printf 'test renewal' > "$TEST_LE/renewal/predictlab.ru.conf"
`);
  const available = path.join(nginx, 'sites-available/predictlab.ru.conf');
  const enabled = path.join(nginx, 'sites-enabled/predictlab.ru.conf');
  const env = {
    ...process.env, PATH: `${bin}:${process.env.PATH}`, TEST_AVAILABLE: available,
    TEST_DUMP: dump, TEST_CALLS: calls, TEST_ACME: acme, TEST_LE: lets,
  };
  function run(args, extra = {}) {
    return spawnSync('bash', [scriptPath, ...args], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 10000 });
  }
  return { root, nginx, lets, acme, available, enabled, oldSite, dump, calls, run, clean: () => rmSync(root, { recursive: true, force: true }) };
}

const prepare = ['prepare', 'predictlab.ru'];
const issue = ['issue', 'predictlab.ru', 'owner@example.test', '203.0.113.10'];
const resultText = (result) => `${result.stdout}\n${result.stderr}`;

test('apex-only preparation is a 503/ACME vhost and leaves existing sites alone', () => {
  const s = sandbox();
  try {
    const result = s.run(prepare);
    assert.equal(result.status, 0, resultText(result));
    const conf = readFileSync(s.available, 'utf8');
    assert.match(conf, /server_name predictlab\.ru;/);
    assert.match(conf, /location \/ \{ return 503; \}/);
    assert.doesNotMatch(conf, /proxy_pass|listen 443|www\.predictlab\.ru/);
    assert.ok(lstatSync(s.enabled).isSymbolicLink());
    assert.equal(readFileSync(s.oldSite, 'utf8'), 'server { server_name old.example; }\n');
    assert.doesNotMatch(readFileSync(s.calls, 'utf8'), /certbot /);
  } finally { s.clean(); }
});

test('HTTPS issuance redirects HTTP, preserves proxy security and installs a scoped renewal hook', () => {
  const s = sandbox();
  try {
    assert.equal(s.run(prepare).status, 0);
    const result = s.run(issue);
    assert.equal(result.status, 0, resultText(result));
    const conf = readFileSync(s.available, 'utf8');
    assert.match(conf, /server_name predictlab\.ru;/);
    assert.doesNotMatch(conf, /www\.predictlab\.ru/);
    assert.match(conf, /return 308 https:\/\/predictlab\.ru\$request_uri;/);
    assert.match(conf, /location \^~ \/\.well-known\/acme-challenge\//);
    assert.match(conf, /proxy_set_header Host \$http_host;/);
    assert.match(conf, /proxy_set_header X-Real-IP \$remote_addr;/);
    assert.match(conf, /proxy_set_header X-Forwarded-Proto \$scheme;/);
    const calls = readFileSync(s.calls, 'utf8');
    assert.match(calls, /certbot certonly --webroot .*--cert-name predictlab\.ru -d predictlab\.ru /);
    assert.doesNotMatch(calls, /-d www\./);
    const hook = path.join(s.lets, 'renewal-hooks/deploy/predictlab.ru-reload-nginx');
    assert.match(readFileSync(hook, 'utf8'), /RENEWED_LINEAGE/);
    assert.match(readFileSync(hook, 'utf8'), /nginx -t && systemctl reload nginx/);
    assert.ok((lstatSync(hook).mode & 0o111) !== 0);
    assert.equal(readFileSync(s.oldSite, 'utf8'), 'server { server_name old.example; }\n');
  } finally { s.clean(); }
});

test('pre-existing ACME and renewal-hook directory permissions are not changed', () => {
  const s = sandbox();
  try {
    const challenge = path.join(s.acme, '.well-known/acme-challenge');
    const hooks = path.join(s.lets, 'renewal-hooks/deploy');
    mkdirSync(challenge, { recursive: true });
    mkdirSync(hooks, { recursive: true });
    chmodSync(challenge, 0o700);
    chmodSync(hooks, 0o700);
    assert.equal(s.run(prepare).status, 0);
    assert.equal(s.run(issue).status, 0);
    assert.equal(lstatSync(challenge).mode & 0o777, 0o700);
    assert.equal(lstatSync(hooks).mode & 0o777, 0o700);
  } finally { s.clean(); }
});

test('www is opt-in, checks CNAME resolution, receives a certificate and redirects to the apex', () => {
  const s = sandbox();
  try {
    const p = s.run([...prepare, '--www']);
    assert.equal(p.status, 0, resultText(p));
    const result = s.run([...issue, '--www'], { TEST_CNAME: '1' });
    assert.equal(result.status, 0, resultText(result));
    const conf = readFileSync(s.available, 'utf8');
    assert.match(conf, /server_name predictlab\.ru www\.predictlab\.ru;/);
    assert.match(conf, /server_name www\.predictlab\.ru;[\s\S]*return 308 https:\/\/predictlab\.ru\$request_uri;/);
    assert.match(readFileSync(s.calls, 'utf8'), /-d predictlab\.ru -d www\.predictlab\.ru/);
  } finally { s.clean(); }
});

test('DNS mismatch, AAAA, or a different www decision abort before issuance', () => {
  for (const extra of [{ TEST_A: '192.0.2.3' }, { TEST_AAAA: '1' }]) {
    const s = sandbox();
    try {
      assert.equal(s.run(prepare).status, 0);
      const result = s.run(issue, extra);
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(readFileSync(s.calls, 'utf8'), /certbot /);
      assert.match(readFileSync(s.available, 'utf8'), /return 503/);
    } finally { s.clean(); }
  }
  const s = sandbox();
  try {
    assert.equal(s.run([...prepare, '--www']).status, 0);
    const result = s.run([...issue, '--www'], { TEST_WWW_MISMATCH: '1' });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(readFileSync(s.calls, 'utf8'), /certbot /);
    assert.notEqual(s.run(issue).status, 0, 'www choice must match preparation');
  } finally { s.clean(); }
});

test('existing Nginx domain, site file, dangling symlink, or certificate are never overwritten', () => {
  for (const kind of ['mention', 'file', 'link', 'certificate']) {
    const s = sandbox();
    try {
      if (kind === 'mention') writeFileSync(s.dump, 'server { server_name predictlab.ru; }\n');
      if (kind === 'file') writeFileSync(s.available, 'owner configuration');
      if (kind === 'link') symlinkSync('/missing/unrelated', s.enabled);
      if (kind === 'certificate') {
        mkdirSync(path.join(s.lets, 'renewal'), { recursive: true });
        writeFileSync(path.join(s.lets, 'renewal/predictlab.ru.conf'), 'owner certificate');
      }
      const result = s.run(prepare);
      assert.notEqual(result.status, 0, `${kind}: ${resultText(result)}`);
      if (kind === 'file') assert.equal(readFileSync(s.available, 'utf8'), 'owner configuration');
      if (kind === 'link') assert.ok(lstatSync(s.enabled).isSymbolicLink());
      assert.equal(readFileSync(s.oldSite, 'utf8'), 'server { server_name old.example; }\n');
      assert.doesNotMatch(readFileSync(s.calls, 'utf8'), /certbot /);
    } finally { s.clean(); }
  }
});

test('failed local HTTP probe rolls back only the new preparation', () => {
  const s = sandbox();
  try {
    const result = s.run(prepare, { TEST_PROBE_FAIL: '1' });
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(s.available), false);
    assert.equal(existsSync(s.enabled), false);
    assert.match(resultText(result), /отменено/);
    assert.equal(readFileSync(s.oldSite, 'utf8'), 'server { server_name old.example; }\n');
  } finally { s.clean(); }
});

test('failed Certbot keeps the safe prepared vhost for diagnosis and retry', () => {
  const s = sandbox();
  try {
    assert.equal(s.run(prepare).status, 0);
    const result = s.run(issue, { TEST_CERTBOT_FAIL: '1' });
    assert.notEqual(result.status, 0);
    assert.match(readFileSync(s.available, 'utf8'), /return 503/);
    assert.equal(existsSync(path.join(s.lets, 'renewal-hooks/deploy/predictlab.ru-reload-nginx')), false);
  } finally { s.clean(); }
});

test('failed HTTPS nginx test or reload restores the prepared vhost without erasing the certificate', () => {
  for (const extra of [{ TEST_TLS_NGINX_FAIL: '1' }, { TEST_TLS_RELOAD_FAIL: '1' }]) {
    const s = sandbox();
    try {
      assert.equal(s.run(prepare).status, 0);
      const result = s.run(issue, extra);
      assert.notEqual(result.status, 0, resultText(result));
      assert.match(readFileSync(s.available, 'utf8'), /return 503/);
      assert.equal(existsSync(path.join(s.lets, 'live/predictlab.ru/fullchain.pem')), true);
      assert.equal(existsSync(path.join(s.lets, 'renewal-hooks/deploy/predictlab.ru-reload-nginx')), false);
      assert.notEqual(s.run(issue).status, 0, 'a certificate from a failed run is not overwritten');
      assert.equal(readFileSync(s.oldSite, 'utf8'), 'server { server_name old.example; }\n');
    } finally { s.clean(); }
  }
});

test('a failing post-reload health check keeps the already issued HTTPS site and reports failure', () => {
  const s = sandbox();
  try {
    assert.equal(s.run(prepare).status, 0);
    const result = s.run(issue, { TEST_HTTPS_FAIL: '1' });
    assert.notEqual(result.status, 0);
    assert.match(readFileSync(s.available, 'utf8'), /listen 443 ssl/);
    assert.match(resultText(result), /повторно не выпускайте сертификат/);
    assert.notEqual(s.run(issue).status, 0);
  } finally { s.clean(); }
});

test('bad arguments, old invocation, and conflicting nginx are rejected', () => {
  const s = sandbox();
  try {
    for (const args of [
      ['predictlab.ru', 'owner@example.test'],
      ['prepare', 'predictlab.ru;touch-danger'],
      ['prepare', 'www.predictlab.ru'],
      ['issue', 'predictlab.ru', 'bad-email', '203.0.113.10'],
      ['issue', 'predictlab.ru', 'owner@example.test', '999.0.0.1'],
    ]) assert.notEqual(s.run(args).status, 0, args.join(' '));
    assert.notEqual(s.run(prepare, { TEST_CONFLICT: '1' }).status, 0);
    assert.equal(existsSync(s.available), false);
    assert.doesNotMatch(readFileSync(s.calls, 'utf8'), /certbot /);
  } finally { s.clean(); }
});
