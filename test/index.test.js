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
