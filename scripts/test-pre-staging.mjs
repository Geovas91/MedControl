import { spawnSync } from "node:child_process";

const checks = ["audit:ui", "audit:server-only", "audit:brand", "test:invitation-email"];
for (const check of checks) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, "run", check], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Pre-staging static checks passed.");
