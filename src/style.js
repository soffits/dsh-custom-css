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
const sides = (value) => SIDES.map(value).join(' ')
const inset = (side) => `var(--edge-inset-${side})`
const outward = (side) => `calc(-1 * ${inset(side)})`

/**
 * Edge to edge: for a page that takes the whole screen of a phone (client.js
 * adds the tags that ask for it when it sees the flag). The window then reaches
 * under the status bar and the home indicator, and `env(safe-area-inset-*)`
 * says how far they reach in; nothing below copies those numbers, so a rotation
 * is followed by the browser alone. Where the insets are zero every rule here
 * resolves to what DSH already has.
 *
 * Three boxes:
 * - `html` keeps to the safe area (a transparent border as wide as the insets)
 *   and, through the identity transform, is the containing block of every
 *   `position: fixed` box. So DSH's modals, toasts and any plugin's overlay stay
 *   inside the safe area without a rule of their own, and no layer is left
 *   fixed to the viewport for iOS to place by itself.
 * - `body` grows back out to the whole screen, so the app's background fills
 *   the strips and the overflow fix clips at the screen edge as before.
 * - `#root`, DSH's shell, is padded by `--edge-shell-*`. They default to the
 *   insets; your own CSS can lower one to let the shell into that strip and
 *   then move single controls aside with `--edge-inset-*`.
 *
 * DSH places its menus and popovers by script: portalled to `body`, fixed, with
 * inline `top` and `left` in window coordinates. Inside a containing block that
 * starts at the safe area they would sit off by the top and left insets, so the
 * last rule moves them back.
 */
export const EDGE_TO_EDGE = `:root {
  --dsh-custom-css-edge: 1;
${SIDES.map(side => `  --edge-inset-${side}: env(safe-area-inset-${side}, 0px);`).join('\n')}
${SIDES.map(side => `  --edge-shell-${side}: ${inset(side)};`).join('\n')}
}
html {
  box-sizing: border-box;
  border: solid transparent;
  border-width: ${sides(inset)};
  transform: translate(0);
}
body {
  margin: ${sides(outward)};
  height: calc(100% + ${inset('top')} + ${inset('bottom')});
}
#root {
  box-sizing: border-box;
  padding: ${sides(side => `var(--edge-shell-${side})`)};
}
body > [style*="top:"][style*="left:"] {
  translate: ${outward('left')} ${outward('top')};
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
