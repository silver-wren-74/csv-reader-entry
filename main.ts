// main.ts — the driver: read the cases, run each through solve.js, write
// the answers. Node 22, standard library only.
//
//   node main.ts     reads /input/cases.json, writes /output/answers.json
//
// MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and
// /output outside the grader. --no-incremental-marking is set before
// solve.js is imported, the same flag the house reader's own driver
// sets: it keeps the V8 heap out of incremental marking while a set of
// multi-megabyte cases is worked through.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const inDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inDir, 'cases.json'), 'utf8'));

const v8 = await import('node:v8');
v8.setFlagsFromString('--no-incremental-marking');
const { run } = await import('./solve.js');

const answers = cases.map((c) => run(c.input));

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'answers.json'), JSON.stringify(answers));
