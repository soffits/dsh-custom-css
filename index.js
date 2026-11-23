/**
 * DeepSeek Harness Host plugin: custom CSS for the Web UI. It serves one
 * stylesheet (the built-in parts that are turned on, then the user's own CSS
 * from the plugin row) to the signed-in owner; client.js links it into the page.
 */
import { Config } from './src/config.js'
import { createHandler, PREFIX } from './src/http.js'
import { composeStyle } from './src/style.js'

export const name = 'dsh-custom-css'
export const inject = ['webServer', 'connection']
export { Config }

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ fixOverflow: boolean, edgeToEdge: boolean, probe: boolean, css: string }} config
 */
export function apply(ctx, config) {
  const style = composeStyle(config)
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: createHandler({ connection: ctx.connection, style: () => style }),
  }), 'custom-css: stylesheet route')
}
