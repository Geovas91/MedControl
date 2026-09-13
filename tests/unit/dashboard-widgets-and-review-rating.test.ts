import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("app/dashboard/page.tsx", "utf8");
const statCard = readFileSync("components/dashboard/stat-card.tsx", "utf8");
const rating = readFileSync("components/reviews/star-rating-form.tsx", "utf8");

test("dashboard summary cards navigate to existing tenant-safe views", () => {
  assert.match(statCard, /href\?: string/);
  assert.match(statCard, /return href \? <Link href=\{href\}/);
  assert.match(statCard, /focus-visible:ring-4/);
  assert.match(dashboard, /href="\/dashboard\/patients"/);
  assert.match(dashboard, /href=\{`\/dashboard\/appointments\?date=\$\{data\.localDate\}&period=day`\}/);
  assert.match(dashboard, /href="\/dashboard\/payments\?status=paid"/);
  assert.match(dashboard, /href="\/dashboard\/payments\?status=pending"/);
});

test("review rating previews and fills the selected star range accessibly", () => {
  assert.match(rating, /useState\(0\)/);
  assert.match(rating, /hoveredRating/);
  assert.match(rating, /visibleRating >= rating/);
  assert.match(rating, /onMouseEnter=\{\(\) => setHoveredRating\(rating\)\}/);
  assert.match(rating, /onMouseLeave=\{\(\) => setHoveredRating\(0\)\}/);
  assert.match(rating, /type="radio"/);
  assert.match(rating, /aria-label=\{`\$\{rating\}/);
});
