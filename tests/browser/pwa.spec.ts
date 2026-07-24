import { expect, test } from "@playwright/test";

const runPwaTests = process.env.PWA_TEST_MODE === "true";

test.describe("PWA production installation", () => {
  test.skip(!runPwaTests, "Run with npm run test:pwa after a PWA-enabled production build.");

  test("manifest, icons, and service worker are served safely", async ({ page, request }) => {
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.status()).toBe(200);
    expect(manifestResponse.headers()["content-type"]).toContain("application/manifest+json");
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({ name: "CliniControl", short_name: "CliniControl", start_url: "/dashboard", display: "standalone", background_color: "#F4F7F9", theme_color: "#0F766E" });
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: "/icons/clinicontrol-192.png", sizes: "192x192" }),
      expect.objectContaining({ src: "/icons/clinicontrol-512.png", sizes: "512x512" }),
      expect.objectContaining({ src: "/icons/clinicontrol-maskable-512.png", purpose: "maskable" })
    ]));
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);

    const workerResponse = await request.get("/sw.js");
    expect(workerResponse.status()).toBe(200);
    expect(workerResponse.headers()["content-type"]).toContain("javascript");
    expect(workerResponse.headers()["cache-control"]).toContain("no-cache");

    const errors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto("/");
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toBe("http://localhost:3100/");
    const cachedPaths = await page.evaluate(async () => {
      const cacheNames = await caches.keys();
      const requests = await Promise.all(cacheNames.map(async (name) => (await caches.open(name)).keys()));
      return requests.flat().map((request) => new URL(request.url).pathname);
    });
    expect(cachedPaths).not.toEqual(expect.arrayContaining([expect.stringMatching(/^\/(?:dashboard|admin|api|invite|consent\/sign)/)]));
    expect(cachedPaths).toContain("/offline");
    expect(errors).toEqual([]);
  });

  test("install control only appears for a supported installation event", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Instalar CliniControl" })).toHaveCount(0);
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.defineProperties(event, {
        prompt: { value: async () => undefined },
        userChoice: { value: Promise.resolve({ outcome: "dismissed" }) }
      });
      window.dispatchEvent(event);
    });
    await page.getByRole("button", { name: "Instalar CliniControl" }).click();
    await expect(page.getByRole("button", { name: "Instalar CliniControl" })).toHaveCount(0);
  });

  test("standalone and appinstalled states hide the install control", async ({ browser }) => {
    const standaloneContext = await browser.newContext();
    await standaloneContext.addInitScript(() => {
      const original = window.matchMedia;
      window.matchMedia = (query: string) => query === "(display-mode: standalone)" ? ({ matches: true, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } } as MediaQueryList) : original(query);
    });
    const standalonePage = await standaloneContext.newPage();
    await standalonePage.goto("/");
    await expect(standalonePage.getByRole("button", { name: "Instalar CliniControl" })).toHaveCount(0);
    await standaloneContext.close();

    const page = await browser.newPage();
    await page.goto("/");
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.defineProperties(event, { prompt: { value: async () => undefined }, userChoice: { value: Promise.resolve({ outcome: "dismissed" }) } });
      window.dispatchEvent(event);
      window.dispatchEvent(new Event("appinstalled"));
    });
    await expect(page.getByRole("button", { name: "Instalar CliniControl" })).toHaveCount(0);
    await page.context().close();
  });
});
