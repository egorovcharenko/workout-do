import { state } from './state';
import { render } from './shell';

export async function loadProgressShare() {
  try {
    const response = await fetch('/api/progress-share', { cache: 'no-store' });
    if (!response.ok) return;
    const result = await response.json();
    if (state.progressShareOpen) return;
    state.progressSharePath = result.path;
    if (state.loaded) render();
  } catch { /* Sharing availability must not block the workout page. */ }
}

export async function copyProgressLink() {
  if (!state.progressSharePath) return;
  try {
    await navigator.clipboard.writeText(new URL(state.progressSharePath, location.origin).href);
    state.progressShareMessage = 'Link copied';
  } catch {
    state.progressShareMessage = 'Select the link below to copy it.';
  }
  render();
}

export async function shareProgress() {
  if (state.progressShareBusy) return;
  if (state.progressSharePath && !state.progressShareOpen) {
    state.progressShareOpen = true;
    render();
    return;
  }
  state.progressShareBusy = true;
  state.progressShareOpen = true;
  state.progressShareMessage = '';
  render();
  try {
    const response = await fetch('/api/progress-share', { method: 'POST' });
    if (!response.ok) throw new Error('Could not share progress. Try again.');
    const result = await response.json();
    state.progressSharePath = result.path;
    await copyProgressLink();
  } catch (error) { state.progressShareMessage = error.message; }
  finally { state.progressShareBusy = false; render(); }
}

export async function stopSharingProgress() {
  if (state.progressShareBusy) return;
  state.progressShareBusy = true;
  render();
  try {
    const response = await fetch('/api/progress-share', { method: 'DELETE' });
    if (!response.ok) throw new Error('Could not stop sharing. Try again.');
    state.progressSharePath = null;
    state.progressShareMessage = 'Sharing stopped';
  } catch (error) { state.progressShareMessage = error.message; }
  finally { state.progressShareBusy = false; render(); }
}

export function renderProgressShareControls() {
  if (!state.progressShareOpen) return '';
  const path = /^\/progress\/[a-f0-9]{48}$/.test(state.progressSharePath || '') ? state.progressSharePath : null;
  const url = path ? new URL(path, location.origin).href : null;
  const disabled = state.progressShareBusy ? 'disabled' : '';
  return `<div class="progress-share-panel">
    ${url ? `<p>Anyone with this link can view this snapshot, including measurements.</p>
      <input aria-label="Progress share link" readonly value="${url}" onclick="this.select()">
      <div class="progress-share-actions"><button class="progress-share-button" onclick="copyProgressLink()" ${disabled}>Copy link</button>
        <a href="${path}" target="_blank" rel="noopener noreferrer">Open</a>
        <button class="progress-share-button" onclick="shareProgress()" ${disabled}>Update snapshot</button>
        <button class="progress-share-button" onclick="stopSharingProgress()" ${disabled}>Stop sharing</button></div>` : ''}
    ${state.progressShareMessage ? `<p role="status">${state.progressShareMessage === 'Link copied' ? 'Link copied' : state.progressShareMessage === 'Sharing stopped' ? 'Sharing stopped' : state.progressShareMessage === 'Select the link below to copy it.' ? 'Select the link above to copy it.' : 'Could not complete that action. Try again or copy the link above.'}</p>` : ''}
  </div>`;
}
