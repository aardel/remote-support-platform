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
    return null;
}

function alignBlock(lines, type) {
    if (type === 'eq') {
        const parsed = lines.map(l => {
            const idx = l.indexOf('=');
            return { indent: l.match(/^\s*/)[0], key: l.slice(0, idx).trim(), rest: l.slice(idx + 1) };
        });
        const maxKey = Math.max(...parsed.map(p => p.key.length));
        return parsed.map(p => `${p.indent}${p.key.padEnd(maxKey)} =${p.rest}`);
    }
    if (type === 'pipe') {
        const rows = lines.map(l => ({ indent: l.match(/^\s*/)[0], cols: l.trim().split('|') }));
        const colCount = Math.max(...rows.map(r => r.cols.length));
        const widths = new Array(colCount).fill(0);
        rows.forEach(r => r.cols.forEach((c, i) => { widths[i] = Math.max(widths[i], c.trim().length); }));
        return rows.map(r => r.indent + r.cols.map((c, i) => c.trim().padEnd(i < colCount - 1 ? widths[i] : 0)).join(' | ').replace(/\s+$/, ''));
    }
    if (type === 'ws') {
        const parsed = lines.map(l => {
            const m = l.match(/^(\s*)(\S+)(\s{2,}|\t)(.*)$/);
            return m ? { indent: m[1], key: m[2], rest: m[4] } : { indent: '', key: l.trim(), rest: '' };
        });
        const maxKey = Math.max(...parsed.map(p => p.key.length));
        return parsed.map(p => `${p.indent}${p.key.padEnd(maxKey)}    ${p.rest}`.replace(/\s+$/, m => m.includes('\r') ? m : ''));
    }
    return lines;
}

export function alignParameterLines(text) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r\n|\r|\n/);
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const type = classifyLine(lines[i]);
        if (!type) { out.push(lines[i]); i++; continue; }
        const block = [];
        while (i < lines.length && classifyLine(lines[i]) === type) {
            block.push(lines[i]);
            i++;
        }
        out.push(...alignBlock(block, type));
    }
    return out.join(eol);
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
