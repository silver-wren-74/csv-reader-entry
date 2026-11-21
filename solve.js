// solve.js — a fast drop-in replacement for csv-reader 1.0.0: run(input)
// returns exactly the answer csv-reader returns for {text, header}, the
// JSON value {columns, rows, errors}, for every input, broken or not.
//
// The reading policy is csv-reader's own, followed to the letter:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is
//     no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled ("" inside it is one quote, and each CRLF or lone CR inside
//     it is read as LF); what follows its closing quote, up to the next
//     comma or line break, is appended as it stands (quote_junk, when
//     anything was appended); a quote that never closes is a literal
//     character and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields
//     stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows
//     holds the records after it, each padded with "" (short_row) or cut
//     (long_row) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record
//     starts on (every LF, CRLF and lone CR inside quotes counted), row
//     its record's index in rows, null for the header, in the order met.
//
// Where csv-reader walks a character at a time and grows each field a
// character at a time, this reader scans: plain fields are found with a
// tight delimiter scan and taken as one slice of the text; quoted fields
// jump from quote to quote with indexOf and are only assembled from
// pieces when they hold a doubled quote or a CR. The broken paths —
// stray CRs, junk after a closing quote, a quote that never closes —
// fall back to piece-by-piece reads of just the field concerned, so the
// common unbroken field costs one scan and one slice.
//
// Pure: no clock, no randomness, nothing kept from one call to the next.

const AT_COMMA = 0;
const AT_BREAK = 1;
const AT_END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows
  // it takes (null while the header is still to come).
  let recordLine = 1;
  let recordRow = null;

  // The field last read, in registers so a plain field allocates nothing.
  let fVal = '';
  let fEnd = AT_END;
  let fAdded = 0; // characters the last unquoted read kept (for quote_junk)

  function err(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Sets pos and fEnd for a field whose text runs up to index i, where
  // text[i] is a comma, an LF, a CR of a CRLF, or i is the end of text.
  function finishField(i) {
    if (i >= n) {
      pos = n;
      fEnd = AT_END;
      return;
    }
    const c = text.charCodeAt(i);
    if (c === 44) {
      pos = i + 1;
      fEnd = AT_COMMA;
    } else if (c === 10) {
      pos = i + 1;
      line += 1;
      fEnd = AT_BREAK;
    } else {
      pos = i + 2;
      line += 1;
      fEnd = AT_BREAK;
    }
  }

  // Reads unquoted text onto prefix, up to the next comma or line break.
  // The fast path takes the whole field as one slice; a stray CR (one
  // not followed by LF) drops into the pieces path for this field only.
  function readUnquoted(prefix) {
    const start = pos;
    let i = pos;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 44 || c === 10) break;
      if (c === 13) {
        if (text.charCodeAt(i + 1) === 10) break;
        readUnquotedPieces(prefix, start, i);
        return;
      }
      i += 1;
    }
    fAdded = i - start;
    fVal = prefix === '' ? text.slice(start, i) : prefix + text.slice(start, i);
    finishField(i);
  }

  // The unquoted read, piece by piece, once a stray CR has been met:
  // each CR not followed by LF is dropped with a stray_cr error, and the
  // field is the slices between the dropped CRs joined together.
  function readUnquotedPieces(prefix, start, i) {
    const pieces = [];
    if (prefix !== '') pieces.push(prefix);
    if (i > start) pieces.push(text.slice(start, i));
    let added = i - start;
    err('stray_cr');
    i += 1;
    let seg = i;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 44 || c === 10) break;
      if (c === 13) {
        if (text.charCodeAt(i + 1) === 10) break;
        if (i > seg) {
          pieces.push(text.slice(seg, i));
          added += i - seg;
        }
        err('stray_cr');
        i += 1;
        seg = i;
        continue;
      }
      i += 1;
    }
    if (i > seg) {
      pieces.push(text.slice(seg, i));
      added += i - seg;
    }
    fAdded = added;
    fVal = pieces.join('');
    finishField(i);
  }

  // A quote that never closes is a literal character, and the text after
  // it is read again as unquoted, from just past the opening quote, with
  // the line count rewound to the line the quote opened on.
  function unterminated(open, openLine) {
    pos = open + 1;
    line = openLine;
    err('unterminated_quote');
    readUnquoted('"');
  }

  // What follows a closing quote at index j: a comma, a line break, the
  // end of the text, or junk that is appended as it stands by an unquoted
  // read (whose own stray CRs are reported before the quote_junk).
  function afterQuote(j) {
    const p = j + 1;
    if (p >= n) {
      pos = n;
      fEnd = AT_END;
      return;
    }
    const c = text.charCodeAt(p);
    if (c === 44) {
      pos = p + 1;
      fEnd = AT_COMMA;
      return;
    }
    if (c === 10) {
      pos = p + 1;
      line += 1;
      fEnd = AT_BREAK;
      return;
    }
    if (c === 13 && text.charCodeAt(p + 1) === 10) {
      pos = p + 2;
      line += 1;
      fEnd = AT_BREAK;
      return;
    }
    pos = p;
    readUnquoted(fVal);
    if (fAdded > 0) err('quote_junk');
  }

  // A quoted field whose body holds a doubled quote or a CR: assemble it
  // from slices between the special characters. A CR or a CRLF inside
  // quotes is read as one LF and counts as one line.
  function readQuotedPieces(open, openLine) {
    const pieces = [];
    let seg = open + 1;
    let i = open + 1;
    let closedAt = -1;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 34) {
        if (text.charCodeAt(i + 1) === 34) {
          if (i > seg) pieces.push(text.slice(seg, i));
          pieces.push('"');
          i += 2;
          seg = i;
          continue;
        }
        closedAt = i;
        break;
      }
      if (c === 13) {
        if (i > seg) pieces.push(text.slice(seg, i));
        pieces.push('\n');
        line += 1;
        i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
        seg = i;
        continue;
      }
      if (c === 10) line += 1;
      i += 1;
    }
    if (closedAt === -1) {
      unterminated(open, openLine);
      return;
    }
    if (closedAt > seg) pieces.push(text.slice(seg, closedAt));
    fVal = pieces.join('');
    afterQuote(closedAt);
  }

  // Reads a quoted field whose opening quote is at pos. The common case
  // — no doubled quote and no CR inside — is one indexOf for the closing
  // quote and one slice for the value; the LF count for the line tally
  // is the only scan of the body.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    const j = text.indexOf('"', open + 1);
    if (j === -1) {
      unterminated(open, openLine);
      return;
    }
    if (text.charCodeAt(j + 1) === 34) {
      readQuotedPieces(open, openLine);
      return;
    }
    const cr = text.indexOf('\r', open + 1);
    if (cr !== -1 && cr < j) {
      readQuotedPieces(open, openLine);
      return;
    }
    let k = open + 1;
    while (k < j) {
      const m = text.indexOf('\n', k);
      if (m === -1 || m >= j) break;
      line += 1;
      k = m + 1;
    }
    fVal = text.slice(open + 1, j);
    afterQuote(j);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    do {
      lastQuoted = pos < n && text.charCodeAt(pos) === 34;
      if (lastQuoted) readQuoted();
      else readUnquoted('');
      fields.push(fVal);
    } while (fEnd === AT_COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
