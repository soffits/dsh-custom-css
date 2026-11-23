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

const SIDES = ['top', 'right', 'bottom', 'left']
const shell = (side) => `var(--edge-shell-${side})`

/**
 * Edge to edge: for a page that takes the whole screen of a phone (client.js
 * adds the tags that ask for it when it sees the flag). The window then reaches
 * under the status bar and the home indicator, and `env(safe-area-inset-*)`
 * says how far they reach in; nothing below copies those numbers, so a rotation
 * is followed by the browser alone. Where the insets are zero every rule here
 * resolves to what DSH already has.
 *
 * One box holds everything DSH draws: `body` stays `--edge-shell-*` away from
 * the screen edges, and through the identity transform it is the containing
 * block of `position: fixed` boxes as well. So the shell, DSH's modals and
 * toasts and any plugin's overlay all keep inside it without a rule of their
 * own, the overflow fix clips them with everything else, and no layer is left
 * fixed to the viewport for iOS to place by itself. Body's background is what
 * the browser paints behind the whole page, so the strips outside the box take
 * the app's colour.
 *
 * The shell insets default to the safe-area insets. Your own CSS can lower one
 * to let DSH into that strip and then move single controls aside with
 * `--edge-inset-*`.
 *
 * DSH places its menus and popovers by script: portalled to `body`, with inline
 * `top` and `left` in window coordinates. In a box that starts away from the
 * window's corner they would sit off by that distance, so the last rule moves
 * them back.
 */
export const EDGE_TO_EDGE = `:root {
  --dsh-custom-css-edge: 1;
${SIDES.map(side => `  --edge-inset-${side}: env(safe-area-inset-${side}, 0px);`).join('\n')}
${SIDES.map(side => `  --edge-shell-${side}: var(--edge-inset-${side});`).join('\n')}
}
body {
  margin: ${SIDES.map(shell).join(' ')};
  height: calc(100% - ${shell('top')} - ${shell('bottom')});
  transform: translate(0);
}
body > [style*="top:"][style*="left:"] {
  translate: calc(-1 * ${shell('left')}) calc(-1 * ${shell('top')});
}
`

/** Turns on the on-page viewport probe that client.js draws. */
export const PROBE_FLAG = `:root {
  --dsh-custom-css-probe: 1;
}
`

/**
 * @param {{ fixOverflow: boolean, edgeToEdge?: boolean, probe?: boolean, css: string }} config
 * @returns {string} Each built-in part that is turned on, then the user's CSS, so it can override them.
 */
export function composeStyle({ fixOverflow, edgeToEdge = false, probe = false, css }) {
  const parts = []
  if (fixOverflow) parts.push(`/* dsh-custom-css: overflow fix */\n${OVERFLOW_FIX}`)
  if (edgeToEdge) parts.push(`/* dsh-custom-css: edge to edge */\n${EDGE_TO_EDGE}`)
  if (probe) parts.push(`/* dsh-custom-css: viewport probe */\n${PROBE_FLAG}`)
  if (css.trim() !== '') parts.push(`/* dsh-custom-css: your css */\n${css.trim()}\n`)
  return parts.join('\n')
}
