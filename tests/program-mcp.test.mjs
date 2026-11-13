import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  addExercise, draftFromSettings, moveExercise, removeExercise, renameWorkout,
  renderProgram, resetWorkout, resolveWorkoutId, updateExercise,
} from "../mcp/program-edit.mjs";

const SERVER = path.resolve(import.meta.dirname, "../mcp/server.mjs");
const settingsWith = (saved) => (saved ? { program_builder: JSON.stringify(saved) } : {});

test("an untouched program saves nothing and reads back the code workouts", () => {
  const program = renderProgram({});
  assert.deepEqual(program.workouts.map(w => w.id),
    ["strength-a", "strength-accessories-1", "strength-b", "strength-accessories-2"]);
  assert.ok(program.workouts.every(w => w.edited === false));
  const arms = program.workouts.find(w => w.id === "strength-accessories-1");
  assert.ok(arms.exercises.some(ex => ex.name === "Cable External Rotations"));
  assert.ok(program.weekly_sets_per_muscle.Chest.sets > 0);
});

test("workouts resolve by id, display name and session name", () => {
  const { draft } = draftFromSettings({});
  assert.equal(resolveWorkoutId(draft, "strength-accessories-1"), "strength-accessories-1");
  assert.equal(resolveWorkoutId(draft, "Dips Focus"), "strength-accessories-1");
  assert.equal(resolveWorkoutId(draft, "Strength Accessories 2"), "strength-accessories-2");
  assert.throws(() => resolveWorkoutId(draft, "leg day"), /No workout matches/);
});

test("adding an exercise stores only the edited workout, with the asked-for prescription", () => {
  const { saved, summary } = addExercise({}, { workout: "RDL Focus", name: "Cable Chest Press", sets: 3, reps: [10, 12], rir: 2, rest: 100, position: 3 });
  assert.deepEqual(Object.keys(saved.workouts), ["strength-b"]);
  const entry = saved.workouts["strength-b"].exercises[2];
  assert.equal(entry.name, "Cable Chest Press");
  assert.deepEqual(entry.sets, [[10, 12], [10, 12], [10, 12]]);
  assert.deepEqual(entry.rir, [2, 2, 2]);
  assert.equal(entry.rest, 105); // rounded to the builder's 15 s step
  assert.match(summary, /Added Cable Chest Press/);
  assert.throws(() => addExercise(settingsWith(saved), { workout: "RDL Focus", name: "Cable Chest Press" }), /already in/);
  assert.throws(() => addExercise({}, { workout: "RDL Focus", name: "Sled Push" }), /not in the exercise library/);
});

test("update, move, remove and reset work against saved edits", () => {
  let settings = settingsWith(addExercise({}, { workout: "strength-b", name: "Cable Chest Press" }).saved);
  settings = settingsWith(updateExercise(settings, { workout: "strength-b", name: "Cable Chest Press", sets: 2, reps: 15, rir: null, warmups: 0 }).saved);
  let entry = JSON.parse(settings.program_builder).workouts["strength-b"].exercises.at(-1);
  assert.deepEqual(entry.sets, [[15, 15], [15, 15]]);
  assert.deepEqual(entry.rir, [null, null]);
  assert.deepEqual(entry.warmups, []);

  settings = settingsWith(moveExercise(settings, { workout: "strength-b", name: "Cable Chest Press", position: 1 }).saved);
  assert.equal(JSON.parse(settings.program_builder).workouts["strength-b"].exercises[0].name, "Cable Chest Press");

  const removed = removeExercise(settings, { workout: "strength-b", name: "Barbell RDL" });
  assert.ok(!removed.workout.exercises.some(ex => ex.name === "Barbell RDL"));
  assert.throws(() => removeExercise(settings, { workout: "strength-b", name: "Hack Squat" }), /is not in/);

  const reset = resetWorkout(settingsWith(removed.saved), { workout: "strength-b" });
  assert.deepEqual(Object.keys(reset.saved.workouts), []);
  assert.equal(reset.workout.exercises[0].name, "Barbell RDL");
});

