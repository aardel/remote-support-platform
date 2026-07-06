// Plain-text tools for the machine config editor's "Open as Text" mode:
// column alignment ("Align Parameters") and a lightweight lint pass
// ("Format Check") for the .mk / pfields.dat formats (INI key=value, pipe,
// and whitespace/tab-separated). Deliberately conservative — only touches
// lines that clearly look like parameter definitions; comments, section
// headers, and anything ambiguous are left untouched.

function classifyLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (/^[/*]/.test(trimmed)) return null; // /* ... */ or ** comment markers
    if (/^;/.test(trimmed)) return null; // ; comment
    if (/^\[.*\]$/.test(trimmed)) return null; // [Section] header
    if (/^[A-Za-z_][\w.]*\s*=/.test(trimmed)) return 'eq';
    if (/^[A-Za-z_][\w.]*\s*\|/.test(trimmed)) return 'pipe';
    if (/^[A-Za-z_][\w.]*(\s{2,}|\t)\S/.test(trimmed)) return 'ws';
    // Continuation line: no key of its own, just an indented bare value
    // immediately followed by a comma/semicolon. Real .mk files use this for
    // multi-line parameter arrays — one keyed line (e.g. MK_TECHNOLOGIEDATEN1)
    // followed by several value-only lines (P761, P762, ... continuing the
    // same array) with nothing but whitespace before the number.
    if (/^-?[\d.]+\s*[,;]/.test(trimmed)) return 'cont';
    return null;
}

// Aligns a block of lines on their first comma or semicolon: the value token
// immediately before the delimiter is right-justified so it — and the
// delimiter right after it — land in the same column on every line (padding
// is inserted as extra leading whitespace before the value, not as a gap
// between the value and the delimiter), and everything after the delimiter
// (typically a trailing comment) starts at a consistent column too. Lines
// with no comma/semicolon are left untouched.
function alignByFirstDelimiter(lines) {
    const parsed = lines.map(l => {
        const m = l.match(/^(.*?)([,;])(.*)$/);
        if (!m) return { hasDelim: false, raw: l };
        const before = m[1];
        const valueMatch = before.match(/(\S+)\s*$/);
        const valueToken = valueMatch ? valueMatch[1] : before.trim();
        const prefix = valueMatch ? before.slice(0, before.length - valueMatch[0].length) : '';
        return { hasDelim: true, prefix, valueToken, delim: m[2], after: m[3] };
    });
    const withDelim = parsed.filter(p => p.hasDelim);
    if (!withDelim.length) return lines.map(l => l);
    const maxLen = Math.max(...withDelim.map(p => p.prefix.length + p.valueToken.length));
    return parsed.map(p => {
        if (!p.hasDelim) return p.raw;
        const trimmedAfter = p.after.replace(/^\s+/, '');
        const gap = Math.max(maxLen - p.prefix.length - p.valueToken.length, 0);
        const padded = p.prefix + ' '.repeat(gap) + p.valueToken + p.delim;
        return trimmedAfter ? `${padded}   ${trimmedAfter}` : padded;
    });
}

function alignBlock(lines, type) {
    if (type === 'pipe') {
        const rows = lines.map(l => ({ indent: l.match(/^\s*/)[0], cols: l.trim().split('|') }));
        const colCount = Math.max(...rows.map(r => r.cols.length));
        const widths = new Array(colCount).fill(0);
        rows.forEach(r => r.cols.forEach((c, i) => { widths[i] = Math.max(widths[i], c.trim().length); }));
        return rows.map(r => r.indent + r.cols.map((c, i) => c.trim().padEnd(i < colCount - 1 ? widths[i] : 0)).join(' | ').replace(/\s+$/, ''));
    }
    // 'eq' and 'ws' both align the same way: find the first comma/semicolon on
    // each line and line those up, regardless of how the key/value portion
    // before it was originally formatted.
    return alignByFirstDelimiter(lines);
}

// Dynamic per-block alignment (max-width-in-block) — used for pfields.dat,
// which has its own layout distinct from .mk (see alignMkParameterLines).
function alignPfieldsParameterLines(text) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r\n|\r|\n/);
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const type = classifyLine(lines[i]);
        if (!type) { out.push(lines[i]); i++; continue; }
        const block = [lines[i]];
        i++;
        let blankRun = 0;
        while (i < lines.length) {
            const nextType = classifyLine(lines[i]);
            if (nextType === type || (nextType === 'cont' && type !== 'pipe')) {
                block.push(lines[i]);
                blankRun = 0;
                i++;
            } else if (!lines[i].trim()) {
                blankRun++;
                if (blankRun > 1) break;
                block.push(lines[i]);
                i++;
            } else break;
        }
        out.push(...alignBlock(block, type));
    }
    return out.join(eol);
}

