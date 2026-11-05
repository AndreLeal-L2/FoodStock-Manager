# Design: FoodStock

Shared system for six application views. The user explicitly replaced the previous warm-paper palette with dark blue and grey, prioritizing the phone and local data storage.

## System

- Scope: app screen, mobile first.
- Theme: Console, Hallmark 2.0.0, dealt 2/3; graphite material with blue replacing amber by user request.
- Palette posture: restrained. No gradients, shadows, texture, photography or decorative motion.
- Navigation: six labeled bottom destinations on mobile, sidebar from 60rem. Labels are short; each route has its full page title and a descriptive link title.
- Signature: a compact grocery checklist with a persistent local outbox and separate saved/synchronized states.

## Tokens

`docs/tokens.css` is the source of truth.

- Background: `--color-paper` oklch(17% 0.015 255), panel at 22%, deeper surface at 14%.
- Text: `--color-ink` oklch(96% 0.005 250); secondary at 86%, muted at 73%.
- Rules: 35% and 54% lightness. Form edges at 55% for contrast.
- Blue accent: oklch(74% 0.135 255), paired with ink at 17%.
- Focus: oklch(84% 0.09 255). Error and success have named text and semantic colours.
- Text and display: Host Grotesk 400/500. Measured amounts, quantities and timestamps: Atkinson Hyperlegible Mono 400/500, with tabular numerals.
- Both fonts and their OFL licences are local assets. Previous Red Hat assets remain for repository history but are not requested by the interface.
- Fixed app type scale, ratio 1.2: body 16px, labels 14px, compact metadata 12px.
- Spacing scale: 2, 4, 8, 12, 16, 24, 40, 64, 96, 144px.
- Single 1440px capped container, 224px desktop sidebar, safe-area-aware bottom navigation.

## Surfaces and controls

- Ledger tables have horizontal rules; phone tables become labeled records, except the compact monthly ledger.
- The checklist has a 44px checkbox target and a 44px inline Edit target. Notes and the editor expand in flow. List instructions sit in a native disclosure.
- Forms sit on one panel level, 6px controls and 10px panel radius.
- Primary controls are blue; secondary controls have a neutral outline. No hover lift.
- Focus appears immediately. Native forms and disclosures retain keyboard semantics.
- No layout depends on an animation. Reduced-motion rules remain in `base.css`.

## State and data

- IndexedDB stores a confirmed base plus the outbox before a save is confirmed.
- A service worker caches the shell and fonts, not API responses.
- Connection status never calls an unacknowledged operation synchronized.
- Conflict and pending details remain available in Dados; export includes unsent operations.
- API identity is pinned to the database, so another endpoint cannot silently replace local data.

## Exports

`docs/tokens.css`, `docs/base.css`, `docs/style.css`; domain projection in `docs/model.mjs`, durable storage/synchronization in `docs/store.mjs`, page wiring in `docs/app.js`, offline shell in `docs/sw.js`.

## Supabase and photography update

The six navigation destinations and blue/grey palette remain. The deployment defines the Supabase project. Dados contains the FoodStock account controls and explicit legacy migration, with no provider URL/key form. Photo capture and recognition review live in Despensa, using the existing form surface. Recognition has distinct prepared, analysing, review, saved and error states. Counts describe total inventory rather than purchases; no recognition result changes stock until the user reviews and confirms it. IndexedDB profiles are isolated per project/account; photos are transient and are not cached by the service worker.

The initial loader uses a revisioned module graph and offers interface-only recovery on startup failure; recovery preserves IndexedDB, session storage and the outbox.


## Local classical vision

Photo recognition uses an on-device worker and registered visual references. The capture panel offers a collapsible reference catalogue, optional touch/mouse crop, local progress/cancel controls, overlaid geometric matches and mandatory inventory review. References and thumbnails stay in the account-scoped browser profile, with explicit JSON export/import. There are no provider credentials, AI calls or generic semantic identification. Existing blue/grey tokens and six destinations remain.


## Reference-free local AI

The photo panel no longer exposes a reference catalogue or registration flow. A free open detector loads only on first analysis, processes pixels in a reusable local worker and shows download/inference progress and cancel. The first large download is disclosed before the user starts. Users can release model storage without clearing their account data, and manual inventory entry remains available on unsupported devices. No photo is uploaded for inference. Labels/quantities remain suggestions until mandatory review; the existing blue/grey mobile forms are preserved.