test("renaming a workout keeps the session name used by history", () => {
  const { saved } = renameWorkout({}, { workout: "strength-a", name: "Press Light" });
  assert.equal(saved.workouts["strength-a"].name, "Press Light");
  assert.equal(saved.workouts["strength-a"].exercises, undefined);
  const shown = renderProgram(settingsWith(saved)).workouts.find(w => w.id === "strength-a");
  assert.equal(shown.name, "Press Light");
  assert.equal(shown.session_name, "Strength A");
});

/** Sends the requests over stdio and returns the replies keyed by id. */
async function rpc(requests, env) {
  const child = spawn(process.execPath, [SERVER], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", chunk => { out += chunk; });
  for (const request of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  child.kill();
  const messages = out.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  return Object.fromEntries(messages.map(message => [message.id, message]));
}

test("the stdio server lists its tools and writes a change through the file store", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "program-mcp-"));
  const file = path.join(dir, "settings.json");
  writeFileSync(file, "{}\n");
  const env = { WORKOUT_STORE: "file", WORKOUT_SETTINGS_FILE: file };

  const replies = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "exercise_update", arguments: { workout: "Shrugs Focus", name: "Cable Chest Fly", sets: 2 } } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "program_show" } },
  ], env);
  const { 1: init, 2: list, 3: added, 4: shown } = replies;

  assert.equal(init.result.serverInfo.name, "workout-program");
  assert.deepEqual(list.result.tools.map(tool => tool.name).sort(), [
    "exercise_add", "exercise_move", "exercise_remove", "exercise_update",
    "library_list", "program_show", "program_undo", "workout_rename", "workout_reset",
  ]);
  assert.match(added.result.content[0].text, /Cable Chest Fly in Shrugs Focus is now 2/);
  const saved = JSON.parse(JSON.parse(readFileSync(file, "utf8")).program_builder);
  assert.equal(saved.workouts["strength-accessories-2"].exercises.find(ex => ex.name === "Cable Chest Fly").sets.length, 2);
  const fly = JSON.parse(shown.result.content[0].text).workouts
    .find(w => w.id === "strength-accessories-2").exercises.find(ex => ex.name === "Cable Chest Fly");
  assert.equal(fly.sets, 2);

  const undone = (await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "program_undo" } },
  ], env))[2];
  assert.match(undone.result.content[0].text, /Restored the program/);
  assert.deepEqual(JSON.parse(JSON.parse(readFileSync(file, "utf8")).program_builder).workouts, {});
});

test("a tool call with a bad argument reports the error instead of writing", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "program-mcp-"));
  const file = path.join(dir, "settings.json");
  writeFileSync(file, "{}\n");
  const failed = (await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "exercise_add", arguments: { workout: "Dips Focus", name: "Dips" } } },
  ], { WORKOUT_STORE: "file", WORKOUT_SETTINGS_FILE: file }))[2];
  assert.equal(failed.result.isError, true);
  assert.match(failed.result.content[0].text, /already in Dips Focus/);
  assert.equal(readFileSync(file, "utf8").trim(), "{}");
});

test("a credential failure is reported per call and leaves the server running", async () => {
  // A path that cannot be read fails fast and identically on every machine,
  // whether or not this one happens to have application-default credentials.
  const missing = path.join(mkdtempSync(path.join(tmpdir(), "program-mcp-")), "missing.json");
  const replies = await rpc([
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "program_show" } },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "library_list", arguments: { query: "external" } } },
  ], { WORKOUT_STORE: "firestore", WORKOUT_SA_PATH: missing, GOOGLE_APPLICATION_CREDENTIALS: "" });

  assert.equal(replies[2].result.isError, true);
  assert.match(replies[2].result.content[0].text, /service-account key|application-default credentials/);
  assert.match(replies[2].result.content[0].text, /missing\.json/);
  // Still answering afterwards, and the library needs no credentials at all.
  assert.deepEqual(JSON.parse(replies[3].result.content[0].text).exercises, ["Cable External Rotations"]);
});
