# @githosted/sdk

TypeScript SDK for [githosted](https://githosted.dev) — read, write, and diff files in versioned Git repos from Node, browsers, and edge runtimes.

A small, typed surface for the operations you actually do against a repo: read a file, commit a change, list history, diff two refs. Real Git underneath; you're not talking to a custom blob store. Browser, Node, and edge entry points are all included.

## Install

```sh
npm install @githosted/sdk
```

## Quick start

```ts
import { Client } from "@githosted/sdk";

const repo = new Client({ token: "gw_…" }).repo("my-agent");

// Write a file (creates a commit).
await repo.write("output.json", '{"status": "ok"}', {
  message: "Run #42",
});

// Read it back. `content` is the UTF-8-decoded string;
// `rawContent` is the original Uint8Array.
const file = await repo.read("output.json");
console.log(file.content);

// Walk recent history.
for (const commit of await repo.log({ limit: 5 })) {
  console.log(commit.hash.slice(0, 7), commit.subject);
}

// Diff between two refs.
const delta = await repo.diff("HEAD~1", "HEAD");
console.log(delta.patch);
```

## Authentication

Tokens are scoped to a workspace. Mint one at [app.githosted.dev → Tokens](https://app.githosted.dev), then pass it to `new Client({ token: … })`.

| Token prefix | Scope |
|---|---|
| `gw_…` | Read + write |
| `gr_…` | Read-only |

In a browser, use a short-lived token issued by your backend — never embed `gw_…` in client-side code.

## React hooks

```ts
import { useRepo, useFile } from "@githosted/sdk/react";
```

Hooks wrap [TanStack Query](https://tanstack.com/query) (peer dep, optional). See [docs/sdks/typescript/react](https://docs.githosted.dev/sdks/typescript/react/).

## Entry points

| Import | Use in |
|---|---|
| `@githosted/sdk` | auto-resolves Node/browser by environment |
| `@githosted/sdk/proto` | generated protobuf types only |
| `@githosted/sdk/react` | React hooks (`useRepo`, `useFile`, …) |

## Errors

The SDK throws typed errors you can match on:

```ts
import { Client, NotFoundError, RepoBusyError, StaleHeadError } from "@githosted/sdk";

try {
  await repo.read("missing.txt");
} catch (err) {
  if (err instanceof NotFoundError) { /* … */ }
}
```

`RepoBusyError` and `StaleHeadError` are retryable — `withRetry()` is included for the common backoff loop.

## Documentation

- [Quickstart](https://docs.githosted.dev/welcome/quickstart/)
- [TypeScript SDK reference](https://docs.githosted.dev/sdks/typescript/)
- [HTTP API](https://docs.githosted.dev/reference/http-api/)

## License

MIT.
