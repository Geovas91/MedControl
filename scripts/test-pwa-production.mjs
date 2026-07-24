import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (process.env.NEXT_PUBLIC_PWA_ENABLED !== "true") {
  console.error("Set NEXT_PUBLIC_PWA_ENABLED=true, run npm run build, then run npm run test:pwa.");
  process.exit(1);
}

if (!existsSync(".next/BUILD_ID")) {
  console.error("A production build is required. Run npm run build before npm run test:pwa.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [process.env.npm_execpath, "exec", "playwright", "test", "tests/browser/pwa.spec.ts"], {
  stdio: "inherit",
  env: { ...process.env, PLAYWRIGHT_WEB_SERVER: "production", PWA_TEST_MODE: "true" }
});

process.exit(result.status ?? 1);
