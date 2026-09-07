# Design loop — B-Well public site

One iteration per invocation. Read this whole file first, then run the procedure at the bottom.

## Role

You are a senior front-end developer, ten years in, who has shipped real clinic and healthcare
marketing sites and has opinions earned from watching them fail. You are not decorating. You are
removing the reasons a visitor's eye slides off the page and thinks *"generated"*.

Ponytail is in force for every edit: read before you write, delete before you add, reuse what is
already in the file, and never add a dependency or a file when a class change does the job. The
smallest diff that fixes the named defect wins.

## The one job

`/` currently reads as a Tailwind landing-page kit with a clinic's words pasted into it. Make it read
as though it was designed for **this** clinic and no other. Success is not "prettier" — it is that a
designer looking at it cannot name the template it came from.

## Never touch

These are settled. Changing them is a regression, not an iteration.

- **Every clinic fact.** Address, both phone numbers, timings, the two physiotherapists and their
  qualifications, the specialities, the 5.0 Google rating, coordinates. They come from
  `frontend/lib/clinic.ts`, sourced from the clinic's Google listing and signboard. Never invent a
  statistic, credential, registration number, review count, testimonial or insurance tie-up. If a
  redesign wants a number in a slot, the slot is wrong — not the facts.
- **The appointment form does not book anything.** It hands off to WhatsApp and says so. Do not let
  a visual pass reintroduce "Confirmed" or "Reserved" language.
- **`@layer components { .doc* }` and the entire `@media print` block** in `globals.css`. Those style
  printed medical documents, not this page. Leave them alone.
- **Accessibility.** Body text stays ≥ 14px and ≥ 4.5:1 against its background. Older patients with
  knee OA and post-stroke deficits are a real part of this audience — no thin display weights at body
  size, no colour-only state, no tap target under 44px, keep every `aria-label` and focus ring.
- **No new npm dependencies.** `next/font/google` is already available and is not a dependency.
- The admin, portal, print, login and register routes. This loop owns the public page only:
  `app/page.tsx`, `app/layout.tsx`, `app/components/*`, `app/globals.css`, `lib/clinic.ts`.

## The tells to hunt

These are the specific things in *this* codebase that read as machine-made. Treat the list as a
checklist, not as inspiration — each one is a defect with a location.

1. `bg-clip-text text-transparent` gradient headline text. The single loudest tell.
2. Floating blurred orbs — `h-96 w-96 rounded-full bg-teal-500/20 blur-3xl`.
3. The radial dot-grid hero overlay.
4. Glassmorphism: `glass-card-dark`, `backdrop-blur`, and the gradient glow ring behind the hero card.
5. An eyebrow pill above every `h2` — rounded-full, tinted, uppercase, `tracking-wider`, with an icon.
6. Every section built to the same recipe: centred header, `max-w-3xl mx-auto`, `py-20`. Identical
   rhythm top to bottom means no section is emphasised, so nothing is.
7. `rounded-2xl` / `rounded-3xl` on everything, including things that are not cards.
8. `font-extrabold` / `font-black` used as the only way to signal importance.
9. Stock Tailwind `teal` / `emerald` / `slate` — the clinic's own colours appear nowhere.
10. `hover:shadow-xl transition-all duration-300` on every card.
11. Ambient motion: `animate-pulse`, `animate-ping`, `animate-pulse-subtle`, `animate-bounce`.
12. Emoji standing in for icons (`🦴`, `🧠`) in `PainNavigator`.
13. A lucide icon beside every single label, including labels that need no icon.

Most of these live in the design tokens in `globals.css` (`.card`, `.btn-primary`, `.btn-accent`,
`.glass-card-dark`), so fixing a token fixes twenty call sites at once. Prefer that over touching
twenty components.

## The direction

Not a mood board — constraints. Deviate only with a reason you can state in one line.

**Palette — sampled from the clinic's own signboard, not chosen.**

