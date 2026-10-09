import '@testing-library/jest-dom/vitest';
// jsdom has no IndexedDB, and signed-in screens open the local database.
import 'fake-indexeddb/auto';
import { configure } from '@testing-library/react';

// A little patience: one test timed out at the 1 s default while the whole suite was running.
configure({ asyncUtilTimeout: 3000 });
