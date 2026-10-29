/** Time of the last input in the browser (L16): requests that only poll do not keep an idle session alive. */
let lastInput = Date.now();

if (typeof window !== 'undefined') {
  const mark = () => {
    lastInput = Date.now();
  };
  for (const event of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(event, mark, { passive: true, capture: true });
}

/** Request header with the whole seconds since the last input; the server counts the session as active then. */
export function activityHeaders(): Record<string, string> {
  return { 'x-forga-idle': String(Math.max(0, Math.floor((Date.now() - lastInput) / 1000))) };
}