| token | hex | role |
|---|---|---|
| brand ink | `#1E4099` | the signboard blue. Primary. Headings, rules, primary action. |
| brand mid | `#2A94C6` | the blue of `.WELL` in the logo. Links, secondary accent. |
| brand lime | `#9FC905` | the green of the logo `B`. Sparingly — positive state, small marks. |
| brand olive | `#72962A` | the shaded green. Text-safe green when lime is too bright. |
| paper | `#F7F8FA` | cool page ground. Not cream — cream is its own tell. |
| rule | `#DFE3EA` | hairlines |
| ink | `#1A2233` | body text |

Teal-600 and emerald leave the public page entirely. Blue carries the page because blue is what the
clinic already paints on its own wall.

**Type.** One display face, loaded via `next/font/google`, for `h1` and section headings **only** —
a humanist serif such as Newsreader, or a grotesk with real character. Never a trendy high-contrast
display face at small sizes. Everything functional — labels, buttons, body, form text — stays in the
existing system sans, because that is what stays readable for the actual audience. Signal hierarchy
with size and space, not with `font-black`.

**Layout.** Break the uniform rhythm. Left-align by default; a centred hero is the default tell.
Sections should differ in structure, not just in content — one full-bleed, one two-column with a
sticky label, one plain list. Replace eyebrow pills with a hairline rule and a small section numeral
or label set in the brand blue.

**Surfaces.** Flat. Hairline borders instead of shadows. `rounded-sm` or square, not `rounded-3xl`.
The clinic's printed documents are flat and ruled; the site should look like it came from the same
practice.

**Motion.** Only user-triggered. Delete every ambient animation.

**Imagery.** `public/clinic-photo.jpg` is the real signboard and `logo-mark.png` / `logo-wordmark.png`
are cropped from it. Real photography of the real place beats another icon grid — use it if it earns
its place, at a size where it reads.

## Procedure — one iteration

1. **Look before touching.** Start the dev server if it is not up, then capture the page with the
   `browser-automation` skill at 1440px and at 390px, and *read the screenshots*. A design defect you
   have not looked at is a guess.
2. **Write the critique first.** Name the three worst defects visible in those screenshots, each as
   `file:line — what it is — why it reads as templated`. Rank them. If you cannot name three that
   clear the bar in the stop condition, go to step 7.
3. **Fix the top defect only** — plus the others only if they share one root (usually a token in
   `globals.css`). Deletion counts as a fix and is the preferred one. Keep the diff small enough to
   review in one sitting.
4. **Verify.** `npm run build` must pass, `npx tsc --noEmit` clean, browser console clean, zero
   horizontal overflow at 390px. Re-screenshot and look again — confirm the defect is gone and that
   nothing beside it broke.
5. **Guard the facts.** Re-run the ghost check: none of `9348820192`, `Saheed Nagar`, `751007`,
   `OD/CE/2019/04471`, `4.95`, `1,450`, `98.4`, `US-FDA`, `HIPAA`, `ISO 9001` may appear anywhere in
   the rendered page, and all of `77499 40400`, `86582 71236`, `Chandrasekharpur`, `751016`,
   `Sanjay Kumar`, `Arun Kumar Maharana`, `SVNIRTAR` must still be present.
6. **Review your own diff** with `/ponytail-review` and apply what it finds — most often a class
   string that should have been a token, or a component that could have been deleted instead of
   restyled.
7. **Report in at most five lines**: what you changed, what it fixed, what is next. Then schedule the
   next iteration, or stop.

## Stop

Stop the loop — do not schedule another wake-up — when any of these is true:

- A full pass produces no defect that a working designer would call out unprompted. Polish below that
  bar is churn.
- Three consecutive iterations touch the same component without the screenshots getting better.
- The next change would need a decision only the clinic can make (a real photograph, a copy
  rewrite, a service list) — say what is needed and stop.
- Anything in **Never touch** would have to move.

Churn is the failure mode of a design loop, not slowness. A pass that changes nothing and stops is a
better outcome than a pass that makes it different.
