# Design: FoodStock

Shared system for the five application views. It takes the welcoming notebook material of Hallmark Furrow while keeping app controls familiar and compact.

## System

- Scope: app screen; sidebar shell on desktop, native menu under 60rem.
- Theme: Furrow, Hallmark 2.0.0, dealt 1/3.
- Tone: editorial and welcoming, like a grocery notebook (user's choice).
- Axes: light paper, grotesk sans, warm accent. Restrained colour posture.
- Signature: the annual grocery ledger, exact monetary figures and ruled monthly rows.
- No marketing hero, stand-in photographs, map ornament, fabricated metrics or decorative motion.

## Tokens

[docs/tokens.css](docs/tokens.css) is the source of truth for colours, type, spacing and durations.

- Paper: `--color-paper` oklch(96% 0.011 85); secondary paper at 99.5%, deeper neutral at 92%.
- Ink: `--color-ink` oklch(18% 0.006 60); muted ink at 44% for contrast.
- Accent: `--color-accent` oklch(70% 0.19 40), with near-black paired ink.
- Focus: oklch(44% 0.15 40), darker than the catalogue default for contrast on controls.
- Display: Red Hat Display 600. Body and labels: Red Hat Text 400/500.
- Fonts are local assets with OFL licences in `docs/fonts/`.
- Fixed app type scale, ratio 1.2; 16px body, 14px labels, 12px secondary metadata.
- Shared spacing scale: 2, 4, 8, 12, 16, 24, 40, 64, 96, 144px.
- Container capped at 1440px, sidebar 248px; no additional columns on wider screens.

## Surfaces and controls

- Ledger tables are unboxed with horizontal rules. Figures are tabular.
- Forms use a single secondary paper surface. Replenishment is a neutral well.
- Primary controls: tangerine fill, dark ink, 6px radius, at least 44px hit area.
- Secondary controls: paper fill, muted outline, same height and radius.
- Keyboard focus is an immediate outline; hover changes the surface once.
- Press moves a control by 1px; reduced motion suppresses it.
- On mobile, long tables become labeled records without dropping columns.

## Exports

- `docs/tokens.css`: shared tokens.
- `docs/base.css`: base accessibility, document and type rules.
- `docs/style.css`: app composition and control presentation.
- `docs/app.js`: existing interactions plus mobile table labels and native menu presentation.
