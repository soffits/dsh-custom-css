import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { apply, Config } from '../index.js'
import { PREFIX } from '../src/http.js'

test('the plugin registers one prefix route and removes it on unload', () => {
  const routes = []
  const disposers = []
  const ctx = {
    effect(fn) { disposers.push(fn()) },
    webServer: { register(route) { routes.push(route); return () => routes.splice(routes.indexOf(route), 1) } },
    connection: { admit: () => ({ peer: { principal: { kind: 'owner' } } }) },
  }
  apply(ctx, Config({}))
  assert.equal(routes.length, 1)
  assert.equal(routes[0].kind, 'prefix')
  assert.equal(routes[0].path, PREFIX)
  disposers[0]()
  assert.equal(routes.length, 0)
})

test('client.js links the stylesheet once and removes it on dispose', async () => {
  const source = await readFile(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
  let factory
  const head = []
  globalThis.window = { __ModuleLoader__: { load: ({ id, factory: created }) => { assert.equal(id, 'dsh-custom-css'); factory = created } } }
  globalThis.document = {
    baseURI: 'https://dsh.example/ui/',
    head: { appendChild: node => head.push(node) },
    getElementById: id => head.find(node => node.id === id) ?? null,
    createElement: () => ({ remove() { head.splice(head.indexOf(this), 1) } }),
  }
  new Function(source)()
  const plugin = factory()
  const effects = []
  plugin.apply({ effect: (fn) => { effects.push(fn()) } })
  assert.equal(head.length, 1)
  assert.equal(head[0].href, 'https://dsh.example/ui/custom-css/style.css')
  assert.equal(head[0].rel, 'stylesheet')
  effects[0]()
  assert.equal(head.length, 0)
})

/** A page just big enough for client.js: head, body, events, timers and computed styles. */
function fakePage(flag) {
  const head = []
  const body = []
  const listeners = new Map()
  const on = target => (type, fn) => listeners.set(`${target}:${type}`, fn)
  const off = target => type => listeners.delete(`${target}:${type}`)
  const element = (list) => ({ style: {}, textContent: '', remove() { const at = list().indexOf(this); if (at >= 0) list().splice(at, 1) } })
  const win = {
    innerWidth: 867, innerHeight: 669, devicePixelRatio: 3, scrollX: 0, scrollY: 0,
    screen: { width: 951, height: 669, orientation: { type: 'landscape-primary', angle: 90 } },
    navigator: { standalone: true },
    visualViewport: { width: 867, height: 669, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1, addEventListener: on('vv'), removeEventListener: off('vv') },
    matchMedia: query => ({ matches: query === '(display-mode: standalone)' }),
    getComputedStyle: el => (el === doc.documentElement ? { getPropertyValue: () => flag } : { paddingTop: '0px', paddingRight: '84px', paddingBottom: '34px', paddingLeft: '0px' }),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setInterval: () => 2, clearInterval() {}, setTimeout: () => 3,
    addEventListener: on('window'), removeEventListener: off('window'),
  }
  const doc = {
    baseURI: 'https://dsh.example/ui/', defaultView: win, visibilityState: 'visible', documentElement: { clientWidth: 867, clientHeight: 669 },
    head: { appendChild: node => head.push(node) },
    body: { append: (...nodes) => body.push(...nodes), getBoundingClientRect: () => ({ x: 0, y: 0, width: 867, height: 669 }) },
    getElementById: id => [...head, ...body].find(node => node.id === id) ?? null,
    createElement: tag => (tag === 'link' ? element(() => head) : element(() => body)),
    addEventListener: on('document'), removeEventListener: off('document'),
  }
  return { doc, win, head, body, listeners }
}

async function loadClient(page) {
  const source = await readFile(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8')
  let factory
  globalThis.window = { __ModuleLoader__: { load: ({ factory: created }) => { factory = created } } }
  globalThis.document = page.doc
  new Function(source)()
  const effects = []
  factory().apply({ effect: (fn) => { effects.push(fn()) } })
  return effects
}

test('the probe stays off unless the stylesheet carries its flag', async () => {
  const page = fakePage('')
  await loadClient(page)
  page.head[0].onload()
  assert.equal(page.body.length, 0)
})

test('with the flag the probe shows the sizes, marks taps, and leaves nothing behind', async () => {
  const page = fakePage(' 1')
  const effects = await loadClient(page)
  page.head[0].onload()
  const panel = page.body.find(node => node.id === 'dsh-custom-css-probe')
  assert.ok(panel)
  assert.match(panel.textContent, /window 867×669/)
  assert.match(panel.textContent, /safe-area t r b l 0 84 34 0/)
  assert.match(panel.textContent, /display standalone/)
  page.listeners.get('document:pointerdown')({ clientX: 100, clientY: 500, target: null })
  assert.match(panel.textContent, /tap 100,500/)
  assert.ok(page.body.some(node => /left:88px;top:488px/.test(node.style.cssText)))
  page.listeners.get('window:resize')({ type: 'resize' })
  assert.match(panel.textContent, /resize 867×669/)
  effects[0]()
  assert.equal(page.body.length, 0)
  assert.equal(page.head.length, 0)
  assert.equal(page.listeners.size, 0)
})
