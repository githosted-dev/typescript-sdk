// This module re-exports the platform-specific transport factory.
// tsup builds this file twice — once for browser (using connect-web) and
// once for node (using connect-node). The package.json exports conditions
// select the correct build at resolution time.
//
// Both platform transport files export the same function signature:
//   createTransport(baseUrl: string, token?: string, options?): Transport

// Default to browser transport. The node build overrides this at the tsup
// entry point level (see tsup.config.ts).
export { createTransport } from "./transport/browser.js";
