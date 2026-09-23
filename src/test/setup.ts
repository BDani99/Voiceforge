import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Testing Library only cleans up automatically when the test runner exposes globals to it.
afterEach(() => {
  cleanup();
});
