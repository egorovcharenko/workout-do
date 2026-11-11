#!/usr/bin/env node
// MCP server (stdio, JSON-RPC 2.0) for editing the live workout program
// without opening the builder in a browser. Hand-rolled on purpose: no new
// npm dependency, and the whole protocol surface used here is three methods.
//
// Every mutation reads settings.program_builder, applies one change through
// mcp/program-edit.mjs, and writes it back — keeping the previous JSON in
// program_builder_prev so program_undo can put it back.
import { createInterface } from "node:readline";
import {
  PROGRAM_BUILDER_KEY, addExercise, libraryNames, moveExercise, removeExercise,
  renameWorkout, renderProgram, resetWorkout, updateExercise,
} from "./program-edit.mjs";
import { store } from "./settings-store.mjs";

const PREV_KEY = "program_builder_prev";
// An unedited program saves nothing, so remember it as an empty edit set
// rather than "" — undo must be able to go back to the code program.
const NO_EDITS = JSON.stringify({ version: 1, workouts: {} });
const workoutArg = { type: "string", description: "Workout id or display name, e.g. strength-a or \"Dips Focus\"." };
const nameArg = { type: "string", description: "Exercise name as the program shows it." };
const shape = {
  sets: { type: "integer", description: "Number of working sets." },
  reps: { type: "array", items: { type: "integer" }, description: "Rep range [min, max] for every set." },
  rir: { type: ["integer", "null"], description: "Planned reps in reserve per set; null clears it." },
  rest: { type: "integer", description: "Rest between sets in seconds (rounded to 15)." },
};

const MUTATIONS = {
  exercise_add: { fn: addExercise, required: ["workout", "name"], extra: { ...shape, position: { type: "integer", description: "1-based slot in the workout; appended when omitted." } },
    description: "Add a library exercise to one program workout." },
  exercise_remove: { fn: removeExercise, required: ["workout", "name"], extra: {},
    description: "Remove an exercise from one program workout." },
  exercise_update: { fn: updateExercise, required: ["workout", "name"], extra: { ...shape, warmups: { type: "integer", description: "Number of warm-up sets." } },
    description: "Change an exercise's sets, rep range, planned RIR, rest or warm-up count." },
  exercise_move: { fn: moveExercise, required: ["workout", "name", "position"], extra: { position: { type: "integer", description: "1-based target slot." } },
    description: "Reorder an exercise inside its workout." },
  workout_rename: { fn: renameWorkout, required: ["workout", "name"], extra: {},
    description: "Rename a workout's display name (saved session names and history are untouched)." },
  workout_reset: { fn: resetWorkout, required: ["workout"], extra: {},
    description: "Drop saved edits for one workout, back to the code program." },
};

const tools = [
  { name: "program_show", description: "The live program: four workouts, their exercises, sets, rep ranges, planned RIR, rest, and planned weekly sets per muscle.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "library_list", description: "Exercise names the program can use, optionally filtered.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false } },
  ...Object.entries(MUTATIONS).map(([name, spec]) => ({
    name, description: spec.description,
    inputSchema: {
      type: "object",
      properties: { workout: workoutArg, ...(spec.required.includes("name") ? { name: nameArg } : {}), ...spec.extra },
      required: spec.required, additionalProperties: false,
    },
  })),
  { name: "program_undo", description: "Restore the program saved before the last change made through this server.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false } },
];

async function call(name, args = {}) {
  const db = await store();
  if (name === "program_show") {
    const settings = await db.getSettings();
    return { source: db.describe(), ...renderProgram(settings) };
  }
  if (name === "library_list") {
    const names = libraryNames(args.query);
    return { count: names.length, exercises: names };
  }
  if (name === "program_undo") {
    const settings = await db.getSettings();
    const previous = settings[PREV_KEY];
    if (!previous) throw new Error("Nothing to undo: this server has not changed the program yet.");
    await db.saveSettings({ [PROGRAM_BUILDER_KEY]: previous, [PREV_KEY]: settings[PROGRAM_BUILDER_KEY] || NO_EDITS });
    return { summary: "Restored the program from before the last change.", ...renderProgram({ ...settings, [PROGRAM_BUILDER_KEY]: previous }) };
  }
  const spec = MUTATIONS[name];
  if (!spec) throw new Error(`Unknown tool: ${name}`);
  for (const key of spec.required) if (args[key] == null) throw new Error(`${name} needs "${key}".`);
  const settings = await db.getSettings();
  const { saved, workout, summary } = spec.fn(settings, args);
  const value = JSON.stringify(saved);
  await db.saveSettings({ [PROGRAM_BUILDER_KEY]: value, [PREV_KEY]: settings[PROGRAM_BUILDER_KEY] || NO_EDITS });
  return { summary: `${summary} Saved — your next ${workout.name} uses it.`, workout };
}

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });

async function handle(request) {
  const { id, method, params } = request;
  if (method === "initialize") {
    return reply(id, { protocolVersion: params?.protocolVersion === "2024-11-05" ? "2024-11-05" : "2025-06-18",
      capabilities: { tools: {} }, serverInfo: { name: "workout-program", version: "1.0.0" } });
  }
  if (method === "tools/list") return reply(id, { tools });
  if (method === "tools/call") {
    try {
      const result = await call(params?.name, params?.arguments || {});
      return reply(id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    } catch (error) {
      return reply(id, { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true });
    }
  }
  if (method === "ping") return reply(id, {});
  if (typeof id === "undefined") return undefined; // notification
  return send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } });
}

// One request at a time: two overlapping edits would both read the old
// program and the second write would drop the first one's change.
let queue = Promise.resolve();

createInterface({ input: process.stdin }).on("line", (line) => {
  const text = line.trim();
  if (!text) return;
  let request;
  try { request = JSON.parse(text); } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
  }
  queue = queue.then(() => handle(request)).catch(error => {
    if (typeof request.id !== "undefined") send({ jsonrpc: "2.0", id: request.id, error: { code: -32603, message: error.message } });
  });
});
