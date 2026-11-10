# dsh-custom-css

Custom CSS for the DeepSeek Harness (DSH) Web UI, as a small plugin with no dependency on any other plugin.

- **Your own CSS.** Put a stylesheet in the `css` field of the plugin row; it is applied to the whole page.
- **Overflow fix, on by default.** DSH's page sets `html, body, #root` to `height: 100%` and clips nothing, so anything that sticks out past the window makes the whole document scrollable, and the app header scrolls away (seen after a disconnect and reconnect). The fix clips `html` and `body` to the window. Details: [UPSTREAM.md](UPSTREAM.md).

## Installation

```bash
dsh plugin --profile web add github:soffits/dsh-custom-css
```

or add the bundle in the Web UI's plugin manager. A local checkout works too: `plugin_manager install_bundle` with the folder as the target.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `fixOverflow` | `true` | Apply the built-in fix that keeps the whole page from scrolling. |
| `css` | empty | Your CSS, added after the fix, so it can override it. |

Reload the page after changing a setting; the stylesheet is served uncached from `/custom-css/style.css` to the signed-in owner only.

## Development

`npm test` runs the unit tests, `npm run check` checks syntax.
