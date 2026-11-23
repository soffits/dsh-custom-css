# Queue

## Edge to edge

- Rare: a toast that DSH anchors to a control carries an inline `left` only, so the popup rule (inline `top` and `left`) does not move it back; on a phone with a left inset in landscape it sits off by that inset. Needs a per-axis rule.
- Rare: DSH's floating dock panes are placed through custom properties, not inline `top` and `left`, and are not moved back.
- Likely on phones with side insets, default shell insets: DSH fits a popup to the window, so one pushed against a screen edge reaches past `body` and is clipped by up to the inset's width. The clean fix is upstream (UPSTREAM.md, second report); `overflow-clip-margin` would do it here once Safari has it.
