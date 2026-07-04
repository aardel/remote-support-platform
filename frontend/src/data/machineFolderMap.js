// Install-folder -> .mk filename mapping, per Lasercomb's internal reference
// table. Used to auto-detect which config file to open under
// C:\lasercomb\<install-folder>\cfg\ once a technician opens the machine
// parameter editor for a session. Falls back to manual file browsing when no
// pattern matches, is ambiguous, or the folder isn't MkEditor-compatible.
//
// `mk` may be a fixed string, or a function(folderName, digits) -> string for
// patterns with a numeric placeholder (####). `editor: null` marks folders
// that use a different control system entirely (Eckelmann) — not MkEditor.
export const FOLDER_MAP = [
  { pattern: /^CLS(\d{3,4})-Rofin$/i, mk: (_, d) => `cls${d}.mk`, editor: 'mk', label: 'CLS####-Rofin' },
  { pattern: /^CLS(\d{3,4})$/i, mk: (_, d) => `cls${d}.mk`, editor: 'mk', label: 'CLS#### (no suffix)' },
  { pattern: /^PTSNeo-Rofin$/i, mk: 'ptsneo.mk', editor: 'mk', label: 'PTSNeo-Rofin' },
  { pattern: /^PTS3020R-Rofin$/i, mk: 'pts3020r.mk', editor: 'mk', label: 'PTS3020R-Rofin' },
  { pattern: /^MTL(\d{3,4})-Rofin$/i, mk: (_, d) => `mtl${d}.mk`, editor: 'mk', label: 'MTL####-Rofin' },
  { pattern: /^ProRot3000-Rofin$/i, mk: 'prorot.mk', editor: 'mk', label: 'ProRot3000-Rofin' },
  { pattern: /^ProCount1712$/i, mk: 'procount_1712.mk', editor: 'mk', label: 'ProCount1712' },
  { pattern: /^HSP(\d{3,4})?$/i, mk: 'Hsp.mk', editor: 'mk', label: 'HSP, HSP#### (case varies)' },
  { pattern: /^CRUW$/i, mk: null, editor: 'mk', label: 'CRUW (model-specific — cannot guess filename)' },
  { pattern: /^(DigiSetter|Setter)$/i, mk: 'setter.mk', editor: 'mk', label: 'Setter, DigiSetter' },
  { pattern: /^Lasercmb$|^Lasercomb$/i, mk: null, editor: 'mk', label: 'Lasercmb, Lasercomb (.mk is in a child folder, not directly in cfg\\)' },
  { pattern: /^ProDigi(Neo)?$/i, mk: null, editor: null, label: 'ProDigi, ProDigiNeo — Eckelmann control system, not MkEditor' },
];

// Try to match an install folder name (e.g. "CLS2115-Rofin") against the table.
// Returns { entry, digits, expectedFilename } or null if nothing matches.
export function matchInstallFolder(folderName) {
  const name = (folderName || '').trim();
  for (const entry of FOLDER_MAP) {
    const m = name.match(entry.pattern);
    if (!m) continue;
    const digits = m[1] || null;
    const expectedFilename = typeof entry.mk === 'function' ? entry.mk(name, digits) : entry.mk;
    return { entry, digits, expectedFilename };
  }
  return null;
}

// Heuristic: does this .mk filename look like a backup/copy rather than the
// live, in-use config file? Used to deprioritize (not hide) candidates when
// more than one .mk file is present in cfg\.
export function looksLikeBackupFile(filename) {
  const n = (filename || '').toLowerCase();
  return /backup|_bak\b|\.bak$|copy|\bold\b|\d{4}-\d{2}-\d{2}|~$/.test(n);
}

// pfields.dat has a fixed name — no model-dependent guessing needed, just
// look for this exact filename (case-insensitive) inside cfg\.
export const PFIELDS_FILENAME = 'pfields.dat';
