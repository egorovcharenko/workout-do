# workout_do

Personal workout tracker (Next.js + Firebase/Firestore), live at **https://workouts.egorovcharenko.com**.
Port of the old flat-file app in the `egorovcharenko/workout-tracker` GitHub repo — that repo is the
**old** app (plain JS + Python API) and is NOT this project's remote. Do not push there.

## Dev cycle

1. **Edit + verify**: `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` must pass. Read
   `node_modules/next/dist/docs/` before writing Next.js-specific code (see AGENTS.md — this Next
   version has breaking changes).
2. **Commit**: directly on `main` of this repo (`egorovcharenko/workout-do`).
3. **Ship**: push `main`. The Vercel project `workout-do` is git-linked to this repo and deploys
   on every push. `npx vercel deploy --prod --yes` from an authenticated machine still works as a
   manual fallback.
4. **Verify on prod**: localhost sign-in is blocked by AuthGate (Google login doesn't work on
   localhost), so a dev-server browser preview can't get past login. Check the deployed app in a
   signed-in browser instead, or use **test mode**: open `/session?w=<id>&test=1` (links at the
   bottom of the home screen) — test mode never saves anything.

## Layout

- `app/` — thin route shells (`/` home, `/session`) behind AuthGate; real UI is client components.
- `components/home/` — native dark home screen: plan queue, Start/Resume hero, workout rotation,
  14-day activity, and compact strength/body summaries. Calendar and detailed history/measurement
  controls remain expandable. Renders via template-string HTML (`render()` in `shell.js`);
  `overview.js` derives summary values, and `app/home.css` uses the session view's shared `T` palette
  through CSS variables. Home does not use a color-inversion filter.
- `components/session/` — live workout session UI (React): `SessionApp.jsx` orchestrates,
  `useWorkoutActions.js` holds the mutations, autosave lives in `lib/legacy/session-persistence.js`.
- `lib/legacy/` — ported domain logic: `shared.js` (WORKOUTS templates, SWAP_GROUPS, TEST_MODE),
  `session-utils.js` (template flattening, deload/plan prescriptions), `standards.js` (muscle map,
  `calcSet1RM`), `session-persistence.js` (serialize/hydrate/save queue).
- `lib/db/` — Firestore access. `sessions.ts` mirrors the old server endpoints; sessions are one
  doc per workout with embedded `sets`.

## Data model gotchas

- `weight_lb` on a saved set depends on the exercise type: plain → weight; `assist` (Pull-Ups,
  Dips, Dead Hang) → bodyweight minus band assistance; `isBandsOnly` → band total; `bandAddon` →
  weight + bands; `repsOnly` (Hanging Knee Raise, Surf Pop-Up) → always 0. Older Hanging Knee Raise rows saved
  bodyweight in `weight_lb` — never use weight/volume from reps-only rows. Cable rows store the
  machine's per-stack selector load (pin plus up to two 1.25 lb add-ons); `Lat Pulldown` and low-row
  variants use two linked stacks, so
  analytics must pass their recorded weight through `effectiveExerciseWeight`.
- 1RM scoring: `calcSet1RM` in `lib/legacy/standards.js` and `get1RMHistory` in `lib/db/sessions.ts`
  must stay in sync (reps-only → raw reps; Dragon Fly → stage score; assist → formula minus bands).
- Session saves: a save with `session_id: null` **creates a new doc**. All saves must go through
  `autoSavePayload` / `finishSavePayload` (session-persistence.js), which serialize saves and stamp
  the server-issued id onto late payloads — calling `api.save` directly can duplicate sessions.
- Per-session UI state (swaps, skipped, deferred, deload) lives in the session doc's `state_json`
  and hydrates the in-memory `_sessionStateCache` keyed `${workoutName}:${date}`.

## Shared suite packages

`packages/` holds a vendored copy of the shared code this app used to import from the
`egorovcharenko/personal-suite` monorepo:

| Package | Purpose |
| --- | --- |
| `@personal-suite/app-registry` | Canonical list of suite apps + their production/local URLs. |
| `@personal-suite/app-shell` | Suite chrome (header, app switcher) shared across apps. |
| `@personal-suite/design-system` | Fonts and base Tailwind/CSS tokens. |
| `@personal-suite/pwa` | Manifest builder + service-worker registrar. |
| `@personal-suite/suite-auth` | NextAuth + Firebase Admin/client glue. |

They are npm workspaces, so `npm install` at the repo root wires them up and `transpilePackages`
in `next.config.ts` compiles them. **These are copies** — a change here does not reach
`personal-suite` or the sibling app repo, and vice versa. Port shared-package edits by hand.
