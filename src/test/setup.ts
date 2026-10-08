import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// A little patience: one test timed out at the 1 s default while the whole suite was running.
configure({ asyncUtilTimeout: 3000 });
