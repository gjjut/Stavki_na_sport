import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { act, mount, click, buttonWithText, dom } = require('./ui-test-utils.cjs');
const { AdminAiChatPanel } = require('../src/components/admin/AdminAiChatPanel.tsx');
const { AdminAiChatMessages } = require('../src/components/admin/AdminAiChatMessages.tsx');

const response = (json, status = 200) => ({ ok: status < 400, status, json: async () => json });
const userMessage = { id: 'user-1', role: 'user', content: 'Проверь статистику', createdAt: '2026-11-12T10:00:00Z' };
const assistantMessage = { id: 'assistant-1', role: 'assistant', content: 'Статистика готова', createdAt: '2026-11-12T10:01:00Z' };
const baseProps = {
  initialMessages: [], llmProvider: 'PLUSVIBE', llmBaseUrl: 'https://plusvibeapi.ru/v1',
  llmApiKey: '', llmModel: 'model-a', hasApiKey: true, onRefresh: async () => {},
};

async function fillTextarea(element, value) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

test('example commands are inserted for review, not executed on click', async (t) => {
  let calls = 0;
  global.fetch = async () => { calls++; return response({}); };
  const view = await mount(AdminAiChatPanel, baseProps);
  t.after(view.cleanup);
  const example = buttonWithText(view.container, 'Создай промокод VIP20 на скидку 20% на 150 активаций');
  await click(example);
  assert.equal(calls, 0);
  assert.match(view.container.querySelector('textarea').value, /VIP20/);
  assert.equal(view.container.ownerDocument.activeElement, view.container.querySelector('textarea'));
});

test('sending shows a pending state, survives a refresh, and uses the server reply', async (t) => {
  let resolveFetch;
  const pending = new Promise((resolve) => { resolveFetch = resolve; });
  const calls = [];
  global.fetch = async (url, options) => { calls.push({ url, options }); return pending; };
  const view = await mount(AdminAiChatPanel, baseProps);
  t.after(view.cleanup);
  const textarea = view.container.querySelector('textarea');
  await fillTextarea(textarea, userMessage.content);
  await click(buttonWithText(view.container, 'Отправить'));
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].options.body), { message: userMessage.content });
  assert.equal(textarea.disabled, true);
  assert.match(view.container.querySelector('[role="status"]').textContent, /Обрабатываю запрос/);
  assert.match(view.container.querySelector('[role="log"]').textContent, /Проверь статистику/);
  await view.rerender({ ...baseProps, initialMessages: [] });
  assert.match(view.container.querySelector('[role="log"]').textContent, /Проверь статистику/);
  await act(async () => resolveFetch(response({ messages: [userMessage, assistantMessage], assistantMessage })));
  assert.match(view.container.querySelector('[role="log"]').textContent, /Статистика готова/);
  assert.equal(textarea.disabled, false);
  assert.equal(view.container.querySelector('[role="status"]'), null);
});

test('a failed or malformed reply keeps the text and warns before retrying', async (t) => {
  global.fetch = async () => response({});
  const view = await mount(AdminAiChatPanel, baseProps);
  t.after(view.cleanup);
  const textarea = view.container.querySelector('textarea');
  await fillTextarea(textarea, 'Выполни поручение');
  await click(buttonWithText(view.container, 'Отправить'));
  assert.equal(textarea.value, 'Выполни поручение');
  assert.match(view.container.querySelector('[role="alert"]').textContent, /Итог поручения не подтверждён/);
  assert.doesNotMatch(view.container.querySelector('[role="log"]').textContent, /Вы \(Владелец\)/);
});

test('history is retained on DELETE failure and cleared only after success and confirmation', async (t) => {
  let calls = 0;
  let refreshes = 0;
  global.fetch = async (_url, options) => {
    assert.equal(options.method, 'DELETE');
    calls++;
    return calls === 1 ? response({ error: 'Ошибка удаления' }, 403) : response({ ok: true, messages: [] });
  };
  const view = await mount(AdminAiChatPanel, { ...baseProps, initialMessages: [userMessage], onRefresh: async () => { refreshes++; } });
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Очистить'));
  assert.equal(calls, 0);
  await click(buttonWithText(view.container.querySelector('[role="dialog"]'), 'Очистить историю'));
  assert.match(view.container.querySelector('[role="alert"]').textContent, /Ошибка удаления/);
  assert.match(view.container.querySelector('[role="log"]').textContent, /Проверь статистику/);
  await click(buttonWithText(view.container, 'Очистить'));
  await click(buttonWithText(view.container.querySelector('[role="dialog"]'), 'Очистить историю'));
  assert.equal(refreshes, 1);
  assert.doesNotMatch(view.container.querySelector('[role="log"]').textContent, /Проверь статистику/);
});

test('new messages do not pull the reader away from older history', async (t) => {
  const props = { messages: [userMessage], sending: false, error: null, setupOpen: false, onOpenSetup: () => {} };
  const view = await mount(AdminAiChatMessages, props);
  t.after(view.cleanup);
  const area = view.container.querySelector('[role="log"]');
  Object.defineProperty(area, 'scrollHeight', { configurable: true, value: 1000 });
  Object.defineProperty(area, 'clientHeight', { configurable: true, value: 200 });
  area.scrollTop = 150;
  await act(async () => area.dispatchEvent(new dom.window.Event('scroll', { bubbles: true })));
  assert.ok(buttonWithText(view.container, 'К последним сообщениям'));
  await view.rerender({ ...props, messages: [userMessage, assistantMessage] });
  assert.equal(area.scrollTop, 150);
  await click(buttonWithText(view.container, 'К последним сообщениям'));
  assert.equal(area.scrollTop, 1000);
  assert.equal(buttonWithText(view.container, 'К последним сообщениям'), undefined);
});

test('switching providers discards the previous provider model list and balance', async (t) => {
  global.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).action, 'TEST_LLM');
    return response({ ok: true, keySaved: true, availableModels: ['model-a', 'model-b'], balanceRub: 35, message: 'Связь есть' });
  };
  const view = await mount(AdminAiChatPanel, baseProps);
  t.after(view.cleanup);
  await click(buttonWithText(view.container, 'Подключить / Проверить ключ API'));
  await click(buttonWithText(view.container, 'Проверить связь и СОХРАНИТЬ'));
  assert.ok(view.container.querySelector('select#admin-chat-model'));
  assert.match(view.container.textContent, /Баланс: 35\.00/);
  await click(buttonWithText(view.container, 'Ollama Cloud (deepseek-v4.1-flash)'));
  assert.equal(view.container.querySelector('select#admin-chat-model'), null);
  assert.equal(view.container.querySelector('input#admin-chat-model').value, 'deepseek-v4.1-flash');
  assert.doesNotMatch(view.container.textContent, /Баланс: 35\.00/);
});
