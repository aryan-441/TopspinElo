const soundKey = 'rallydesk-court-sound';
let enabled = false;
try { enabled = localStorage.getItem(soundKey) === 'on'; } catch { /* Storage can be unavailable. */ }
let audio: AudioContext | undefined;

export function soundEnabled() { return enabled; }

export function setCourtSound(value: boolean) {
  enabled = value;
  try { localStorage.setItem(soundKey, value ? 'on' : 'off'); } catch { /* Keep the session preference. */ }
  if (value) playTap(820);
}

function playTap(pitch: number) {
  if (!enabled || !window.AudioContext) return;
  audio ??= new AudioContext();
  const context = audio;
  void context.resume().then(() => {
    if (!enabled) return;
    const tone = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    tone.frequency.setValueAtTime(pitch, start);
    tone.frequency.exponentialRampToValueAtTime(pitch * .55, start + .045);
    gain.gain.setValueAtTime(.045, start);
    gain.gain.exponentialRampToValueAtTime(.0001, start + .055);
    tone.connect(gain).connect(context.destination);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    tone.start(start);
    tone.stop(start + .06);
  }).catch(() => {});
}

export function installCourtFeedback() {
  const onPress = (event: PointerEvent) => {
    const button = event.target instanceof Element && event.target.closest<HTMLElement>('.button-primary,.point-button,.button-board');
    if (!button) return;
    const bounds = button.getBoundingClientRect();
    button.style.setProperty('--press-x', (event.clientX - bounds.left) + 'px');
    button.style.setProperty('--press-y', (event.clientY - bounds.top) + 'px');
  };
  const onClick = (event: MouseEvent) => {
    const button = event.target instanceof Element && event.target.closest('button:not(:disabled)');
    if (button) playTap(button.matches('.point-button') ? 920 : 540);
  };
  const onScroll = () => document.documentElement.toggleAttribute('data-scrolled', window.scrollY > 4);
  document.addEventListener('pointerdown', onPress, { passive: true });
  document.addEventListener('click', onClick, true);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  return () => {
    document.removeEventListener('pointerdown', onPress);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('scroll', onScroll);
  };
}
