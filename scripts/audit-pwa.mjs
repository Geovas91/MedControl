import { existsSync, readFileSync } from "node:fs";

const failures = [];
const requiredFiles = [
  "app/manifest.ts",
  "public/sw.js",
  "components/pwa/service-worker-registration.tsx",
  "components/pwa/install-app-button.tsx",
  "public/icons/clinicontrol-192.png",
  "public/icons/clinicontrol-512.png",
  "public/icons/clinicontrol-maskable-512.png",
  "public/icons/apple-touch-icon.png"
];

for (const path of requiredFiles) {
  if (!existsSync(path)) failures.push(`${path}: required PWA file is missing`);
}

function source(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

const manifest = source("app/manifest.ts");
for (const requirement of ["start_url: \"/dashboard\"", "display: \"standalone\"", "#F4F7F9", "#0F766E", "purpose: \"maskable\""]) {
  if (!manifest.includes(requirement)) failures.push(`app/manifest.ts: missing ${requirement}`);
}

const worker = source("public/sw.js");
for (const requirement of ["const CACHE_NAME", "request.method !== \"GET\"", "request.headers.has(\"authorization\")", "request.headers.has(\"cookie\")", "url.search", "response.type === \"basic\"", "!response.headers.has(\"set-cookie\")", "caches.delete", "clients.claim"]) {
  if (!worker.includes(requirement)) failures.push(`public/sw.js: missing cache safety guard ${requirement}`);
}

const precache = worker.match(/const STATIC_ASSETS\s*=\s*\[([\s\S]*?)\];/);
if (!precache) failures.push("public/sw.js: static precache list is missing");
else {
  for (const forbidden of ["/dashboard", "/patients", "/appointments", "/payments", "/medical-notes", "/members", "/invite", "/consent/sign", "/auth", "/api", "supabase", "token"]) {
    if (precache[1].toLowerCase().includes(forbidden)) failures.push(`public/sw.js: forbidden precache entry ${forbidden}`);
  }
}

const registration = source("components/pwa/service-worker-registration.tsx");
for (const requirement of ["NEXT_PUBLIC_PWA_ENABLED", "navigator.serviceWorker.register(\"/sw.js\"", "getRegistration(\"/\")", "window.addEventListener(\"load\""]) {
  if (!registration.includes(requirement)) failures.push(`service-worker-registration.tsx: missing ${requirement}`);
}

const installButton = source("components/pwa/install-app-button.tsx");
for (const requirement of ["beforeinstallprompt", "appinstalled", "Instalar CliniControl", "display-mode: standalone"]) {
  if (!installButton.includes(requirement)) failures.push(`install-app-button.tsx: missing ${requirement}`);
}

for (const icon of requiredFiles.filter((path) => path.endsWith(".png"))) {
  if (!existsSync(icon)) continue;
  const signature = readFileSync(icon).subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") failures.push(`${icon}: icon must be a PNG`);
}

if (failures.length) {
  console.error("PWA audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PWA audit passed: manifest, icons, registration and static-only cache policy are present.");
