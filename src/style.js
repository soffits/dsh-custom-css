/**
 * The stylesheet this plugin serves. DSH's page sets `html,body,#root` to
 * `height:100%` and clips nothing, so anything that sticks out past the window
 * makes the document itself scrollable. `overflow:hidden` alone is not enough:
 * a hidden element can still be scrolled by script (`scrollIntoView`, focus,
 * a mobile keyboard), so body is taken out of flow and clipped, which cannot
 * scroll at all, and html is hidden so the viewport has nothing to scroll.
 */
export const OVERFLOW_FIX = `html {
  overflow: hidden;
  overscroll-behavior: none;
}
body {
  position: fixed;
  inset: 0;
  width: 100%;
  overflow: clip;
  overscroll-behavior: none;
}
`

/**
 * @param {{ fixOverflow: boolean, css: string }} config
 * @returns {string} The built-in fix when enabled, then the user's CSS.
 */
export function composeStyle({ fixOverflow, css }) {
  const parts = []
  if (fixOverflow) parts.push(`/* dsh-custom-css: overflow fix */\n${OVERFLOW_FIX}`)
  if (css.trim() !== '') parts.push(`/* dsh-custom-css: your css */\n${css.trim()}\n`)
  return parts.join('\n')
}
