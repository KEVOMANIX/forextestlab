/**
 * Support notification chimes, synthesised with WebAudio so there is no audio
 * asset to download and nothing to fetch before the first alert can play.
 *
 * Browsers only allow audio after a user gesture, so the context is created
 * lazily and a suspended context is resumed on the next interaction rather
 * than throwing.
 */
const MUTE_KEY = "forextestlab_support_muted";

type Chime = "incoming" | "sent";

let context: AudioContext | null = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

export function isSupportMuted() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}

export function setSupportMuted(muted: boolean) {
  window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  if (!muted) void audioContext()?.resume();
}

/** Call from a click handler so later background chimes are allowed to play. */
export function primeSupportSound() {
  const ctx = audioContext();
  if (ctx?.state === "suspended") void ctx.resume();
}

/**
 * Two soft sine tones with a quick attack and a long tail — a notification,
 * not an alarm. `incoming` rises (something arrived), `sent` is a single
 * quieter note (acknowledgement).
 */
export function playSupportChime(kind: Chime = "incoming") {
  if (isSupportMuted()) return;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    void ctx.resume();
    if (ctx.state === "suspended") return;
  }
  const now = ctx.currentTime;
  const notes = kind === "incoming" ? [660, 880] : [520];
  const master = ctx.createGain();
  master.gain.value = kind === "incoming" ? 0.09 : 0.05;
  master.connect(ctx.destination);

  notes.forEach((frequency, index) => {
    const start = now + index * 0.11;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(1, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + 0.45);
  });
}
