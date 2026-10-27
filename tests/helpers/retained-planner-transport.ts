import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as contracts from '../../lib/assistant/llm/contracts.ts';
import * as types from '../../lib/assistant/llm/types.ts';
import type { requestOpenAiPlanner as Transport } from '../../lib/assistant/llm/transport.ts';

// Preserve schema/error coverage of the dormant implementation with a synthetic
// fetcher. This VM-only fixture is never imported by application code.
const exports: Record<string, unknown> = {};
runInNewContext(ts.transpileModule(readFileSync('lib/assistant/llm/transport.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText, { exports, AbortSignal, DOMException, Date, require(name: string) {
  if (name === './contracts') return contracts;
  if (name === './types') return types;
  if (name === '@/lib/release-boundary') return { releaseAllows: () => true };
  throw new Error('Unexpected retained transport dependency');
} });
export const requestOpenAiPlanner = exports.requestOpenAiPlanner as typeof Transport;
