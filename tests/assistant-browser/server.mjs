import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { webpack } = require('next/dist/compiled/webpack/webpack');
const root = process.cwd();
const output = mkdtempSync(path.join(tmpdir(), 'clinicontrol-assistant-browser-'));
const mock = path.join(root, 'tests/assistant-browser/boundaries.ts');
const compiler = webpack({
  mode: 'development', target: 'web', devtool: false,
  entry: path.join(root, 'tests/assistant-browser/entry.tsx'),
  output: { path: output, filename: 'bundle.js' },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@/app/dashboard/bot/actions$': path.join(root, 'tests/assistant-browser/actions.ts'),
      '@/app/dashboard/patients/new/actions$': path.join(root, 'tests/assistant-browser/patient-actions.ts'),
      '@/app/dashboard/patients/[id]/edit/actions$': path.join(root, 'tests/assistant-browser/patient-actions.ts'),
      '@/lib/assistant/tools/registry$': mock,
      '@/lib/server/patients$': mock,
      '@/lib/server/appointment-assistant$': mock,
      '@/lib/assistant/llm/provider$': mock,
      '@/lib/dashboard/timezone$': mock,
      '@/lib/logger$': mock,
      'next/cache$': mock, 'next/navigation$': mock,
      '@': root
    }
  },
  module: { rules: [{ test: /\.tsx?$/, exclude: /node_modules/, use: path.join(root, 'tests/assistant-browser/transpile.cjs') }] },
  plugins: [new webpack.DefinePlugin({
    // Literal test configuration only; never copy the host process environment.
    'process.env': JSON.stringify({ NODE_ENV: 'development', APPOINTMENT_ASSISTANT_LLM_ENABLED: 'false', APPOINTMENT_ASSISTANT_LLM_READ_TOOLS_ENABLED: 'false', APPOINTMENT_ASSISTANT_CONTEXT_TTL_SECONDS: '900' })
  })]
});
try {
  await new Promise((resolve, reject) => compiler.run((error, stats) => {
    if (error || stats.hasErrors()) reject(new Error(error?.message ?? stats.toString({ all: false, errors: true })));
    else {
      const modules = [...stats.compilation.modules].map(module => (module.resource ?? '').replaceAll('\\', '/'));
      if (modules.some(resource => /\/lib\/(?:server|supabase)\/|\/lib\/assistant\/(?:tools\/registry|llm\/provider)\.ts$/.test(resource))) {
        reject(new Error('A real protected service leaked into the isolated browser bundle'));
      } else resolve();
    }
  }));
  await new Promise((resolve, reject) => compiler.close((error) => error ? reject(error) : resolve()));
  const bundle = readFileSync(path.join(output, 'bundle.js'));
  const html = '<!doctype html><html lang="es"><meta charset="utf-8"><title>Isolated Assistant QA</title><div id="root"></div><script src="/bundle.js"></script></html>';
  createServer((request, response) => {
    response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'none'");
    if (request.url === '/bundle.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle); }
    else if (request.url === '/' || /^\/dashboard\/(?:bot|patients\/new|patients\/[a-f0-9-]+(?:\/edit)?)(?:\?.*)?$/.test(request.url)) { response.setHeader('Content-Type', 'text/html'); response.end(html); }
    else { response.statusCode = 404; response.end(); }
  }).listen(3117, '127.0.0.1', () => console.log('Isolated assistant harness ready on 127.0.0.1:3117'));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  // Exact directory created above in OS temp; no repository or user paths accepted.
  rmSync(output, { recursive: true, force: true });
}
