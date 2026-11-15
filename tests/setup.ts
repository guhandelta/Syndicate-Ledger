import { afterEach } from 'vitest';

// Some tests (the logic grader, the 7x7 puzzles) run for many seconds without yielding. Vitest only
// moves on to the next test through promises, so timers and messages wait until the whole file ends,
// and on a slow machine the worker's report to the runner times out ("Timeout calling onTaskUpdate").
// Letting the event loop run once after each test lets those messages through.
afterEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
