# workout_do

Personal workout tracker (Next.js + Firebase/Firestore), live at **https://workout-do.vercel.app**.
Port of the old flat-file app in the `egorovcharenko/workout-tracker` GitHub repo — that repo is the
**old** app (plain JS + Python API) and is NOT this project's remote. Do not push there.

## Dev cycle

1. **Edit + verify**: `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` must pass. Read
   `node_modules/next/dist/docs/` before writing Next.js-specific code (see AGENTS.md — this Next
   version has breaking changes).
2. **Commit**: directly on `main`. There is **no git remote** — the repo is local-only; git history
   is for record-keeping and Vercel's commit metadata.
3. **Ship** ("push" means this): `npx vercel deploy --prod --yes` from the repo root. The Vercel
   project link lives in `.vercel/project.json` (project `workout-do`). Deploys are CLI-driven;
   the Vercel project is not connected to any git repo.
4. **Verify on prod**: localhost sign-in is blocked by AuthGate (Google login doesn't work on
   localhost), so a dev-server browser preview can't get past login. Check the deployed app in a
   signed-in browser instead, or use **test mode**: open `/session?w=<id>&test=1` (links at the
   bottom of the home screen) — test mode never saves anything.

## Layout

- `app/` — thin route shells (`/` home, `/session`) behind AuthGate; real UI is client components.
- `components/home/` — home tab: workout cards, plan queue, calendar, summary/measurements cards.
  Renders via template-string HTML (`render()` in `shell.js`), not React.
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
  weight + bands; `repsOnly` (Hanging Knee Raise) → always 0. Older Hanging Knee Raise rows saved
  bodyweight in `weight_lb` — never use weight/volume from reps-only rows. Cable rows store the
  machine's per-stack pin value; `Lat Pulldown` and low-row variants use two linked stacks, so
  analytics must pass their recorded weight through `effectiveExerciseWeight`.
- 1RM scoring: `calcSet1RM` in `lib/legacy/standards.js` and `get1RMHistory` in `lib/db/sessions.ts`
  must stay in sync (reps-only → raw reps; Dragon Fly → stage score; assist → formula minus bands).
- Session saves: a save with `session_id: null` **creates a new doc**. All saves must go through
  `autoSavePayload` / `finishSavePayload` (session-persistence.js), which serialize saves and stamp
  the server-issued id onto late payloads — calling `api.save` directly can duplicate sessions.
- Per-session UI state (swaps, skipped, deferred, deload) lives in the session doc's `state_json`
  and hydrates the in-memory `_sessionStateCache` keyed `${workoutName}:${date}`.
