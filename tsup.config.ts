import { defineConfig } from "tsup";

export default defineConfig([
  // Browser entrypoint
  {
    entry: { index: "src/index.ts" },
    outDir: "dist/browser",
    format: ["esm"],
    dts: true,
    sourcemap: true,
    platform: "browser",
    external: ["react", "@tanstack/react-query"],
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  },
  // Node.js entrypoint
  {
    entry: { index: "src/index.ts" },
    outDir: "dist/node",
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    platform: "node",
    external: ["react", "@tanstack/react-query"],
  },
  // Proto re-exports entrypoint (raw service descriptors + types)
  {
    entry: { index: "src/proto.ts" },
    outDir: "dist/proto",
    format: ["esm"],
    dts: true,
    sourcemap: true,
    platform: "browser",
    external: [
      "@connectrpc/connect",
      "@connectrpc/connect-web",
      "@bufbuild/protobuf",
    ],
  },
  // React entrypoint
  {
    entry: { index: "src/react/index.ts" },
    outDir: "dist/react",
    format: ["esm"],
    dts: true,
    sourcemap: true,
    platform: "browser",
    external: [
      "react",
      "@tanstack/react-query",
      "@connectrpc/connect",
      "@connectrpc/connect-web",
      "@bufbuild/protobuf",
    ],
  },
]);
