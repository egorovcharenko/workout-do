// Rest-complete alert: a vibration plus a short two-tone beep, so the athlete
// doesn't have to watch the screen between sets. Browsers only allow audio
// after a user gesture, so the AudioContext is created/resumed on the first
// tap and reused when the timer runs out.

let audioContext = null;

function primeRestAlert() {
  if (typeof window === "undefined") return;
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  try {
    if (!audioContext) audioContext = new AudioCtor();
    if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
  } catch {
    audioContext = null;
  }
}

function beep(context, startAt, frequency) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.25, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.2);
}

function playRestAlert() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try { navigator.vibrate([200, 100, 200]); } catch { /* unsupported */ }
  }
  if (!audioContext || audioContext.state !== "running") return;
  try {
    const now = audioContext.currentTime;
    beep(audioContext, now, 880);
    beep(audioContext, now + 0.25, 1175);
  } catch { /* audio unavailable */ }
}

export { primeRestAlert, playRestAlert };
