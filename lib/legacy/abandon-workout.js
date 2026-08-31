/**
 * Delete the current workout draft before leaving the session. If deletion
 * fails, keep the user in place so they can retry without losing context.
 */
async function abandonAndExit({ discard, exit }) {
  await discard();
  exit();
  return { status: "abandoned" };
}

export { abandonAndExit };
