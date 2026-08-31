# Personal Suite family design system

The suite shares interface fundamentals without forcing every app into the
same visual theme.

- Geist Sans for interface text and Geist Mono for compact metadata.
- One spacing, radius, motion, focus, and control-height scale.
- Each app owns its accent, illustration style, density, and product-specific
  surfaces.
- Games may keep their own display typography inside the game canvas.

Importing `@personal-suite/app-shell/styles.css` loads these tokens. New shared
controls should use the `suite-ui-*` primitives in `src/styles.css` before an
app introduces a one-off equivalent.
