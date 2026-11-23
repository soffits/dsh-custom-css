/**
 * The stylesheet this plugin serves. DSH's page sets `html,body,#root` to
 * `height:100%` and clips nothing, so anything that sticks out past the window
 * makes the document itself scrollable. `overflow:hidden` on html alone is not
 * enough: a hidden viewport can still be scrolled by script (`scrollIntoView`,
 * focus, a mobile keyboard). So body clips everything inside it
 * (`overflow:clip` cannot be scrolled at all) and, as `position:relative`, is
 * also the box absolutely positioned elements are clipped by; then nothing
 * reaches past the window for the viewport to scroll to.
 *
 * Body stays in normal flow on purpose. A `position:fixed` body would put the
 * whole app into one fixed layer, and iOS places fixed layers itself from its
 * own idea of the viewport, which can go stale after a rotation or a return
 * from the background: the app is then drawn away from where taps land, or
 * shrunk with a blank band.
 */
export const OVERFLOW_FIX = `html {
  overflow: hidden;
  overscroll-behavior: none;
}
body {
  position: relative;
  overflow: clip;
  overscroll-behavior: none;
}
`

/** Turns on the on-page viewport probe that client.js draws. */
export const PROBE_FLAG = `:root {
  --dsh-custom-css-probe: 1;
}
`

/**
 * @param {{ fixOverflow: boolean, probe: boolean, css: string }} config
 * @returns {string} The built-in fix when enabled, the probe flag when enabled, then the user's CSS.
 */
export function composeStyle({ fixOverflow, probe = false, css }) {
  const parts = []
  if (fixOverflow) parts.push(`/* dsh-custom-css: overflow fix */\n${OVERFLOW_FIX}`)
  if (probe) parts.push(`/* dsh-custom-css: viewport probe */\n${PROBE_FLAG}`)
  if (css.trim() !== '') parts.push(`/* dsh-custom-css: your css */\n${css.trim()}\n`)
  return parts.join('\n')
}
