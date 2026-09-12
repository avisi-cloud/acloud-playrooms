import { afterAll } from 'vitest';

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
