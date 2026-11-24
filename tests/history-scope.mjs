import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mountHistory} from '../app/src/history.js';

class FakeClassList {
  constructor(owner) {
    this._owner = owner;
    this._set = new Set();
  }
  add(...names) {
    for (const name of names) {
      if (name) this._set.add(name);
    }
  }
  remove(...names) {
    for (const name of names) this._set.delete(name);
  }
  contains(name) {
    return this._set.has(name);
  }
  toggle(name, force) {
    const on = force === undefined ? !this._set.has(name) : Boolean(force);
    if (on) this._set.add(name);
    else this._set.delete(name);
    return on;
  }
}

function matchesSingle(el, selector, scopeRoot) {
  if (selector.startsWith(':scope > ')) {
    if (!scopeRoot || el.parentNode !== scopeRoot) return false;
    return matchesSingle(el, selector.slice(':scope > '.length), scopeRoot);
  }
  if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  return el.tagName === selector.toUpperCase();
}

function matchesAny(el, selector, scopeRoot) {
  return selector.split(',').some(part => matchesSingle(el, part.trim(), scopeRoot));
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.classList = new FakeClassList(this);
    this.options = [];
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.tabIndex = -1;
    this.onclick = null;
    this.onkeydown = null;
    this.onchange = null;
    this._id = '';
  }
  get id() {
    return this._id;
  }
  set id(value) {
    this._id = String(value);
    this.attributes.id = this._id;
  }
  get className() {
    return [...this.classList._set].join(' ');
  }
  set className(value) {
    this.classList._set = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  setAttribute(name, value) {
    const str = String(value);
    this.attributes[name] = str;
    if (name === 'id') this._id = str;
    if (name === 'class') this.className = str;
  }
  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
  append(...nodes) {
    for (const node of nodes) {
      if (node.parentNode) node.remove();
      node.parentNode = this;
      this.children.push(node);
    }
  }
  insertBefore(node, ref) {
    if (node.parentNode) node.remove();
    node.parentNode = this;
    const index = ref ? this.children.indexOf(ref) : -1;
    if (index >= 0) this.children.splice(index, 0, node);
    else this.children.push(node);
  }
  before(...nodes) {
    if (!this.parentNode) return;
    for (const node of nodes) this.parentNode.insertBefore(node, this);
  }
  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
  add(option) {
    this.options.push(option);
    this.append(option);
  }
  focus() {}
  closest(selector) {
    let current = this;
    while (current) {
      if (matchesAny(current, selector, null)) return current;
      current = current.parentNode;
    }
    return null;
  }
  querySelectorAll(selector) {
    const result = [];
    const seen = new Set();
    const visit = node => {
      for (const child of node.children) {
        if (!seen.has(child) && matchesAny(child, selector, this)) {
          seen.add(child);
          result.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return result;
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

class FakeOption extends FakeElement {
  constructor(text = '', value = text) {
    super('option');
    this.text = String(text);
    this.textContent = String(text);
    this.value = String(value);
  }
}

function withFakeDom(fn) {
  const prevDoc = globalThis.document;
  const prevOption = globalThis.Option;
  const prevRaf = globalThis.requestAnimationFrame;
  globalThis.document = {createElement: tag => new FakeElement(tag)};
  globalThis.Option = FakeOption;
  globalThis.requestAnimationFrame = cb => { cb(); return 0; };
  try {
    return fn();
  } finally {
    globalThis.document = prevDoc;
    globalThis.Option = prevOption;
    globalThis.requestAnimationFrame = prevRaf;
  }
}

function buildShell(pagedProviders) {
  const widget = document.createElement('main');
  const root = document.createElement('div');
  const gear = document.createElement('button');
  gear.id = 'gear';
  widget.append(root, gear);
  for (const p of pagedProviders) {
    const card = document.createElement('article');
    card.className = 'provider-card';
    card.dataset.providerId = p.id;
    root.append(card);
  }
  return {widget, root};
}

const NOW = new Date(2026, 10, 24, 5, 0);
const ALL_PROVIDERS = [
  {id: 'claude', label: 'Claude Code', history: {scope: 'local', daily: [{date: '2026-11-24', tokens: 100}]}},
  {id: 'gemini', label: 'Gemini'},
  {id: 'copilot', label: 'Copilot'},
  {id: 'jetbrains', label: 'JetBrains'},
  {id: 'codex', label: 'OpenAI Codex', history: {scope: 'account', daily: [{date: '2026-11-24', tokens: 200}]}},
];
const PAGE_1 = ALL_PROVIDERS.slice(0, 4);
const PAGE_2 = ALL_PROVIDERS.slice(4, 8);

function sectionHtml(bodyHtml, id) {
  const match = bodyHtml.match(new RegExp(`<section class="history-section" data-history-provider="${id}"[\\s\\S]*?</section>`));
  return match ? match[0] : '';
}

test('stacked and single panel keep 300 Today total and Claude+Codex scope across pages 1 -> 2 -> 1', () => {
  withFakeDom(() => {
    const state = {days: 30, provider: 'all'};
    const mountStacked = paged => {
      const {widget, root} = buildShell(paged);
      const open = mountHistory(
        widget,
        root,
        paged,
        {historyMode: 'panel', historyPanelLayout: 'stacked', historyPanelOpen: true},
        state,
        () => {},
        () => {},
        NOW,
        ALL_PROVIDERS,
      );
      assert.equal(open, true);
      const body = widget.querySelector('.history-panel').children[1].innerHTML;
      assert.match(sectionHtml(body, 'all'), /<span>Today<b>300<\/b><\/span>/);
      assert.ok(sectionHtml(body, 'claude'), 'Claude section present');
      assert.ok(sectionHtml(body, 'codex'), 'Codex section present');
      for (const omitted of ['gemini', 'copilot', 'jetbrains']) {
        assert.equal(sectionHtml(body, omitted), '', `${omitted} must stay excluded`);
      }
    };

    mountStacked(PAGE_1);
    mountStacked(PAGE_2);
    mountStacked(PAGE_1);

    // Single layout preserves Codex selection across page changes and totals 300 for All tools.
    const singleState = {days: 30, provider: 'codex'};
    for (const paged of [PAGE_1, PAGE_2, PAGE_1]) {
      const {widget, root} = buildShell(paged);
      mountHistory(
        widget,
        root,
        paged,
        {historyMode: 'panel', historyPanelLayout: 'single', historyPanelOpen: true},
        singleState,
        () => {},
        () => {},
        NOW,
        ALL_PROVIDERS,
      );
      const panel = widget.querySelector('.history-panel');
      const select = panel.children[0].children[0];
      assert.deepEqual(select.options.map(o => o.value), ['all', 'claude', 'codex']);
      assert.equal(select.value, 'codex');
      assert.match(panel.children[1].innerHTML, /<span>Today<b>200<\/b><\/span>/);
    }

    singleState.provider = 'all';
    for (const paged of [PAGE_1, PAGE_2]) {
      const {widget, root} = buildShell(paged);
      mountHistory(
        widget,
        root,
        paged,
        {historyMode: 'panel', historyPanelLayout: 'single', historyPanelOpen: true},
        singleState,
        () => {},
        () => {},
        NOW,
        ALL_PROVIDERS,
      );
      const body = widget.querySelector('.history-panel').children[1].innerHTML;
      assert.match(body, /<span>Today<b>300<\/b><\/span>/);
    }
  });
});

test('under and card modes keep full total scope while mapping cards to the paged list', () => {
  withFakeDom(() => {
    // Page 1 in under mode: only Claude (card 0) gets mini history; top total is 300.
    const p1 = buildShell(PAGE_1);
    mountHistory(p1.widget, p1.root, PAGE_1, {historyMode: 'under'}, {}, () => {}, () => {}, NOW, ALL_PROVIDERS);
    assert.equal(p1.widget.querySelector('.history-total').innerHTML, 'All tools · Today 300 · 7d 300 · partial');
    const p1Cards = p1.root.querySelectorAll('.provider-card');
    assert.equal(p1Cards[0].querySelectorAll('.usage-history').length, 1);
    assert.match(p1Cards[0].querySelector('.usage-history').innerHTML, /Today 100/);
    assert.match(p1Cards[0].querySelector('.usage-history').innerHTML, /<b>LOCAL<\/b>/);
    for (let i = 1; i < p1Cards.length; i++) {
      assert.equal(p1Cards[i].querySelectorAll('.usage-history').length, 0);
    }

    // Page 2 in under mode: Codex (card 0 on page 2) gets Codex mini history; top total remains 300.
    const p2 = buildShell(PAGE_2);
    mountHistory(p2.widget, p2.root, PAGE_2, {historyMode: 'under'}, {}, () => {}, () => {}, NOW, ALL_PROVIDERS);
    assert.equal(p2.widget.querySelector('.history-total').innerHTML, 'All tools · Today 300 · 7d 300 · partial');
    const p2Cards = p2.root.querySelectorAll('.provider-card');
    assert.equal(p2Cards.length, 1);
    assert.equal(p2Cards[0].querySelectorAll('.usage-history').length, 1);
    assert.match(p2Cards[0].querySelector('.usage-history').innerHTML, /Today 200/);
    assert.match(p2Cards[0].querySelector('.usage-history').innerHTML, /<b>ACCOUNT<\/b>/);

    // Card mode on page 2: clicking card 0 opens Codex (not Claude), with top total 300.
    const cardState = {open: null};
    let redraws = 0;
    const c2 = buildShell(PAGE_2);
    mountHistory(c2.widget, c2.root, PAGE_2, {historyMode: 'card'}, cardState, () => { redraws++; }, () => {}, NOW, ALL_PROVIDERS);
    const codexCard = c2.root.querySelectorAll('.provider-card')[0];
    assert.equal(codexCard.dataset.historyProvider, 'codex');
    assert.equal(codexCard.getAttribute('aria-label'), 'OpenAI Codex usage history');
    codexCard.onclick({target: codexCard});
    assert.equal(cardState.open, 'codex');
    assert.equal(redraws, 1);

    const c2Open = buildShell(PAGE_2);
    mountHistory(c2Open.widget, c2Open.root, PAGE_2, {historyMode: 'card'}, cardState, () => {}, () => {}, NOW, ALL_PROVIDERS);
    assert.equal(c2Open.widget.querySelector('.history-total').innerHTML, 'All tools · Today 300 · 7d 300 · partial');
    assert.match(c2Open.root.querySelectorAll('.provider-card')[0].querySelector('.usage-history').innerHTML, /<span>Today<b>200<\/b><\/span>/);
  });
});

test('panel scope respects caller-selected subset for round shapes', () => {
  withFakeDom(() => {
    const selectedProviders = ALL_PROVIDERS.slice(0, 3);
    const {widget, root} = buildShell(selectedProviders);
    mountHistory(
      widget,
      root,
      selectedProviders,
      {historyMode: 'panel', historyPanelLayout: 'single', historyPanelOpen: true},
      {days: 30},
      () => {},
      () => {},
      NOW,
      selectedProviders,
    );
    const panel = widget.querySelector('.history-panel');
    const select = panel.children[0].children[0];
    assert.deepEqual(select.options.map(o => o.value), ['claude']);
    assert.match(panel.children[1].innerHTML, /<span>Today<b>100<\/b><\/span>/);
  });
});
