import { z } from 'zod';

// Zod's faster parsing compiles code with `new Function`, which the server's
// Content-Security-Policy blocks, and its check for that is reported as a
// violation on every page. Zod runs the check as each schema is created, so
// main.tsx imports this before anything else.
z.config({ jitless: true });
