# dsh-custom-css

Custom CSS for the DeepSeek Harness (DSH) Web UI, as a small plugin with no dependency on any other plugin.

- **Your own CSS.** Put a stylesheet in the `css` field of the plugin row; it is applied to the whole page.
- **Overflow fix, on by default.** DSH's page sets `html, body, #root` to `height: 100%` and clips nothing, so anything that sticks out past the window makes the whole document scrollable, and the app header scrolls away (seen after a disconnect and reconnect). The fix clips `html` and `body` to the window, keeping `body` in normal flow (a fixed `body` gets drawn away from where taps land on iPhones after a rotation). Details: [UPSTREAM.md](UPSTREAM.md).
- **Edge to edge, off by default.** For DSH as a home-screen app on a phone: the page takes the whole screen, reaching under the status bar and the home indicator, and DSH keeps inside the safe area by itself. iOS then has no inset of its own to get wrong after a rotation. See [Edge to edge](#edge-to-edge).
- **Viewport probe, off by default.** For layout and tap problems on phones: draws the sizes the browser reports (window, visual viewport, screen, safe-area insets, display mode) over the page and a ring where each tap lands, so one screenshot shows whether drawing and tapping agree.

## Installation

```bash
dsh plugin --profile web add github:soffits/dsh-custom-css
```

or add the bundle in the Web UI's plugin manager. A local checkout works too: `plugin_manager install_bundle` with the folder as the target.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `fixOverflow` | `true` | Apply the built-in fix that keeps the whole page from scrolling. |
| `edgeToEdge` | `false` | Take the whole screen on a phone and keep DSH inside the safe area. An installed home-screen app has to be added again. |
| `probe` | `false` | Draw the viewport probe over the page. Turn it off again when done. |
| `css` | empty | Your CSS, added after the fix, so it can override it. |

Reload the page after changing a setting; the stylesheet is served uncached from `/custom-css/style.css` to the signed-in owner only.

## Edge to edge

DSH's page does not ask a phone for the whole screen, so for a home-screen app iOS keeps the page inside the safe area and owns that inset. After a rotation or a return from the background iOS can leave the inset of the other orientation in place: the page starts a status bar's width away from the edge with a blank band, or taps land beside where things are drawn, until the app is restarted. It shows most on a phone whose status bar sits beside the page in landscape and above it in portrait.

With `edgeToEdge` on, the page asks for the whole screen (`viewport-fit=cover`, and for a home-screen app the status bar drawn over the page), so there is no system inset left to go stale. The plugin then keeps DSH clear of the status bar and the home indicator with the browser's own live `env(safe-area-inset-*)` values: the shell, dialogs, menus, toasts and plugin overlays all stay in one box, and the strips outside it take the app's background. In a desktop browser or an ordinary tab the insets are zero and nothing changes.

### Turning it on

1. Set `edgeToEdge: true` on the plugin row and reload the page.
2. A home-screen app that is already installed has to be added again: iOS decides how the status bar is drawn when the icon is added, not when the app starts. Open DSH in Safari, wait until it has loaded, use Share → Add to Home Screen, then delete the old icon.

A home-screen app has its own storage, separate from Safari's and from the old icon's. The new one starts empty: you sign in again, and whatever DSH or its plugins keep in the browser (drafts, layout choices such as panel sizes, pairings, offline copies) is gone. Everything on the server stays.

Turning the setting off later works the other way round: an icon added while it was on keeps the status bar over the page, so add the icon once more.

### Using the strips

The plugin's default leaves the strips empty. Your own CSS can give parts of them to DSH. Two sets of custom properties on the root element:

| Property | Meaning |
| --- | --- |
| `--edge-inset-top`, `-right`, `-bottom`, `-left` | The safe-area insets as the browser reports them now. |
| `--edge-shell-top`, `-right`, `-bottom`, `-left` | How far DSH stays from each screen edge. Default: the inset on that side. |

Lower a shell inset to let DSH into that strip, then move aside what must stay readable and tappable there. For a phone with the status bar in a column on the right in landscape:

```css
@media (orientation: landscape) {
  :root { --edge-shell-right: 0px; }
  header[data-window-drag] { border-right: var(--edge-inset-right) solid transparent; }
}
```

Now the conversation and the composer use the full width and only the header row steps aside. Dialogs and other overlays follow the box, so give them the same treatment if they would reach the status items (`body > [role="presentation"]` is DSH's dialog layer). To try a layout on a desktop, give the insets numbers for a moment: `:root { --edge-inset-right: 60px; }`.

### Limits

- The status items are drawn in white over the page (that is the only over-the-page style iOS offers). On a light theme they are hard to read unless something dark sits behind them.
- DSH places its menus and popovers itself, in window coordinates, and fits them to the window, not to the safe area. The plugin moves them back to their triggers, but one that DSH had to push against a screen edge can be cut off by the strip's width.
- An overlay that sizes itself with `100vh` or `100dvh` is as tall as the screen, not as the box; it gets clipped at the box edge. `height: 100%` fits.
- Some iOS versions have opened home-screen apps letterboxed, or reported the insets wrongly, when the status bar is over the page (WebKit bugs [313800](https://bugs.webkit.org/show_bug.cgi?id=313800), [317153](https://bugs.webkit.org/show_bug.cgi?id=317153)). Turn on `probe` to see what the device reports: `window` should be the whole screen (the `screen` numbers, swapped in landscape), and `safe-area` should show the status bar's size on the side where it is. A `window` that is short by the status bar means iOS is still insetting the app itself.

What DSH itself could change to make this unnecessary is in [UPSTREAM.md](UPSTREAM.md).

## Development

`npm test` runs the unit tests, `npm run check` checks syntax.
