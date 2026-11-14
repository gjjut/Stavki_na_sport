// Lightweight DOM harness for client-component regression tests.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const { JSDOM } = require('jsdom');

const frontendRoot = path.resolve(__dirname, '..');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolve(request, parent, ...rest) {
  const resolvedRequest = request.startsWith('@/')
    ? path.join(frontendRoot, 'src', request.slice(2))
    : request;
  return originalResolve.call(this, resolvedRequest, parent, ...rest);
};

for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (mod, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    mod._compile(outputText, filename);
  };
}

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/admin',
});
global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = React;

async function mount(Component, props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Component, props)));
  return {
    container,
    rerender: async (nextProps) => act(async () => root.render(React.createElement(Component, nextProps))),
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function click(element) {
  if (!element) throw new Error('Button not found');
  await act(async () => element.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function buttonWithText(container, text) {
  return [...container.querySelectorAll('button')].find((button) => button.textContent.trim() === text);
}

module.exports = { React, act, mount, click, buttonWithText, dom };
