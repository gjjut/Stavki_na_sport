import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { React, act, mount, dom } = require('./ui-test-utils.cjs');
const { Modal } = require('../src/components/admin/ui.tsx');

function Fixture() {
  const [open, setOpen] = React.useState(false);
  return React.createElement(React.Fragment, null,
    React.createElement('button', { onClick: () => setOpen(true) }, 'Открыть'),
    React.createElement(Modal, { open, onClose: () => setOpen(false), title: 'Пример' },
      React.createElement('input', { 'aria-label': 'Поле ввода' }),
      React.createElement('button', null, 'Последнее действие'),
    ),
  );
}

async function press(target, key, extra = {}) {
  const event = new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  await act(async () => target.dispatchEvent(event));
  return event;
}

test('dialog confines focus and restores it when closed with Escape', async (t) => {
  const view = await mount(Fixture, {});
  t.after(view.cleanup);
  const opener = view.container.querySelector('button');
  opener.focus();
  await act(async () => opener.click());
  const dialog = view.container.querySelector('[role="dialog"]');
  const close = dialog.querySelector('button[aria-label="Закрыть"]');
  const last = [...dialog.querySelectorAll('button')].at(-1);
  assert.equal(document.activeElement, close);
  const back = await press(document, 'Tab', { shiftKey: true });
  assert.equal(back.defaultPrevented, true);
  assert.equal(document.activeElement, last);
  const forward = await press(document, 'Tab');
  assert.equal(forward.defaultPrevented, true);
  assert.equal(document.activeElement, close);
  await press(document, 'Escape');
  assert.equal(view.container.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, opener);
});
