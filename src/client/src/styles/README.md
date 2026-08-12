# Vue CSS architecture

`index.css` is the only stylesheet imported by `main.js`. Its import order is
part of the UI contract: desktop and mobile parity rules intentionally load
after the reusable modules they refine.

## Module boundaries

- `foundation/`: document, application shell and global notification styles.
- `primitives/`: reusable cards, panels, controls, modals and tool surfaces.
- `features/`: hand, seats, trick/event, interaction and result presentation.
- `motion/`: table effects and the single canonical definition of each keyframe.
- `layout/`: desktop table, responsive fallback and physical mobile landscape.
- `compat/`: the explicit legacy-geometry boundary required while `/` and
  `/vue/` are both supported. New product styles must not be added here.

## Change rules

1. Add styles to the narrowest owning module; do not add a second global entry.
2. Keep component-facing class names stable unless templates and browser tests
   change together.
3. Do not duplicate a keyframe name or increase the `!important` baseline.
4. Run `npm run check:css`, `npm run build:client` and the relevant geometry
   tests after changing layout or motion.
5. A compatibility rule moves into its owning module only when its legacy/Vue
   geometry test proves the same cascade result.
