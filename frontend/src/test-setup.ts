import { afterAll, vi } from 'vitest';

// jsdom does not implement the browser's system-theme and responsive media queries.
window.matchMedia = (query: string): MediaQueryList => {
  const mediaQuery = new EventTarget();
  return Object.assign(mediaQuery, {
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  });
};

/**
 * Stops a timer started at import time from outliving the file that started it,
 * which is how the Wails runtime's poll fails whichever file runs next.
 */
const startInterval = window.setInterval.bind(window);
const started = new Set<number>();

window.setInterval = ((...intervalArguments: Parameters<typeof startInterval>) => {
  const id = startInterval(...intervalArguments);
  started.add(id);
  return id;
}) as typeof window.setInterval;

afterAll(() => {
  for (const id of started) window.clearInterval(id);
  started.clear();
});
