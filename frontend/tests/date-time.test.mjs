import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from './load-typescript-module.mjs';

const {
  dateTimeLocalInputToIso,
  formatDateTimeInTimeZone,
  isOnBrowserLocalDay,
  toDateTimeLocalInputValue,
} = await loadTypeScriptModule(
  new URL('../src/lib/date-time.ts', import.meta.url),
);

test('browser-local dates handle calendar rollover and DST transitions', () => {
  const originalTimeZone = process.env.TZ;
  try {
    process.env.TZ = 'America/Los_Angeles';

    const lateOnNewYearsEve = new Date('2026-01-01T07:30:00.000Z');
    assert.equal(toDateTimeLocalInputValue(lateOnNewYearsEve), '2025-12-31T23:30');
    assert.equal(
      isOnBrowserLocalDay(
        '2026-01-01T07:30:00.000Z',
        new Date('2026-01-01T07:45:00.000Z'),
      ),
      true,
    );
    assert.equal(
      isOnBrowserLocalDay(
        '2026-01-01T07:30:00.000Z',
        new Date('2026-01-01T08:30:00.000Z'),
      ),
      false,
    );

    // Los Angeles jumps from 01:59 to 03:00 on this date.
    assert.equal(
      toDateTimeLocalInputValue(new Date('2026-03-08T09:30:00.000Z')),
      '2026-03-08T01:30',
    );
    assert.equal(
      toDateTimeLocalInputValue(new Date('2026-03-08T10:30:00.000Z')),
      '2026-03-08T03:30',
    );
    assert.equal(
      isOnBrowserLocalDay(
        '2026-03-08T10:30:00.000Z',
        new Date('2026-03-08T09:30:00.000Z'),
      ),
      true,
    );

    assert.equal(
      dateTimeLocalInputToIso('2025-12-31T23:30'),
      '2026-01-01T07:30:00.000Z',
    );
    assert.equal(
      dateTimeLocalInputToIso('2026-03-08T02:30'),
      null,
      'a nonexistent wall-clock time must not silently become 03:30',
    );
    assert.equal(
      dateTimeLocalInputToIso('2026-03-08T03:30'),
      '2026-03-08T10:30:00.000Z',
    );

    // The repeated fall-back hour is a valid local time; the browser resolves it
    // to one of the two corresponding instants.
    assert.equal(
      dateTimeLocalInputToIso('2026-11-01T01:30'),
      '2026-11-01T08:30:00.000Z',
    );
  } finally {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  }
});

test('formatted event time uses the requested timezone and distinguishes DST offsets', () => {
  const utcText = formatDateTimeInTimeZone(
    '2026-01-01T00:30:00.000Z',
    'UTC',
    'full',
    'en-US',
    false,
  );
  const losAngelesText = formatDateTimeInTimeZone(
    '2026-01-01T00:30:00.000Z',
    'America/Los_Angeles',
    'full',
    'en-US',
    false,
  );
  assert.match(utcText, /2026/);
  assert.match(losAngelesText, /2025/);
  assert.notEqual(utcText, losAngelesText);

  const firstFallBackOccurrence = formatDateTimeInTimeZone(
    '2026-11-01T08:30:00.000Z',
    'America/Los_Angeles',
    'full',
    'en-US',
  );
  const secondFallBackOccurrence = formatDateTimeInTimeZone(
    '2026-11-01T09:30:00.000Z',
    'America/Los_Angeles',
    'full',
    'en-US',
  );
  assert.notEqual(firstFallBackOccurrence, secondFallBackOccurrence);
});