// .mk-specific alignment, per exact spec measured against a real file: the
// comma/semicolon always lands at a fixed column (counted from the start of
// the line), regardless of neighboring lines — not a per-block computed
// maximum. The value is right-justified so it ends immediately before the
// delimiter, then exactly 4 spaces, then the comment. Applies uniformly to
// every parameter line (keyed or a bare continuation value) — no block
// grouping needed since the target column is constant.
const MK_DELIMITER_COLUMN = 30;

function alignMkLine(line, delimiterColumn) {
    const m = line.match(/^(.*?)([,;])(.*)$/);
    if (!m) return null;
    const before = m[1];
    const delim = m[2];
    const after = m[3];
    const valueMatch = before.match(/(\S+)\s*$/);
    if (!valueMatch) return null;
    const valueToken = valueMatch[1];
    const prefix = before.slice(0, before.length - valueMatch[0].length);
    const gap = Math.max(delimiterColumn - prefix.length - valueToken.length, 0);
    const trimmedAfter = after.replace(/^\s+/, '');
    const padded = prefix + ' '.repeat(gap) + valueToken + delim;
    return trimmedAfter ? `${padded}    ${trimmedAfter}` : padded;
}

function alignMkParameterLines(text) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r\n|\r|\n/);
    let inBlockComment = false;
    const out = lines.map((line) => {
        const trimmed = line.trim();
        if (inBlockComment) {
            if (trimmed.includes('*/')) inBlockComment = false;
            return line;
        }
        if (!trimmed) return line;
        if (/^\/\*/.test(trimmed) && !trimmed.includes('*/')) { inBlockComment = true; return line; }
        if (/^[/*;]/.test(trimmed)) return line; // single-line comment
        if (/^\[.*\]$/.test(trimmed)) return line; // [Section] header
        const aligned = alignMkLine(line, MK_DELIMITER_COLUMN);
        return aligned !== null ? aligned : line;
    });
    return out.join(eol);
}

// fileType: 'mk' uses the fixed-column .mk-specific rule; anything else
// (pfields.dat) keeps the dynamic per-block alignment.
export function alignParameterLines(text, fileType) {
    return fileType === 'mk' ? alignMkParameterLines(text) : alignPfieldsParameterLines(text);
}

// Levenshtein distance, capped — used only to flag near-identical key names
// (a classic typo pattern: editing "LASER_POWER_MAX" but typing
// "LASER_POWER_MAZ" creates a brand new, silently-ignored parameter instead
// of changing the real one).
function levenshtein(a, b, cap = 3) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
    for (let j = 0; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            dp[i][j] = a[i - 1] === b[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
        }
    }
    return dp[a.length][b.length];
}

function extractKey(line, type) {
    const trimmed = line.trim();
    if (type === 'eq') return trimmed.slice(0, trimmed.indexOf('=')).trim();
    if (type === 'pipe') return trimmed.slice(0, trimmed.indexOf('|')).trim();
    if (type === 'ws') { const m = trimmed.match(/^(\S+)/); return m ? m[1] : ''; }
    return '';
}

// Returns a list of { line, severity: 'warning'|'error', message }, most
// important first-ish. This is a lint pass, not a fixer — the technician
// reviews and edits manually.
export function formatCheck(text) {
    const lines = text.split(/\r\n|\r|\n/);
    const issues = [];
    const keyOccurrences = new Map(); // key -> [lineNumbers]
    let blockCommentDepth = 0;

    lines.forEach((line, idx) => {
        const lineNo = idx + 1;
        const trimmed = line.trim();

        // Track /* ... */ balance (can span multiple lines in these files).
        const opens = (trimmed.match(/\/\*/g) || []).length;
        const closes = (trimmed.match(/\*\//g) || []).length;
        blockCommentDepth += opens - closes;

        const type = classifyLine(line);
        if (!type) return;

        const key = extractKey(line, type);
        if (key) {
            if (!keyOccurrences.has(key)) keyOccurrences.set(key, []);
            keyOccurrences.get(key).push(lineNo);
        }

        // Empty value after the delimiter.
        if (type === 'eq' && /=\s*(;.*)?$/.test(trimmed)) {
            issues.push({ line: lineNo, severity: 'warning', message: `${key}: no value after "="` });
        }
        if (type === 'pipe') {
            const cols = trimmed.split('|');
            if (cols.length > 1 && !cols[1].trim()) {
                issues.push({ line: lineNo, severity: 'warning', message: `${key}: empty value in the first pipe field` });
            }
        }
    });

    if (blockCommentDepth !== 0) {
        issues.push({
            line: null, severity: 'error',
            message: `Unbalanced /* */ comment block (${blockCommentDepth > 0 ? 'missing a closing */' : 'extra unmatched */'}) — this can accidentally comment out real parameters`
        });
    }

    // Duplicate keys.
    for (const [key, lineNos] of keyOccurrences) {
        if (lineNos.length > 1) {
            issues.push({ line: lineNos[lineNos.length - 1], severity: 'error', message: `${key} is defined ${lineNos.length} times (lines ${lineNos.join(', ')}) — only one will take effect` });
        }
    }

    // Near-identical key names (likely typo of an existing key).
    const keys = Array.from(keyOccurrences.keys()).filter(k => k.length >= 5);
    for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
            if (keys[i] === keys[j]) continue;
            const dist = levenshtein(keys[i], keys[j]);
            if (dist > 0 && dist <= 2) {
                const line = keyOccurrences.get(keys[j])[0];
                issues.push({ line, severity: 'warning', message: `"${keys[j]}" looks very similar to "${keys[i]}" — possible typo creating a new, unused parameter instead of editing the existing one` });
            }
        }
    }

    return issues.sort((a, b) => (a.line || 0) - (b.line || 0));
}

// Parses a config file's recognized parameter lines (eq/pipe/ws — same
// classification as align/format-check) into key -> value. Used for file
// comparison, where two files' parameters need to line up by key rather than
// by line number (they may be in a different order, or come from entirely
// different machines).
// Strips ALL whitespace — makes comparison immune to purely cosmetic
// reformatting (e.g. Align Parameters padding before a semicolon/comma so
// delimiters line up: "1;" vs "1   ;" must compare equal). Safe for this
// format since values are numeric/short tokens, not free text where
// whitespace could be meaningful.
function normalizeValue(v) {
    return String(v || '').replace(/\s+/g, '');
}

function parseKeyValueMap(text) {
    const map = new Map();
    text.split(/\r\n|\r|\n/).forEach(line => {
        const type = classifyLine(line);
        if (!type) return;
        const trimmed = line.trim();
        let key, value;
        if (type === 'eq') {
            const idx = trimmed.indexOf('=');
            key = trimmed.slice(0, idx).trim();
            value = trimmed.slice(idx + 1);
        } else if (type === 'pipe') {
            const idx = trimmed.indexOf('|');
            key = trimmed.slice(0, idx).trim();
            value = trimmed.slice(idx + 1);
        } else {
            const m = trimmed.match(/^(\S+)(\s{2,}|\t)(.*)$/);
            key = m ? m[1] : trimmed;
            value = m ? m[3] : '';
        }
        if (key) map.set(key, normalizeValue(value));
    });
    return map;
}

// Compares two config files by key (not line position). Returns only the
// differences: keys with a different value in each, plus keys present in
// only one side — anything identical in both is omitted entirely.
export function compareConfigs(textA, textB) {
    const mapA = parseKeyValueMap(textA);
    const mapB = parseKeyValueMap(textB);
    const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
    const rows = [];
    for (const key of allKeys) {
        const hasA = mapA.has(key);
        const hasB = mapB.has(key);
        const valueA = mapA.get(key);
        const valueB = mapB.get(key);
        if (hasA && hasB && valueA === valueB) continue; // identical — not a difference
        rows.push({
            key,
            valueA: hasA ? valueA : null,
            valueB: hasB ? valueB : null,
            status: !hasA ? 'onlyB' : !hasB ? 'onlyA' : 'different'
        });
    }
    return rows.sort((a, b) => a.key.localeCompare(b.key));
}

// Appends new lines under a `; <header>` trailer at the end of a file,
// preserving any prior entries already there (so repeated saves accumulate a
// running log instead of overwriting it) and adding the header only once.
function appendTrailer(content, header, newLines) {
    const marker = `; ${header}`;
    let priorLines = [];
    let base = content;
    const idx = content.indexOf(marker);
    if (idx !== -1) {
        priorLines = content.slice(idx).split(/\r\n|\r|\n/).slice(1).filter(l => l.trim());
        base = content.slice(0, idx);
    }
    const trimmedBase = base.replace(/[\r\n]+$/, '');
    const block = [marker, ...priorLines, ...newLines].join('\r\n');
    return `${trimmedBase}\r\n\r\n${block}\r\n`;
}

// Appends a "Parameter Change History" trailer to the LIVE file being edited —
// the exact same header and entry format (`; [timestamp] KEY old -> new`) the
// built-in editors already use via their own "Append changes as comments"
// checkbox, applied centrally here instead so it happens consistently
// regardless of which editing mode was used (structured, plain text, or a
// restore — none of which otherwise share a single save path).
export function appendParameterChangeHistory(content, changes) {
    if (!changes || !changes.length) return content;
    const timestamp = new Date().toISOString();
    const newLines = changes.map(c => `; [${timestamp}] ${c.key || `line ${c.line}`} ${c.oldValue || '(empty)'} -> ${c.newValue || '(empty)'}`);
    return appendTrailer(content, 'Parameter Change History', newLines);
}
