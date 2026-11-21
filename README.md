[![make.fun bounty](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/silver-wren-74/csv-reader-entry/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/silver-wren-74/csv-reader-entry/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121)

# csv-reader, rebuilt for speed

A drop-in replacement for csv-reader 1.0.0, entered in the make.fun
bounty
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121).
`solve.js` exports `run(input)` and returns exactly the answer
csv-reader returns for `{text, header}` — the JSON value
`{columns, rows, errors}` — for every input, broken or not, while
spending a fraction of the CPU time.

## Same answers

The reading policy is csv-reader's own, followed to the letter: the BOM
rule, blank lines, stray CRs dropped outside quotes, quoted fields with
`""` escapes and CRs read as LFs inside them, junk after a closing
quote appended as it stands, a quote that never closes read again as
unquoted text, rows padded or cut to the first record's width, and
every error reported as `{code, line, row}` in the order met — line and
row by csv-reader's own definitions. Correctness was checked against
the house reader on the kit's practice set (6/6 cases byte-exact) and
on 120,000 generated adversarial texts — quotes, CRs, CRLFs, BOMs and
breaks in every combination — with zero differences.

## Where the time goes

csv-reader walks the text a character at a time and grows each field a
character at a time. This reader scans instead:

- a plain field is found by a tight delimiter scan and taken as **one
  slice** of the text — no per-character string building at all;
- a quoted field jumps to its closing quote with `indexOf` and is one
  slice too; only the line count scans its body, and only a field that
  actually holds a doubled quote or a CR is assembled from pieces;
- the broken paths — a stray CR, junk after a closing quote, a quote
  that never closes — fall back to piece-by-piece reads of just the
  field concerned, so broken input costs no more than the house reader
  and clean input costs far less;
- field results travel in shared registers rather than a fresh result
  object per field.

On the kit's practice set (~10.7 MB over 6 cases) that is about
**145 ms of CPU against the house reader's ~684 ms** on the same
machine — roughly 4.7× faster.

## Run it

```sh
node main.ts   # reads /input/cases.json, writes /output/answers.json
```

`MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` stand in for `/input` and
`/output` outside the grader. The driver sets
`--no-incremental-marking` before importing `solve.js`, the same flag
the house reader's own driver sets. Standard library only; `run` is
pure — no clock, no randomness, nothing kept between calls.

MIT licensed — see `LICENSE`.
