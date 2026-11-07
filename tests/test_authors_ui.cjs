const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

function element() {
  return {
    children: [], attributes: {}, events: {}, hidden: false,
    innerHTML: '', textContent: '',
    append(...nodes) { this.children.push(...nodes); },
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(event, callback) { this.events[event] = callback; },
  };
}
const context = vm.createContext({
  document: { readyState: "loading", body: { dataset: {} }, createElement: element, addEventListener() {} },
  localStorage: { getItem() { return null; } },
  location: { pathname: '/' },
});
vm.runInContext(fs.readFileSync('app.js', 'utf8'), context);
const render = (paper) => context.buildAuthorsDiv(paper);
const authors = Array.from({ length: 19 }, (_, i) => `Author ${i + 1}`);

test('fewer than ten authors are shown in full', () => {
  for (const count of [0, 5, 6, 9]) {
    const node = render({ authors: authors.slice(0, count) });
    assert.equal(node.innerHTML, authors.slice(0, count).join(', '));
    assert.equal(node.children.length, 0);
  }
});

test('exactly ten authors truncate, including strong-match papers', () => {
  const node = render({ authors: authors.slice(0, 10), local_match: 'strong',
    local_authors: { 'Author 10': 'strong' } });
  assert.equal(node.children[0].innerHTML, authors.slice(0, 5).join(', '));
  assert.equal(node.children[1].textContent, ', ...');
  assert.match(node.children[2].innerHTML, /incl\. .*author-highlight-strong.*Author 10/);
});

test('hidden weak and strong local authors are visible in paper order and escaped', () => {
  const names = [...authors];
  names[16] = 'J. Wang';
  names[18] = '<Local Author>';
  const node = render({ authors: names, local_match: 'strong',
    local_authors: { '<Local Author>': 'strong', 'J. Wang': 'weak' } });
  const [shown, expand, summary, hidden, collapse] = node.children;
  assert.match(summary.innerHTML, /author-highlight-weak.*J\. Wang.*author-highlight-strong.*&lt;Local Author&gt;/);
  assert.equal(hidden.hidden, true);
  expand.events.click();
  assert.equal(hidden.hidden, false);
  assert.equal(summary.hidden, true);
  assert.equal(collapse.hidden, false);
  assert.match(hidden.innerHTML, /J\. Wang/);
  collapse.events.click();
  assert.equal(hidden.hidden, true);
  assert.equal(summary.hidden, false);
  assert.equal(expand.hidden, false);
});

test('papers without local authors have no inclusion suffix', () => {
  const node = render({ authors });
  assert.equal(node.children[2].innerHTML, '');
});


test('disabled discussed controls create neither buttons nor badges', () => {
  assert.equal(context.buildDiscussedControl({ id: 'test' }), null);
  assert.equal(context.buildDiscussedControl({ id: 'test', discussed_at: '2026-11-06' }), null);
});

test('listing requests revalidate browser cache', async () => {
  const requests = [];
  context.fetch = async (url, options) => {
    requests.push([url, options.cache]);
    return { ok: true, json: async () => ({ current: '2026-11-06', papers: [] }) };
  };
  await context.loadIndex();
  await context.fetchHistoryFile(0);
  await context.fetchHistoryFile(5);
  assert.deepEqual(requests, [
    ['data/index.json', 'no-cache'],
    ['data/today.json', 'no-cache'],
    ['data/today-5.json', 'no-cache'],
  ]);
});

test('both HTML pages load cache-busted assets', () => {
  for (const filename of ['index.html', 'discussed.html']) {
    const nodes = [];
    const sandbox = vm.createContext({
      window: {}, Date: { now: () => 123456 },
      document: {
        createElement: () => ({}),
        head: { appendChild: node => nodes.push(node) },
        body: { appendChild: node => nodes.push(node) },
      },
    });
    const html = fs.readFileSync(filename, 'utf8');
    for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      vm.runInContext(match[1], sandbox);
    }
    assert.equal(nodes[0].href, 'style.css?v=123456');
    assert.equal(nodes[1].src, 'app.js?v=123456');
  }
});

test('startup works before and after DOMContentLoaded', () => {
  const source = fs.readFileSync('app.js', 'utf8');
  const startup = source.slice(source.lastIndexOf('if (document.readyState'));
  for (const state of ['loading', 'interactive', 'complete']) {
    let calls = 0;
    let onReady;
    vm.runInNewContext(startup, {
      startApp: () => calls++,
      document: {
        readyState: state,
        addEventListener: (event, callback) => { onReady = callback; },
      },
    });
    if (state === 'loading') {
      assert.equal(calls, 0);
      onReady();
    }
    assert.equal(calls, 1);
  }
});
