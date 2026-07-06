/* MkEditor core — Lasercomb .mk machine configuration editor */
(function () {
  'use strict';

  const MM_TO_INCH = 0.0393701;
  const INCH_TO_MM = 25.4;
  const PASSWORD = '456852';

  const PARAM_TYPES = {
    length: { step: 0.0001, units: { mm: 'mm', inch: 'in' } },
    angle: { step: 1, units: { mm: '°', inch: '°' } },
    time: { step: 10, units: { mm: 'ms', inch: 'ms' } },
    speed: { step: 100, units: { mm: 'rpm', inch: 'rpm' } },
    power: { step: 100, units: { mm: 'W', inch: 'W' } },
    voltage: { step: 0.1, units: { mm: 'V', inch: 'V' } },
    none: { step: 1, units: { mm: '-', inch: '-' } }
  };

  // German → English phrase/word substitutions, most-specific first
  const TRANSLATION_RULES = [
    [/MMI[\s-]*[Üü]berwachung[\s-]*Timeoutzeit/gi, 'MMI watchdog timeout'],
    [/Nachlaufzeit\s+(?:f[üu]r\s+)?Scanner-?Absaugung/gi, 'Scanner suction run-down time'],
    [/Nachlaufzeit\s+(?:f[üu]r\s+)?Absaugung/gi, 'Suction run-down time'],
    [/Einschalt-?Verz[öo]gerung\s+Absaugungen/gi, 'Switch-on delay for suctions'],
    [/Einschalt-?Verz[öo]gerung/gi, 'Switch-on delay'],
    [/Ueberbrueckungszeit|[Üü]berbr[üu]ckungszeit/gi, 'Bridging time'],
    [/Toleranzwert\s+[Üü]berstand\s+(?:Duese|D[üu]se)\s+und\s+Schuh/gi, 'Nozzle & shoe overhang tolerance'],
    [/Wartezeit\s+(?:f[üu]r\s+)?Abfrage\s+Schneidgas/gi, 'Wait time for cutting gas check'],
    [/max\.\s+Wartezeit/gi, 'Max. wait time'],
    [/Wartezeit\s+\[ms\]\s+bis\s+Bezugspunktfahren/gi, 'Wait time [ms] until homing'],
    [/Wartezeit\s+(?:bis|nach|f[üu]r)/gi, 'Wait time'],
    [/Wartezeit/gi, 'Wait time'],
    [/automatische[rn]?\s+[Üü]bernahme/gi, 'automatic acceptance'],
    [/Zielposition\s+beim\s+Freifahren\s+(?:od\.|oder)\s+Wechselpos/gi, 'Target pos. for clear travel / change pos.'],
    [/Abstand\s+Laserd[üu]se\s+zu\s+Fu[sß]unterkante/gi, 'Distance: laser nozzle → foot underside'],
    [/Abstand\s+Fokuspunkt\s+zu\s+Fu[sß]unterkante/gi, 'Distance: focus point → foot underside'],
    [/Sichere\s+Z-Achs-H[öo]he/gi, 'Safe Z-axis height'],
    [/Sichere[rns]?\s+Position/gi, 'Safe position'],
    [/Neg\.\s+Softwarelimit/gi, 'Neg. software limit'],
    [/Sicherheitsabstand\s+Y\s+<-->\s+U/gi, 'Safety clearance Y ↔ U'],
    [/Sicherheitsabstand/gi, 'Safety clearance'],
    [/Fokuslagenkorrektur\s+f[üu]r\s+Stahl/gi, 'Focus correction for steel'],
    [/Fokuslagenkorrektur/gi, 'Focus position correction'],
    [/Richtungsabh\w*\s+Korrektur\s+Schnittspalt/gi, 'Direction-dep. kerf correction'],
    [/Schnittspalt/gi, 'kerf'],
    [/max\.\s+Schneidgasdruck/gi, 'Max. cutting gas pressure'],
    [/Schneidgasdruck/gi, 'Cutting gas pressure'],
    [/Schneidgas\s+ok/gi, 'cutting gas OK'],
    [/Schneidgas/gi, 'cutting gas'],
    [/Kv\s+der\s+Z-Achsenregelung/gi, 'Kv of Z-axis controller'],
    [/Z-Offset\s+Rotation/gi, 'Z offset (rotation)'],
    [/A-Offset\s*\(.*?Beladen.*?\)/gi, 'A-axis offset (loading)'],
    [/A-Offset/gi, 'A-axis offset'],
    [/A-Pos-Negativ\s+Entspannen(?:\s+erlaubt)?/gi, 'A-pos neg.: release allowed'],
    [/A-Pos-Positiv\s+Entspannen(?:\s+erlaubt)?/gi, 'A-pos pos.: release allowed'],
    [/X-Offset\s+(?:f[üu]r\s+)?Fr[äa]sen/gi, 'X offset for milling'],
    [/Y-Offset\s+(?:f[üu]r\s+)?Rotation/gi, 'Y offset for rotation'],
    [/Zeitkonstante\s+(?:f[üu]r\s+)?Sp[üu]len/gi, 'Purge time constant'],
    [/Geschwindigkeitsoverride/gi, 'speed override'],
    [/max\.\s+Bahngeschwindigkeit/gi, 'Max. path speed'],
    [/Bahngeschwindigkeit/gi, 'Path speed'],
    [/mu[sß]\s+gleich\s+MK_VBAHNMAX/gi, '(must equal MK_VBAHNMAX)'],
    [/Laserprogrammnummer/gi, 'Laser program number'],
    [/Erweiterung\s+Softwarelimit\s+Y-\./gi, 'Extend neg. Y software limit'],
    [/Erweiterung\s+Softwarelimit\s+Y\+\./gi, 'Extend pos. Y software limit'],
    [/Nachlaufzeit/gi, 'Run-down time'],
    [/Verweilzeit/gi, 'Dwell time'],
    // Motion / control compounds
    [/Schleppabstands?[üu]berwachung/gi, 'Following error monitoring'],
    [/Schleppgenauhalt/gi, 'Following error fine-stop'],
    [/Schleppabstand/gi, 'Following error'],
    [/Schleppz[äa]hler/gi, 'Following error counter'],
    [/Schleppfehler/gi, 'Following error fault'],
    [/Kabelbruch-?[üu]berwachung/gi, 'Cable break monitoring'],
    [/Kabelbruch/gi, 'Cable break'],
    [/Weggebernullimpuls/gi, 'Encoder index pulse'],
    [/Weggeber-?[Ss]chmutzsignal/gi, 'Encoder contamination signal'],
    [/Weggebersignal[e]?/gi, 'Encoder signals'],
    [/Absolutgeber/gi, 'Absolute encoder'],
    [/Synchronabweichung/gi, 'Sync deviation'],
    [/Synchronoffset/gi, 'Sync offset'],
    [/Synchronachse[n]?/gi, 'Sync axis'],
    [/Synchronregelung/gi, 'Sync control'],
    [/Spindelumkehrspiel/gi, 'Spindle backlash'],
    [/Spindeldrehzahl(?:max)?/gi, 'Spindle speed max'],
    [/Spindeldrehzahlmin/gi, 'Spindle speed min'],
    [/Spindeldrehzahl/gi, 'Spindle speed'],
    [/Spindelhandler/gi, 'Spindle handler'],
    [/Getriebestufe/gi, 'Gear stage'],
    [/Linearachse/gi, 'Linear axis'],
    [/Rotationsachse/gi, 'Rotary axis'],
    [/Messachse/gi, 'Encoder axis'],
    [/Gantryachse/gi, 'Gantry axis'],
    [/Mehrkopfachse/gi, 'Multi-head axis'],
    [/Modulo-?360/gi, 'Modulo-360'],
    [/Beschleunigungsvorsteuerung/gi, 'Acceleration feedforward'],
    [/Beschleunigungsbewertung/gi, 'Acceleration weighting'],
    [/Beschleunigungsrampe/gi, 'Acceleration ramp'],
    [/Bremsrampenzeit/gi, 'Braking ramp time'],
    [/Bremsrampe/gi, 'Braking ramp'],
    [/D[äa]mpfungszeitkonstante/gi, 'Damping time constant'],
    [/Filterzeitkonstante/gi, 'Filter time constant'],
    [/Bahnbeschl(?:eunigung)?/gi, 'Path acceleration'],
    [/Bahnfehler/gi, 'Path error'],
    [/Achsgeschwindigkeit/gi, 'Axis speed'],
    [/modale\s+Achsgeschwindigkeit/gi, 'Modal axis speed'],
    [/Grobinterpolationstakt/gi, 'Coarse interpolation cycle'],
    [/Feininterpolationstakt/gi, 'Fine interpolation cycle'],
    [/Grobinterpolation/gi, 'Coarse interpolation'],
    [/Feininterpolation/gi, 'Fine interpolation'],
    [/Interpolationstakt/gi, 'Interpolation cycle'],
    [/[Üü]bergangswinkel/gi, 'Transition angle'],
    [/Grenzwinkel/gi, 'Limit angle'],
    [/Eingabeaufl[öo]sung|Eingabeaufloesung/gi, 'Input resolution'],
    [/Maschinenkonstante[n]?/gi, 'Machine parameter'],
    [/Maschinennullpunkt/gi, 'Machine origin'],
    [/Maschinenkoordinatensystem/gi, 'Machine coord. system'],
    [/Werkst[üu]ckkoordinatensystem/gi, 'Workpiece coord. system'],
    [/Grundoffset/gi, 'Base offset'],
    [/Nullpunktverschiebung/gi, 'Zero point shift'],
    [/Referenzpunktfahrt?/gi, 'Homing'],
    [/Referenznocken/gi, 'Reference cam'],
    [/Handradfunktion/gi, 'Handwheel function'],
    [/Handradfaktor/gi, 'Handwheel factor'],
    [/Handradfilter/gi, 'Handwheel filter'],
    [/Mas[ss]stab/gi, 'Scale factor'],
    [/Sprachauswahl/gi, 'Language selection'],
    [/Nachkommastellen/gi, 'Decimal places'],
    [/Vorlaufpuffer/gi, 'Lookahead buffer'],
    [/Vorlauftiefe/gi, 'Lookahead depth'],
    [/R[üu]cklaufgrenze/gi, 'Retrace limit'],
    [/Vorbesetzen/gi, 'Pre-assign'],
    [/[Üü]berbr[üu]ckung|Ueberbrueckung/gi, 'Bypass'],
    [/Wiederanlauf/gi, 'Restart'],
    // Bit-field descriptions (translate component phrases)
    [/nicht\s+benutzt/gi, 'not used'],
    [/Schraubautomat\s+simulieren/gi, 'simulate screw feeder'],
    [/Schraubautomat/gi, 'screw feeder'],
    [/Drehmagazin/gi, 'rotary magazine'],
    [/Erfassung\s+Spindelleistung/gi, 'spindle power monitoring'],
    [/Lichtschranken?\s+an\s+Portal/gi, 'light barrier at gantry'],
    [/Lichtschranke\s+Tischumrandung/gi, 'light barrier (table edge)'],
    [/Service-T[üu]r/gi, 'service door'],
    [/DIL-Magazin/gi, 'DIL magazine'],
    [/Abdeckhaube\s+nicht\s+vorhanden/gi, 'cover hood absent'],
    [/Abdeckhaube/gi, 'cover hood'],
    [/Linsenschutz\s+vorhanden/gi, 'lens cover present'],
    [/Linsenschutz/gi, 'lens cover'],
    [/Flachbett-?Scanner\s+vorhanden/gi, 'flat-bed scanner present'],
    [/Rotations-?Scanner\s+vorhanden/gi, 'rotation scanner present'],
    [/Wasserk[üu]hler/gi, 'water cooler'],
    [/Lichtgitter\s+FIESSLER/gi, 'light curtain (FIESSLER)'],
    [/Lichtgitter\s+OMRON\/Sick/gi, 'light curtain (OMRON/Sick)'],
    [/Lichtgitter/gi, 'light curtain'],
    [/Spannzangen-?Sensor/gi, 'collet sensor'],
    [/Flachbett[-\s]+Laser/gi, 'flat-bed laser'],
    [/Rotations?[-\s]+Laser/gi, 'rotation laser'],
    [/Rotation\s+Fr[äa]ser/gi, 'rotation milling'],
    [/Fr[äa]ser\s+absenken/gi, 'lower milling cutter'],
    [/Werkzeugwechsel/gi, 'tool change'],
    [/kapazitiv\s+nachf[üu]hren/gi, 'capacitive tracking'],
    [/mit\s+Schuh\s+nachf[üu]hren/gi, 'shoe tracking'],
    [/Stahlmodul/gi, 'steel module'],
    [/ScannerGravur:\s*Z-Position/gi, 'Scanner engraving: Z pos.'],
    [/ScannerGravur/gi, 'Scanner engraving'],
    [/Abstand(?=\s)/gi, 'distance'],
    [/Messgeber\s+Fu[sß]/gi, 'foot encoder'],
    [/Messgeber/gi, 'encoder'],
    [/Messtaster/gi, 'probe'],
    // Single significant words
    [/Absaugungen/gi, 'suctions'],
    [/Absaugung/gi, 'suction'],
    [/Sp[üu]len/gi, 'purge'],
    [/Laserleistung/gi, 'laser power'],
    [/Ausgangsspannung/gi, 'output voltage'],
    [/Laser[dD][üu]se|Laserduese/gi, 'laser nozzle'],
    [/D[üu]se|Duese/gi, 'nozzle'],
    [/Schuh(?!\w)/gi, 'shoe'],
    [/Fokuspunkt/gi, 'focus point'],
    [/Fu[sß]unterkante/gi, 'foot underside'],
    [/Materialoberfl[äa]che?/gi, 'material surface'],
    [/Freifahren/gi, 'clear travel'],
    [/Leerverfahren/gi, 'rapid traverse'],
    [/Bezugspunktfahren/gi, 'homing'],
    [/Wechselpos(?:ition)?/gi, 'change position'],
    [/Spindelleistung/gi, 'spindle power'],
    [/Fr[äa]ser/gi, 'milling cutter'],
    [/D[üu]senabstand/gi, 'nozzle gap'],
    [/Mess?zyklus|Me[sß]zyklus/gi, 'measurement cycle'],
    [/Ueberwachung/gi, 'monitoring'],
    [/[Üü]berwachung/gi, 'monitoring'],
    [/Uebernahme/gi, 'acceptance'],
    [/[Üü]bernahme/gi, 'acceptance'],
    [/Schwellwert/gi, 'threshold'],
    [/Geschwindigkeit/gi, 'speed'],
    [/Starttaste/gi, 'start button'],
    [/Auswertung/gi, 'evaluation'],
    [/Schutter/gi, 'shutter'],
    [/Betrieb/gi, 'operation'],
    [/Softwarelimit/gi, 'software limit'],
    [/Entspannen/gi, 'release'],
    [/Maschinetyp/gi, 'Machine type'],
    [/Testbetrieb/gi, 'test mode'],
    [/Flachbett/gi, 'flat-bed'],
    [/Rotation/gi, 'rotation'],
    [/Vergleichswert/gi, 'threshold value'],
    [/Toleranzwert/gi, 'tolerance'],
    [/[Üü]berstand/gi, 'overhang'],
    [/Portal/gi, 'gantry'],
    [/Nachf[üu]hrung/gi, 'tracking'],
    [/Bezugspunkt/gi, 'reference point'],
    // Single technical nouns (put after compound rules)
    [/\bBedienteil\b/gi, 'operator panel'],
    [/\bAchskan[äa]l(?:e)?\b/gi, 'axis channel'],
    [/\bSPS\b/g, 'PLC'],
    [/\bAchsrechner\b/gi, 'axis controller'],
    [/\bSchnittstelle[n]?\b/gi, 'interface'],
    [/\bEndschalter\b/gi, 'limit switch'],
    [/\bbeachten\b/gi, 'observe'],
    [/\bignorieren\b/gi, 'ignore'],
    [/\bSpindeln?\b/gi, 'spindle'],
    [/\bDiagnose\b/gi, 'diagnostics'],
    [/\bKonfiguration\b/gi, 'configuration'],
    [/\bZuordnung\b/gi, 'assignment'],
    [/\bDrehzahl\b/gi, 'speed'],
    [/\bRegler\b/gi, 'controller'],
    [/\bTakt\b/gi, 'cycle'],
    [/\bRampe[n]?\b/gi, 'ramp'],
    [/\bKan[äa]le\b/gi, 'channels'],
    [/\bKanal\b/gi, 'channel'],
    [/\bDrucker\b/gi, 'printer'],
    [/\bSprache\b/gi, 'language'],
    [/\bAufl[öo]sung\b/gi, 'resolution'],
    [/\bAnzahl\b/gi, 'count'],
    [/\bNummer\b/gi, 'number'],
    [/\bEinstellung(?:en)?\b/gi, 'setting'],
    [/\bWert(?:e)?\b/gi, 'value'],
    [/\bFehler\b/gi, 'error'],
    [/\bWinkel\b/gi, 'angle'],
    [/\bRichtung\b/gi, 'direction'],
    [/\bMarkierung\b/gi, 'marking'],
    [/\bReihenfolge\b/gi, 'sequence'],
    [/\bStillstand\b/gi, 'standstill'],
    [/\bToleranz\b/gi, 'tolerance'],
    [/\bWeggeber\b/gi, 'encoder'],
    [/\bHandrad\b/gi, 'handwheel'],
    [/\bSpindel\b/gi, 'spindle'],
    [/\bNullimpuls\b/gi, 'index pulse'],
    [/\bNullpunkt(?:e)?\b/gi, 'zero point'],
    [/\bVerschiebung\b/gi, 'shift'],
    [/\bNocken\b/gi, 'cam'],
    [/\bVorhalt(?:zeit)?\b/gi, 'lead time'],
    [/\bNachstell(?:zeit)?\b/gi, 'reset time'],
    [/\bBeschleunigung\b/gi, 'acceleration'],
    [/\bBremsung\b/gi, 'braking'],
    [/\bStrecke\b/gi, 'distance'],
    [/\bImpuls(?:e)?\b/gi, 'pulse'],
    [/\bProgrammspeicher\b/gi, 'program memory'],
    [/\bDatenbaustein\b/gi, 'data block'],
    // Short function words last (safe word-boundary matches only)
    [/\bf[üu]r\b/gi, 'for'],
    [/\bfuer\b/gi, 'for'],
    [/\bund\b/gi, 'and'],
    [/\boder\b/gi, 'or'],
    [/\bod\.\b/gi, 'or'],
    [/\bnach\b/gi, 'after'],
    [/\bnicht\b/gi, 'not'],
    [/\bvorhanden\b/gi, 'present'],
    [/\baktiv\b/gi, 'active'],
    [/\binaktiv\b/gi, 'inactive'],
    [/\bbei\b/gi, 'at'],
    [/\bwenn\b/gi, 'when'],
    [/\bnur\b/gi, 'only'],
    [/\bgedr[üu]ckt\b/gi, 'pressed'],
    [/\bgel[öo]scht\b/gi, 'cleared'],
    [/\bnegieren\b/gi, 'invert'],
    [/\bvon\b/gi, 'of'],
    [/\bim\b/gi, 'in'],
    [/\bzum?\b/gi, 'to'],
    [/\bdes\b/gi, 'of the'],
    [/\bdie\b/gi, ''],
    [/\bder\b/gi, ''],
    [/\bdas\b/gi, ''],
    [/\bein(?:e[rns]?)?\b/gi, 'a'],
    [/\bStandard\b/gi, 'default'],
    [/\bohne\b/gi, 'without'],
    [/\bmit\b/gi, 'with'],
    [/\bpro\b/gi, 'per'],
    [/\baus\b/gi, 'off'],
    [/\bauf\b/gi, 'open'],
    [/\brunter\b/gi, 'down'],
    [/\bschon\b/gi, 'already'],
    [/\bunten\b/gi, 'below'],
    [/\bist\b/gi, 'is'],
    [/\bwird\b/gi, ''],
    [/\bsein\b/gi, 'be'],
    [/\bbis\b/gi, 'until'],
    [/\bgleich\b/gi, 'equal to'],
    [/\bakt\./gi, 'current'],
    [/\berlaubt\b/gi, 'allowed'],
    [/\bAchse\b/gi, 'axis'],
    [/\bH[öo]he\b/gi, 'height'],
    [/\b[üu]ber\b/gi, 'above'],
    [/\bzul[äa]ssig(?:e[rns]?)?\b/gi, 'allowable'],
    [/\bmaximale?\b/gi, 'maximum'],
    [/\bintegrierten?\b/gi, 'integrated'],
    [/\bmetrisch(?:e[n])?\b/gi, 'metric'],
    [/\bdeutsch\b/gi, 'German'],
    [/\bkeine?\b/gi, 'no'],
    [/\bsoll(?:en)?\b/gi, ''],
    [/\bworden\b/gi, ''],
    [/\bwerden\b/gi, ''],
    [/\boder\b/gi, 'or'],
    [/\bPolares?\b/gi, 'polar'],
    [/\bauto(?:matisch)?\b/gi, 'auto'],
    [/\bangeschlossen\b/gi, 'connected'],
    [/\bberücksichtigt\b|\bberuecksichtigt\b/gi, 'taken into account'],
    [/\bgespeichert\b/gi, 'saved'],
    [/\babgelegt\b/gi, 'stored'],
  ];

  function translateDesc(text) {
    if (!text) return '';
    let t = text;
    for (const [pat, rep] of TRANSLATION_RULES) {
      t = t.replace(pat, rep);
    }
    return t.replace(/\s{2,}/g, ' ').trim();
  }

  const PREFIX_GROUP_RULES = [
    ['Table', /^TABLE_/i],
    ['Axes & Limits', /^(X_|Y_|Z_|A_|B_|AXIS_|SOFT_LIMIT|HOME_OFFSET)/i],
    ['Laser & Focus', /^(LASER_|FOCUS_|GAS_|ASSIST_|BEAM_)/i],
    ['Suction & Exhaust', /^(SUCTION_|VACUUM_|EXHAUST_|ABSAUG_)/i],
    ['Scanner & Rotation', /^(SCANNER_|SCANNING_|SCAN_)/i],
    ['Tool Changer', /^TCHG_/i],
    ['Spindle & Milling', /^(SPINDLE_|X_SHIFT|Y_SHIFT|SCREWDRV_|MILL)/i],
    ['Machine', /^(MODEL|MACHINE_|SERIAL|VERSION)/i]
  ];

  let originalFileContent = '';
  let fileName = 'machine.mk';
  let fileFormat = 'unknown';
  let parsedParams = {};
  let lineRecords = [];
  let parameterGroups = {};
  let originalValues = {};
  let userEditedParams = new Set();
  let hasUnsavedChanges = false;
  let machineUnits = 'mm';
  let displayUnits = 'mm';
  let backups = [];
  let changeHistory = [];
  let isLocked = true;
  let filterText = '';
  // Set by an embedding parent (e.g. the remote-support session viewer) via
  // window.MkEditor.setSaveHandler(fn) to receive saved content directly
  // instead of triggering a browser download. Standalone use is unaffected
  // when this is left null.
  let embeddedSaveCallback = null;

  function escapeHtml(v) {
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeJsStringSingle(v) {
    return String(v).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n');
  }

  function paramDomId(key) {
    return 'p_' + key.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function englishDescription(key, fileDesc) {
    if (typeof MK_PARAM_DESCRIPTIONS !== 'undefined' && MK_PARAM_DESCRIPTIONS[key]) {
      return MK_PARAM_DESCRIPTIONS[key];
    }
    if (fileDesc && fileDesc.length > 3) {
      return translateDesc(fileDesc);
    }
    return key.replace(/_/g, ' ').replace(/\./g, ' ');
  }

  function stripAllBlockComments(s) {
    return s.replace(/\/\*.*?\*\//g, '').trim();
  }

  function mkBlockComplete(combined) {
    const s = stripAllBlockComments(combined);
    return s.endsWith(';') || s.endsWith('",');
  }

  const SECTION_TITLE_EN = {
    'Testeinstellungen': 'Test Settings',
    'Hardware - Konfiguration': 'Hardware Configuration',
    'Software-Konfiguration': 'Software Configuration',
    'Einstellung der Achsen': 'Axis Settings',
    'Einstellung der Achsen bei Inbetriebnahme': 'Axis Commissioning',
    'Reglereinstellung': 'Controller Tuning',
    'Einstellungen fuer Referenzpunktfahrt': 'Reference Point Homing',
    'Achsbezogene Grenzwerte': 'Axis Limits',
    'Bahnbezogene Grenzwerte': 'Path / Trajectory Limits',
    'Einstellung Zusatzkarten': 'Extension Cards',
    'Technologie - spezifische Einstellungen': 'Technology Settings',
    'Technologie - spezifische Einstellungen der P-Felder': 'Technology P-Field Mapping',
    'SPS - spezifische Einstellungen': 'PLC Settings'
  };

  function sectionTitleEn(title) {
    let best = null, bestLen = 0;
    for (const [de, en] of Object.entries(SECTION_TITLE_EN)) {
      if (title.toLowerCase().includes(de.toLowerCase()) && de.length > bestLen) {
        bestLen = de.length;
        best = en;
      }
    }
    return best || title;
  }

  function parseSectionHeader(line) {
    const s = line.trim();
    let m = s.match(/^\/\*\s*(\d+)\.\s+([A-Za-zÄÖÜäöüß][^*]+?)\s*\*\/$/);
    if (m) return `${m[1]}. · ${sectionTitleEn(m[2].trim())}`;
    m = s.match(/^\/\*\s*(\d+\.\d+)\s+([A-Za-zÄÖÜäöüß][^*]+?)\s*\*\/$/);
    if (m) return `${m[1]} · ${sectionTitleEn(m[2].trim())}`;
    return null;
  }

  function extractBlockComment(tail) {
    const m = tail.match(/\/\*(.*?)\*\//);
    return m ? m[1].trim() : '';
  }

  const DEFAULT_AXIS_LABELS = ['X', 'Y', 'Z', 'W', 'A', 'U', 'V', 'B', 'C'];
  let machineAxisLabels = [];
  let activeAxisCount = DEFAULT_AXIS_LABELS.length;

  function parseRowLabel(comment) {
    if (!comment) return null;
    // Strip /* */ wrappers; anchor patterns to start so embedded refs (e.g. "(DW254)") don't false-match
    const inner = comment.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim();
    let m;
    // P-field first: "P760 = description" or "P760: description"
    m = inner.match(/^P(\d+)\s*[=:]\s*(.*)/i);
    if (m) return { label: `P${m[1]}`, isAxis: false, desc: m[2].trim() };
    // DW register: "DW 224: description"
    m = inner.match(/^DW\s*(\d+)[:\s]+(.*)/i);
    if (m) return { label: `DW${m[1]}`, isAxis: false, desc: m[2].trim() };
    m = inner.match(/^DW\s*(\d+)/i);
    if (m) return { label: `DW${m[1]}`, isAxis: false, desc: '' };
    // Sercos/CAN Knoten: "Knoten 1: X-Achse"
    m = inner.match(/^Knoten\s*(\d+)[:\s]*(.*)/i);
    if (m) return { label: `Kn${m[1]}`, isAxis: false, desc: m[2].trim() };
    // CAN-Node: "CAN-Node 3"
    m = inner.match(/^CAN-?Node\s*(\d+)[:\s]*(.*)/i);
    if (m) return { label: `CAN${m[1]}`, isAxis: false, desc: m[2].trim() };
    // Axis: "(X-Achse)", "X-Achse", "X:"
    m = inner.match(/\(([XYZWABUVC])-?Achse\)/i)
      || inner.match(/\b([XYZWABUVC])-Achse/i)
      || inner.match(/\b([XYZWABUVC]):\s/i);
    if (m) return { label: m[1].toUpperCase(), isAxis: true, desc: '' };
    return null;
  }

  function parseBitDefs(rawDesc) {
    if (!rawDesc || !/\b(?:bit|b)\s*\d/i.test(rawDesc)) return null;
    // Collect all marker positions: {bit, matchStart, valueStart}
    const markerRe = /\b(?:bit|b)\s*(\d+)\s*[=:]/gi;
    const markers = [];
    let m;
    while ((m = markerRe.exec(rawDesc)) !== null) {
      markers.push({ bit: parseInt(m[1]), matchStart: m.index, valueStart: m.index + m[0].length });
    }
    if (markers.length < 2) return null;
    const bits = {};
    for (let i = 0; i < markers.length; i++) {
      const { bit, valueStart } = markers[i];
      const chunkEnd = i + 1 < markers.length ? markers[i + 1].matchStart : rawDesc.length;
      let chunk = rawDesc.slice(valueStart, chunkEnd);
      // "1 (description)" → take text inside parens
      const parenM = chunk.match(/^\s*\d+\s*\(([^)]+)\)/);
      if (parenM) {
        chunk = parenM[1];
      } else {
        chunk = chunk.replace(/^\s*\d+\s*/, '').replace(/[;,/\s]+$/, '');
      }
      chunk = chunk.trim();
      if (chunk && !bits[bit]) bits[bit] = chunk;
    }
    const result = Object.entries(bits)
      .map(([b, d]) => ({ bit: parseInt(b), desc: d }))
      .sort((a, b) => a.bit - b.bit);
    return result.length >= 2 ? result : null;
  }

  function parseAxisRowLine(rawLine, key) {
    const trimmed = rawLine.trim();
    const isFirst = trimmed.startsWith(key);
    let work = isFirst ? trimmed.slice(key.length).trim() : trimmed;
    const commentM = work.match(/(\/\*[\s\S]*?\*\/)\s*$/);
    const comment = commentM ? commentM[1] : '';
    let valPart = commentM ? work.slice(0, commentM.index).trim() : work;
    const endsSemi = /;\s*$/.test(valPart);
    valPart = valPart.replace(/[;,]+\s*$/, '').trim();
    const parsed = parseRowLabel(comment);
    // When no recognized label pattern is found, keep the raw comment text as rowDesc
    // so non-axis multi-row params (KARTESISCH_ACHSNR etc.) still show per-row descriptions
    const commentInner = comment.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim();
    const rowDesc = parsed ? parsed.desc : commentInner;
    const bitDefs = parseBitDefs(rowDesc);
    return {
      rawLine,
      value: valPart,
      comment,
      commentInner,
      axisLabel: parsed ? parsed.label : null,
      isAxisLabel: parsed ? parsed.isAxis : false,
      rowDesc,
      bitDefs,
      endsSemi,
      isFirst
    };
  }

  function parseAxisRows(rawLines, key) {
    if (!rawLines || rawLines.length <= 1) return null;
    return rawLines.map(raw => parseAxisRowLine(raw, key));
  }

  function buildMachineAxisLabels() {
    const ref = parsedParams.MK_APPLACHSIDX;
    if (!ref || !ref.axisRows || ref.axisRows.length < 2) {
      activeAxisCount = DEFAULT_AXIS_LABELS.length;
      return [...DEFAULT_AXIS_LABELS];
    }
    // MK_APPLACHSIDX[rowIdx] = appAxisIndex → invert: labels[appAxisIndex] = rowLabel
    const result = [];
    let count = 0;
    ref.axisRows.forEach((row, rowIdx) => {
      const appIdx = parseInt(row.value, 10);
      if (appIdx >= 0) {
        result[appIdx] = row.axisLabel || DEFAULT_AXIS_LABELS[rowIdx] || `#${rowIdx + 1}`;
        count++;
      }
    });
    for (let i = 0; i < DEFAULT_AXIS_LABELS.length; i++) {
      if (result[i] == null) result[i] = DEFAULT_AXIS_LABELS[i];
    }
    activeAxisCount = count || DEFAULT_AXIS_LABELS.length;
    return result;
  }

  // Keys whose rows are spindle slots, not machine axes
  // Per-parameter row label/description overrides based on Eckelman NC documentation.
  // Each entry is an array of {label, desc} objects, one per row.
  // label: replaces the auto-detected row label (axis/[n]/Sp.n)
  // desc:  replaces rowDesc only when non-empty (file comment rowDesc takes priority when def is empty)
  const PARAM_ROW_DEFS = {
    // Serial printer interface — rows carry serial-port settings in fixed order
    MK_DRUCKER_V24MODE: [
      { label: 'Baud',   desc: 'Baud rate [bit/s]' },
      { label: 'Bits',   desc: 'Data bits (7 or 8)' },
      { label: 'Parity', desc: '0 = none  1 = odd  2 = even' },
      { label: 'Stop',   desc: 'Stop bits' },
    ],
    // CAN bus bitrates for two independent buses
    MK_CANOPEN_BAUDRATE: [
      { label: 'CAN1', desc: 'CANopen bitrate [kbit/s], or 0 for SLIO' },
      { label: 'CAN2', desc: 'CANopen drive bus bitrate [kbit/s]' },
    ],
    // NC look-ahead buffer, one entry per NC channel
    MK_LAH_VORLAUFTIEFE: [
      { label: 'Ch.0', desc: 'Lookahead buffer depth [blocks] — channel 0' },
      { label: 'Ch.1', desc: 'Lookahead buffer depth [blocks] — channel 1' },
    ],
    // NC retrace limit, one entry per NC channel
    MK_LAH_RUECKLAUFGRENZE: [
      { label: 'Ch.0', desc: 'Max retrace distance on contour [blocks] — channel 0' },
      { label: 'Ch.1', desc: 'Max retrace distance on contour [blocks] — channel 1' },
    ],
    // Cartesian coordinate system — axis index assignments
    MK_KARTESISCH_ACHSNR: [
      { label: 'cos', desc: 'Cosine (X) axis index in Cartesian system' },
      { label: 'sin', desc: 'Sine (Y) axis index in Cartesian system' },
      { label: 'tan', desc: 'Tangential follower axis index (−1 = none)' },
    ],
    // Polar coordinate system — axis index assignments
    MK_POLAR_ACHSNR: [
      { label: 'R', desc: 'Radius axis index in polar system' },
      { label: 'φ', desc: 'Angle axis index in polar system' },
    ],
    // Hardware axis interface slots 0-15 → application axis index
    MK_HARDKONF:     Array.from({ length: 16 }, (_, i) => ({ label: `HW.${i}`,   desc: 'Hardware interface → app axis index (−1 = unused)' })),
    MK_VIRTUALDRIVES: Array.from({ length: 16 }, (_, i) => ({ label: `Virt.${i}`, desc: 'Virtual drive → app axis index (−1 = unused)' })),
    // Axis type register — one bit-coded value per hardware interface slot
    MK_ACHSENART:    Array.from({ length: 16 }, (_, i) => ({ label: `HW.${i}`,   desc: '' })),
    // M-function hook table — desc intentionally empty so per-slot file comments ("Beam on", "Purge" etc.) are preserved
    MK_MFKT_UPR_TABELLE: Array.from({ length: 16 }, (_, i) => ({ label: `Slot${i + 1}`, desc: '' })),
  };

  const SPINDLE_PARAM_RE = /^MK_(APPLSPINDEL|SPINDEL(?:MAX|DREHZAHL|ART|UMKEHR))/i;

  function applyAxisLabels(axisRows, key) {
    if (!axisRows) return;
    const isSpindle = SPINDLE_PARAM_RE.test(key || '');
    const hasAxisLabel = axisRows.some(r => r.isAxisLabel);
    const hasNonAxisLabel = axisRows.some(r => r.axisLabel && !r.isAxisLabel);
    // Only treat as per-axis when the row count exactly matches the active axis count,
    // AND the key is not a spindle parameter. This prevents MK_SPINDELMAX (3 rows)
    // from being labelled X/Y/Z on an 8-axis machine.
    const looksPerAxis = !isSpindle && (hasAxisLabel || axisRows.length === activeAxisCount);
    axisRows.forEach((row, i) => {
      if (!row.axisLabel) {
        if (isSpindle) {
          row.axisLabel = `Sp.${i + 1}`;
          row.isAxisLabel = false;
        } else if (hasNonAxisLabel) {
          // Non-axis parameter (DW, P-field, Knoten, CAN) — sequential index
          row.axisLabel = `[${i}]`;
          row.isAxisLabel = false;
        } else if (looksPerAxis) {
          // True per-axis parameter — use machine axis label from APPLACHSIDX mapping
          row.axisLabel = machineAxisLabels[i] || DEFAULT_AXIS_LABELS[i] || `#${i + 1}`;
          row.isAxisLabel = true;
        } else {
          // Multi-row but not per-axis (hardware slots, channels, etc.) — numeric index
          row.axisLabel = `[${i + 1}]`;
          row.isAxisLabel = false;
        }
      }
    });
  }

  function finalizeAxisParams() {
    machineAxisLabels = buildMachineAxisLabels(); // also sets activeAxisCount
    for (const param of Object.values(parsedParams)) {
      if (param.rawLines && param.rawLines.length > 1) {
        param.axisRows = parseAxisRows(param.rawLines, param.key);
        applyAxisLabels(param.axisRows, param.key);
        param.isPerAxis = param.axisRows && param.axisRows.length > 1;
        // Clear description if it's just a bare axis label comment — not a real description
        if (param.isPerAxis && /^\([XYZWABUVC]-?Achse\)$/i.test(param.description || '')) {
          param.description = englishDescription(param.key, '');
        }
        // Apply per-parameter row overrides from PARAM_ROW_DEFS
        const defs = PARAM_ROW_DEFS[param.key];
        if (defs && param.axisRows) {
          param.axisRows.forEach((row, i) => {
            const def = defs[i];
            if (!def) return;
            row.axisLabel = def.label;
            row.isAxisLabel = false; // forces has-desc-rows layout
            // Non-empty def.desc is curated documentation — always wins over the file comment.
            // Empty def.desc means "keep whatever the file said" (e.g. slot-specific M-function names).
            if (def.desc) row.rowDesc = def.desc;
          });
        }
      }
    }
  }

  function axisInputId(key, index) {
    return `${paramDomId(key)}_ax${index}`;
  }

  function syncBitCheckboxes(numInput) {
    const val = parseInt(numInput.value) || 0;
    numInput.closest('.desc-row').querySelectorAll('input[data-bit]').forEach(cb => {
      const set = !!(val & (1 << parseInt(cb.dataset.bit)));
      cb.checked = set;
      cb.closest('.bit-check').classList.toggle('bit-set', set);
    });
  }

  function onBitChange(key, numInput, checkbox) {
    let val = parseInt(numInput.value) || 0;
    const b = parseInt(checkbox.dataset.bit);
    if (checkbox.checked) val |= (1 << b);
    else val &= ~(1 << b);
    numInput.value = val;
    syncBitCheckboxes(numInput);
    onAxisChange(key, numInput);
  }

  function formatAxisValueForSave(val, original) {
    const n = parseFloat(val);
    if (isNaN(n)) return String(val);
    if (original && String(original).includes('.')) {
      const dec = (String(original).split('.')[1] || '').replace(/[^0-9].*/, '').length;
      if (dec > 0) return n.toFixed(Math.min(dec, 4));
    }
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(4);
  }

  function rebuildAxisRow(row, newValue, key) {
    const sep = row.endsSemi ? ';' : ',';
    const valStr = formatAxisValueForSave(newValue, row.value);
    const commentSuffix = row.comment ? `   ${row.comment}` : '';
    if (row.isFirst) {
      const lead = row.rawLine.match(/^(MK_[\w]+)(\s+)/);
      const prefix = lead ? lead[1] + lead[2] : `${key} `;
      return prefix + valStr + sep + commentSuffix;
    }
    const ws = row.rawLine.match(/^(\s*)/)?.[1] || '                          ';
    return ws + valStr + sep + commentSuffix;
  }

  function rebuildAxisBlock(meta, axisValues) {
    return meta.axisRows.map((row, i) => rebuildAxisRow(row, axisValues[i] ?? row.value, meta.key));
  }

  function displayAxisValue(row, type) {
    const v = parseFloat(row.value);
    if (isNaN(v) || type !== 'length') return row.value;
    return convertValue(v, machineUnits, displayUnits).toFixed(4);
  }

  function getAxisValuesForSave(key) {
    const param = parsedParams[key];
    if (!param?.axisRows) return null;
    const typ = getParameterType(key);
    return param.axisRows.map((row, i) => {
      const el = document.getElementById(axisInputId(key, i));
      if (!el) return row.value;
      let v = parseFloat(el.value);
      if (isNaN(v)) return row.value;
      if (typ === 'length' && displayUnits !== machineUnits) {
        v = convertValue(v, displayUnits, machineUnits);
      }
      return formatAxisValueForSave(v, row.value);
    });
  }

  function parseMkMultiline(lines, start, section) {
    const first = lines[start].trim();
    const m = first.match(/^(MK_[\w]+)\s+(.*)$/);
    if (!m) return null;
    const key = m[1];
    let end = start;
    let combined = m[2];
    while (!mkBlockComplete(combined) && end + 1 < lines.length) {
      const nxt = lines[end + 1].trim();
      if (/^MK_[\w]+\s/.test(nxt)) break;
      end += 1;
      combined += ' ' + nxt;
    }
    if (!mkBlockComplete(combined)) return null;
    const isMultiLine = end > start;
    const body = stripAllBlockComments(combined).replace(/;\s*$/, '').trim();
    const rawLines = lines.slice(start, end + 1);
    let desc = isMultiLine ? '' : extractBlockComment(combined);
    const rec = {
      key, value: body, description: desc, section,
      lineIndex: start, lineEnd: end, lineKind: 'mkconst', indexPart: '',
      rawLine: lines[start], rawLines,
      isPerAxis: false, axisRows: null
    };
    if (rawLines.length > 1) {
      rec.axisRows = parseAxisRows(rawLines, key);
      rec.isPerAxis = rec.axisRows && rec.axisRows.length > 1;
      // Assemble description from initial rows whose comments don't match any recognized label.
      // These are parameter-level description lines, e.g.:
      //   MK_VMAX  30, /* max. Achsgeschwindigkeit [m/min] */
      //            30, /* bei Schraubver.=15 für X- und Y-Achse eintragen */
      //            10,  ← no comment
      if (!rec.description && rec.isPerAxis) {
        const parts = [];
        for (const axRow of rec.axisRows) {
          if (axRow.axisLabel) break; // recognized label (axis/DW/P/Knoten) → stop
          if (axRow.commentInner) {
            parts.push(axRow.commentInner);
            if (parts.length >= 2) break; // max 2 continuation lines
          } else if (parts.length > 0) {
            break; // gap after collecting → stop
          }
        }
        if (parts.length > 0) rec.description = parts.join(' ');
      }
    }
    return rec;
  }

  function parseMkConstLine(line, section, lineIndex, rawLine) {
    return parseMkMultiline([line], 0, section);
  }

  function classifyLine(line) {
    const s = line.trim();
    if (!s || s.startsWith(';') || s.startsWith('#')) return 'comment';
    if (s.startsWith('/*') || s.startsWith('**') || s.startsWith('<--')) return 'comment';
    if (s.startsWith('[') && s.endsWith(']')) return 'section';
    if (/^MK_[\w.]+\s+\S/.test(s)) return 'mkconst';
    if (s.includes('|') && !s.startsWith('>--') && !/^Key\s*\|/i.test(s)) return 'pipe';
    if (s.includes('=') && !/^Key\s/i.test(s)) return 'keyeq';
    if (s.includes('\t')) return 'tab';
    if (/^[\w.\-]+\s+\S/.test(s) && !s.startsWith('/*')) return 'ws';
    return 'other';
  }

  function detectFormat(lines) {
    const counts = {};
    for (const line of lines.slice(0, 800)) {
      const k = classifyLine(line);
      if (k && k !== 'comment' && k !== 'other') counts[k] = (counts[k] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'keyeq';
  }

  function parsePipeLine(line, section, lineIndex) {
    const parts = line.split('|').map(p => p.trim());
    if (parts.length < 2 || !parts[0] || /^Key$/i.test(parts[0])) return null;
    const key = parts[0];
    let indexPart = '';
    let value = parts[1];
    let desc = '';
    if (parts.length >= 3 && /^P?\d+$/i.test(parts[1])) {
      indexPart = parts[1];
      value = parts[2];
      desc = parts.slice(3).join('|').trim();
    } else if (parts.length >= 3) {
      desc = parts.slice(2).join('|').trim();
    }
    return { key, value, description: desc, section, lineIndex, lineKind: 'pipe', indexPart, rawLine: line };
  }

  function parseMkFile(content) {
    if (!content) return 0;
    const lines = content.split(/\r\n|\r|\n/);
    lineRecords = lines.map((raw, i) => ({ raw, index: i, kind: classifyLine(raw.trim()) }));
    fileFormat = detectFormat(lines);
    parsedParams = {};
    changeHistory = [];
    let section = '99 · Other';
    let count = 0;

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      const secHdr = parseSectionHeader(line);
      if (secHdr) {
        section = secHdr;
        continue;
      }
      const kind = classifyLine(line);
      if (kind === 'comment') {
        const hm = line.match(/;\s*\[(.*?)\]\s+(\S+)\s+([\S]+)\s+->\s+([\S]+)/);
        if (hm) {
          changeHistory.push({
            timestamp: hm[1], key: hm[2], oldValue: hm[3], newValue: hm[4], isUserEdit: false
          });
        }
        continue;
      }
      if (kind === 'section') {
        section = line.slice(1, -1).trim();
        continue;
      }
      if (/^MK_[\w]+\s/.test(line)) {
        const rec = parseMkMultiline(lines, i, section);
        if (rec) {
          rec.description = englishDescription(rec.key, rec.description);
          parsedParams[rec.key] = rec;
          count++;
          i = rec.lineEnd + 1;
          continue;
        }
      }
      let rec = null;
      if (kind === 'pipe') rec = parsePipeLine(line, section, i);
      else if (kind === 'keyeq') {
        const eq = line.indexOf('=');
        rec = {
          key: line.slice(0, eq).trim(), value: line.slice(eq + 1).trim(),
          description: '', section, lineIndex: i, lineKind: 'keyeq', indexPart: '', rawLine: raw
        };
      } else if (kind === 'tab' || kind === 'ws') {
        const sep = kind === 'tab' ? '\t' : /\s+/;
        const parts = line.split(sep);
        if (parts.length >= 2) {
          rec = {
            key: parts[0].trim(), value: parts.slice(1).join(' ').trim(),
            description: '', section, lineIndex: i, lineKind: kind, indexPart: '', rawLine: raw
          };
        }
      }
      if (rec && rec.key && !parsedParams[rec.key]) {
        rec.description = englishDescription(rec.key, rec.description);
        parsedParams[rec.key] = rec;
        count++;
      }
    }

    autoDetectUnits();
    finalizeAxisParams();
    document.getElementById('params-loaded').textContent =
      `${count} parameters · format: ${fileFormat}` +
      (machineAxisLabels.length ? ` · axes: ${machineAxisLabels.slice(0, 8).join('/')}` : '');
    renderChangeHistory();
    return count;
  }

  function autoDetectUnits() {
    const probe = parsedParams['TCHG_DEFAULT_TOOLLENGHT'] || parsedParams['TABLE_SIZE_X'];
    if (!probe) return;
    const v = parseFloat(probe.value);
    if (isNaN(v)) return;
    const detected = v < 50 ? 'inch' : 'mm';
    const sel = document.getElementById('machine-units');
    if (sel) { sel.value = detected; machineUnits = detected; }
  }

  function getCatalogGroups() {
    const base = (typeof MK_DEFAULT_GROUPS !== 'undefined' && MK_DEFAULT_GROUPS)
      ? JSON.parse(JSON.stringify(MK_DEFAULT_GROUPS)) : { 'Other Parameters': { paramTypes: {} } };
    if (!base['Other Parameters']) base['Other Parameters'] = { paramTypes: {} };
    return base;
  }

  function inferGroupName(key, section) {
    if (section) return section.replace(/_/g, ' ').trim() || 'General';
    for (const [name, re] of PREFIX_GROUP_RULES) {
      if (re.test(key)) return name;
    }
    if (key.includes('_')) return key.split('_')[0].replace(/\./g, ' ');
    return 'Other Parameters';
  }

  function getParameterType(key) {
    for (const group of Object.values(getCatalogGroups())) {
      if (group.paramTypes && group.paramTypes[key]) return group.paramTypes[key];
    }
    const k = key.toLowerCase();
    if (/speed|geschw|rpm/i.test(k)) return 'speed';
    if (/time|delay|zeit|_ms\b/i.test(k)) return 'time';
    if (/power|watt|leistung/i.test(k)) return 'power';
    if (/volt|sensor/i.test(k)) return 'voltage';
    if (/angle|winkel|deg/i.test(k)) return 'angle';
    if (/offset|pos|length|width|height|size|focus|fokus|limit|shift|table|axis/i.test(k)) return 'length';
    return 'none';
  }

  function catalogGroupForKey(key) {
    for (const [groupName, group] of Object.entries(getCatalogGroups())) {
      if (group.paramTypes && Object.prototype.hasOwnProperty.call(group.paramTypes, key)) {
        return { groupName, type: group.paramTypes[key] };
      }
    }
    return null;
  }

  function groupSortKey(name) {
    if (typeof MK_SECTION_ORDER !== 'undefined') {
      const idx = MK_SECTION_ORDER.indexOf(name);
      if (idx >= 0) return idx;
    }
    const m = name.match(/^(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) * 100 : 9999;
  }

  function organizeParametersIntoGroups() {
    parameterGroups = {};
    const catalog = getCatalogGroups();

    for (const [key, param] of Object.entries(parsedParams)) {
      if (!key.startsWith('MK_')) continue;
      let groupName = param.section;
      let type = getParameterType(key);
      const cat = catalogGroupForKey(key);
      if (cat) type = cat.type;
      if (!groupName || groupName === '99 · Other') {
        groupName = (cat && cat.groupName) || inferGroupName(key, param.section);
      }
      if (!parameterGroups[groupName]) {
        parameterGroups[groupName] = { paramTypes: {}, params: [] };
      }
      parameterGroups[groupName].paramTypes[key] = type;
      parameterGroups[groupName].params.push({
        ...param,
        type,
        description: englishDescription(key, param.description)
      });
    }

    for (const g of Object.values(parameterGroups)) {
      if (g.params) g.params.sort((a, b) => (a.lineIndex ?? 0) - (b.lineIndex ?? 0));
    }
  }

  function sortedGroupNames() {
    // Sort groups by the file-line of their first parameter so sections appear in file order
    return Object.keys(parameterGroups).sort((a, b) => {
      const minA = Math.min(...(parameterGroups[a].params || []).map(p => p.lineIndex ?? 0));
      const minB = Math.min(...(parameterGroups[b].params || []).map(p => p.lineIndex ?? 0));
      return minA - minB;
    });
  }

  function convertValue(value, fromUnit, toUnit) {
    if (fromUnit === toUnit) return value;
    if (fromUnit === 'mm' && toUnit === 'inch') return value * MM_TO_INCH;
    if (fromUnit === 'inch' && toUnit === 'mm') return value * INCH_TO_MM;
    return value;
  }

  function displayValue(param) {
    const v = parseFloat(param.value);
    if (isNaN(v) || param.type !== 'length') return param.value;
    return convertValue(v, machineUnits, displayUnits).toFixed(4);
  }

  function matchesFilter(param) {
    if (!filterText) return true;
    const q = filterText.toLowerCase();
    if (param.key.toLowerCase().includes(q)) return true;
    if ((param.description || '').toLowerCase().includes(q)) return true;
    if (String(param.value ?? '').toLowerCase().includes(q)) return true;
    if (String(displayValue(param) ?? '').toLowerCase().includes(q)) return true;
    if ((param.section || '').toLowerCase().includes(q)) return true;
    // Also search row descriptions (DW, P-field params)
    if (param.axisRows) {
      for (const ax of param.axisRows) {
        if ((ax.axisLabel || '').toLowerCase().includes(q)) return true;
        if (translateDesc(ax.rowDesc || '').toLowerCase().includes(q)) return true;
        if ((ax.bitDefs || []).some(b => translateDesc(b.desc).toLowerCase().includes(q))) return true;
        if ((ax.rawLine || '').toLowerCase().includes(q)) return true;
      }
    }
    return false;
  }

  function displayParameters() {
    const container = document.getElementById('parameters-container');
    container.innerHTML = '';
    const names = sortedGroupNames();

    for (const groupName of names) {
      const group = parameterGroups[groupName];
      // A group-name match reveals every parameter in that group, not just the
      // ones whose own key/description happens to contain the search text.
      const groupNameMatches = filterText && groupName.toLowerCase().includes(filterText.toLowerCase());
      const visible = groupNameMatches ? (group.params || []) : (group.params || []).filter(matchesFilter);
      if (!visible.length) continue;

      const groupDiv = document.createElement('div');
      groupDiv.className = 'param-group';
      const header = document.createElement('div');
      header.className = 'param-group-header';
      header.innerHTML = `${escapeHtml(groupName)} <span class="parameter-badge">${visible.length}</span>`;
      header.onclick = () => toggleGroup(header);
      const body = document.createElement('div');
      body.className = 'param-group-body';

      const rowH = document.createElement('div');
      rowH.className = 'param-row param-header mk-grid';
      rowH.innerHTML = '<div>Parameter — Description</div><div>Value</div><div>Unit</div>';
      body.appendChild(rowH);

      for (const param of visible) {
        const row = document.createElement('div');
        const id = paramDomId(param.key);
        const unit = PARAM_TYPES[param.type]?.units?.[displayUnits] || '-';
        const step = PARAM_TYPES[param.type]?.step || 1;
        const disabled = isLocked ? 'disabled' : '';
        const lockCls = isLocked ? 'locked' : '';

        if (param.isPerAxis && param.axisRows) {
          const hasNonAxisRows = param.axisRows.some(r => r.axisLabel && !r.isAxisLabel);
          if (hasNonAxisRows) {
            // Non-axis multi-row param (DW registers, P-fields, Knoten, etc.)
            row.className = 'param-row has-desc-rows';
            const descRowHtml = param.axisRows.map((ax, i) => {
              const axId = axisInputId(param.key, i);
              const lbl = ax.axisLabel || `[${i}]`;
              const val = displayAxisValue(ax, param.type);
              const rawDesc = ax.rowDesc || '';
              const engDesc = translateDesc(rawDesc);
              const bits = ax.bitDefs;
              const numVal = parseInt(val) || 0;

              if (bits && bits.length >= 2) {
                // Bit-coded row: render checkboxes + value input
                const bitsHtml = bits.map(bd => {
                  const isSet = !!(numVal & (1 << bd.bit));
                  const engBitDesc = translateDesc(bd.desc);
                  return `<label class="bit-check${isSet ? ' bit-set' : ''}" title="Bit ${bd.bit}">`
                    + `<input type="checkbox" data-bit="${bd.bit}"${isSet ? ' checked' : ''}${disabled ? ' disabled' : ''}>`
                    + ` <span class="bit-num">Bit${bd.bit}</span> <span class="bit-desc">${escapeHtml(engBitDesc)}</span>`
                    + `</label>`;
                }).join('');
                return `<div class="desc-row has-bits">`
                  + `<span class="row-lbl" title="${escapeHtml(ax.comment || '')}">${escapeHtml(lbl)}</span>`
                  + `<input type="number" id="${axId}" value="${escapeHtml(val)}" step="${step}" ${disabled} class="${lockCls}" `
                  + `data-key="${escapeHtml(param.key)}" data-axis="${i}" style="width:72px;flex-shrink:0">`
                  + `<div class="desc-bit-wrap">`
                  + (engDesc ? `<span class="row-desc row-desc-top">${escapeHtml(engDesc)}</span>` : '')
                  + `<div class="bit-grid">${bitsHtml}</div>`
                  + `</div></div>`;
              }

              // Plain row: label + value + translated description
              return `<div class="desc-row">`
                + `<span class="row-lbl" title="${escapeHtml(ax.comment || '')}">${escapeHtml(lbl)}</span>`
                + `<input type="number" id="${axId}" value="${escapeHtml(val)}" step="${step}" ${disabled} class="${lockCls}" `
                + `data-key="${escapeHtml(param.key)}" data-axis="${i}">`
                + `<span class="row-desc">${escapeHtml(engDesc)}</span>`
                + `</div>`;
            }).join('');
            const descHdrA = escapeHtml(param.description || '');
            row.innerHTML = `
              <div class="param-label">
                <span class="param-key" title="${escapeHtml(param.key)}">${escapeHtml(param.key)}</span>
                ${descHdrA ? `<span class="param-desc-inline">${descHdrA}</span>` : ''}
              </div>
              <div class="desc-rows">${descRowHtml}</div>`;
            body.appendChild(row);

            // Wire up numeric inputs
            row.querySelectorAll('.desc-row input[type="number"]').forEach(inp => {
              inp.addEventListener('input', () => {
                syncBitCheckboxes(inp);
                onAxisChange(param.key, inp);
              });
            });
            // Wire up bit checkboxes
            row.querySelectorAll('input[data-bit]').forEach(cb => {
              cb.addEventListener('change', () => {
                const numInput = cb.closest('.desc-row').querySelector('input[type="number"]');
                onBitChange(param.key, numInput, cb);
              });
            });
            continue;
          }
          // Axis multi-row param: full-width block — header then all axes in one nowrap row
          row.className = 'param-row has-axes';
          const axisHtml = param.axisRows.map((ax, i) => {
            const axId = axisInputId(param.key, i);
            const lbl = ax.axisLabel || `#${i + 1}`;
            const val = displayAxisValue(ax, param.type);
            return `<div class="axis-cell"><span class="axis-lbl" title="${escapeHtml(ax.comment || '')}">${escapeHtml(lbl)}</span>`
              + `<input type="number" id="${axId}" value="${escapeHtml(val)}" step="${step}" ${disabled} class="${lockCls}" `
              + `data-key="${escapeHtml(param.key)}" data-axis="${i}"></div>`;
          }).join('');
          const descHdrB = escapeHtml(param.description || '');
          row.innerHTML = `
            <div class="param-header-row">
              <span class="param-key" title="${escapeHtml(param.key)}">${escapeHtml(param.key)}</span>
              ${descHdrB ? `<span class="param-desc-inline"> — ${descHdrB}</span>` : ''}
            </div>
            <div class="axis-values">${axisHtml}</div>`;
          body.appendChild(row);
          row.querySelectorAll('.axis-cell input').forEach(inp => {
            inp.addEventListener('input', () => onAxisChange(param.key, inp));
          });
          continue;
        }

        const rawVal = (param.value || '').trim();
        const isStringParam = rawVal.startsWith('"') || rawVal.endsWith('"');
        const inputType = isStringParam ? 'text' : 'number';
        const inputVal = isStringParam ? rawVal.replace(/^"|"$/g, '') : displayValue(param);
        const unitDisplay = isStringParam ? '' : unit;
        row.className = 'param-row mk-grid';
        const descHdrC = escapeHtml(param.description || '');
        row.innerHTML = `
          <div class="param-label">
            <span class="param-key" title="${escapeHtml(param.key)}">${escapeHtml(param.key)}</span>
            ${descHdrC ? `<span class="param-desc-inline">${descHdrC}</span>` : ''}
          </div>
          <div class="param-value"><input type="${inputType}" id="${id}" value="${escapeHtml(inputVal)}" ${inputType === 'number' ? `step="${step}"` : ''} ${disabled} class="${lockCls}" data-key="${escapeHtml(param.key)}" style="${isStringParam ? 'max-width:none;width:100%;' : ''}"></div>
          <div class="param-unit" id="unit-${id}">${unitDisplay}</div>`;
        body.appendChild(row);
        row.querySelector('input').addEventListener('input', (e) => onParamChange(param.key, e.target));
      }
      groupDiv.appendChild(header);
      groupDiv.appendChild(body);
      container.appendChild(groupDiv);
    }
  }

  function onAxisChange(key, inputEl) {
    userEditedParams.add(key);
    hasUnsavedChanges = true;
    document.getElementById('save-button').disabled = false;
    document.getElementById('reset-button').disabled = false;
    const orig = originalValues[key];
    if (orig) {
      try {
        const arr = JSON.parse(orig);
        const idx = parseInt(inputEl.dataset.axis, 10);
        inputEl.classList.toggle('changed-value', arr[idx] !== inputEl.value);
      } catch (e) { /* ignore */ }
    }
  }

  function onParamChange(key, inputEl) {
    userEditedParams.add(key);
    hasUnsavedChanges = true;
    document.getElementById('save-button').disabled = false;
    document.getElementById('reset-button').disabled = false;
    const orig = originalValues[key];
    inputEl.classList.toggle('changed-value', orig !== undefined && inputEl.value !== String(orig));
  }

  function storeOriginalValues() {
    originalValues = {};
    for (const [key, param] of Object.entries(parsedParams)) {
      if (param.isPerAxis && param.axisRows) {
        originalValues[key] = JSON.stringify(
          param.axisRows.map(r => displayAxisValue(r, getParameterType(key)))
        );
      } else {
        originalValues[key] = displayValue({ ...param, type: getParameterType(key) });
      }
    }
  }

  function toggleGroup(header) {
    const body = header.nextElementSibling;
    body.style.display = body.style.display === 'block' ? 'none' : 'block';
  }

  function expandAllGroups() {
    document.querySelectorAll('.param-group-body').forEach(b => { b.style.display = 'block'; });
  }

  function collapseAllGroups() {
    document.querySelectorAll('.param-group-body').forEach(b => { b.style.display = 'none'; });
  }

  function formatNumberForSave(value) {
    const n = parseFloat(value);
    if (isNaN(n)) return String(value);
    return Number.isInteger(n) ? String(n) : n.toFixed(4);
  }

  function valueForSave(key) {
    const param = parsedParams[key];
    if (param?.isPerAxis && param.axisRows) {
      return getAxisValuesForSave(key).join(', ');
    }
    const inputEl = document.getElementById(paramDomId(key));
    if (!inputEl) return param.value;
    // String parameters: re-add quotes stripped during display
    const rawVal = (param.value || '').trim();
    if (rawVal.startsWith('"') || rawVal.endsWith('"')) {
      return `"${inputEl.value}"`;
    }
    let v = parseFloat(inputEl.value);
    if (isNaN(v)) return param.value;
    const typ = getParameterType(key);
    if (typ === 'length' && displayUnits !== machineUnits) {
      v = convertValue(v, displayUnits, machineUnits);
    }
    return formatNumberForSave(v);
  }

  function rebuildLine(meta, newValue) {
    const { lineKind, key, indexPart, description, rawLine } = meta;
    if (lineKind === 'mkconst') {
      if (meta.isPerAxis && meta.axisRows) {
        const vals = getAxisValuesForSave(meta.key);
        if (vals) return rebuildAxisBlock(meta, vals).join('\n'); // caller handles split
      }
      if (meta.rawLines && meta.rawLines.length > 1) {
        const first = meta.rawLines[0];
        const lead = first.match(/^(MK_[\w]+)(\s+)/);
        const prefix = lead ? lead[1] + lead[2] : key + ' ';
        const tail = meta.rawLines[meta.rawLines.length - 1];
        const tailComment = (tail.match(/(\/\*.*?\*\/)\s*$/) || [])[1] || '';
        return prefix + newValue + ';' + (tailComment ? '   ' + tailComment : '');
      }
      const m = rawLine.match(/^(\S+)(\s+)([^;]+)(;.*)$/);
      if (m) return m[1] + m[2] + newValue + m[4];
      return `${key} ${newValue};`;
    }
    if (lineKind === 'pipe') {
      if (indexPart) {
        return `${key.padEnd(40)}|${indexPart}|${String(newValue).padStart(10)}|${description}`;
      }
      const parts = rawLine.split('|');
      if (parts.length >= 3) {
        parts[1] = String(newValue);
        return parts.join('|');
      }
      return `${key}|${newValue}`;
    }
    if (lineKind === 'keyeq') return `${key}=${newValue}`;
    if (lineKind === 'tab') {
      const idx = rawLine.indexOf('\t');
      return idx >= 0 ? `${key}\t${newValue}` : `${key}\t${newValue}`;
    }
    if (lineKind === 'ws') {
      const m = rawLine.match(/^(\S+)(\s+)(.*)$/);
      if (m) return m[1] + m[2] + newValue;
      return `${key} ${newValue}`;
    }
    return `${key}=${newValue}`;
  }

  function generateChangeHistory() {
    const now = formatTimestamp(new Date());
    const changes = [];
    for (const key of userEditedParams) {
      const oldV = originalValues[key];
      const newV = valueForSave(key);
      if (oldV !== newV) {
        changes.push({ timestamp: now, key, oldValue: oldV, newValue: newV, isUserEdit: true });
      }
    }
    return changes;
  }

  function saveFile() {
    if (!originalFileContent) {
      showAlert('No content to save', 'error');
      return;
    }
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${fileName.replace(/\.mk$/i, '')}_backup_${timestamp}.mk`;
      createBackup(backupName, originalFileContent);

      const lines = originalFileContent.split(/\r\n|\r|\n/);
      const userChanges = generateChangeHistory();
      const updated = new Set();
      const out = [];
      let skipUntil = -1;

      for (let i = 0; i < lines.length; i++) {
        if (i <= skipUntil) continue;
        const raw = lines[i];
        const line = raw.trim();
        const kind = classifyLine(line);
        let replaced = false;
        if (kind === 'pipe' || kind === 'keyeq' || kind === 'tab' || kind === 'ws' || kind === 'mkconst' || /^MK_[\w]+\s/.test(line)) {
          for (const [key, meta] of Object.entries(parsedParams)) {
            if (meta.lineIndex === i && userEditedParams.has(key)) {
              if (meta.isPerAxis && meta.axisRows) {
                const block = rebuildAxisBlock(meta, getAxisValuesForSave(key));
                block.forEach(l => out.push(l));
                skipUntil = meta.lineEnd;
              } else {
                out.push(rebuildLine(meta, valueForSave(key)));
              }
              replaced = true;
              break;
            }
          }
        }
        if (!replaced) out.push(raw);
      }

      const appendHistory = document.getElementById('append-history').checked;
      if (appendHistory && userChanges.length) {
        if (!out.some(l => l.includes('Parameter Change History'))) {
          out.push('; Parameter Change History');
        }
        for (const c of userChanges) {
          out.push(`; [${c.timestamp}] ${c.key} ${c.oldValue} -> ${c.newValue}`);
          changeHistory.push(c);
        }
        renderChangeHistory();
      }

      const finalContent = out.join('\r\n');
      if (embeddedSaveCallback) embeddedSaveCallback(finalContent, fileName, originalFileContent);
      else downloadText(finalContent, fileName);
      originalFileContent = finalContent;
      parseMkFile(finalContent);
      organizeParametersIntoGroups();
      displayParameters();
      storeOriginalValues();
      userEditedParams.clear();
      hasUnsavedChanges = false;
      document.getElementById('save-button').disabled = true;
      document.getElementById('reset-button').disabled = true;
      showAlert('File saved successfully', 'success');
    } catch (err) {
      showAlert(`Error saving file: ${err.message}`, 'error');
    }
  }

  function resetChanges() {
    if (!confirm('Reset all changes to last loaded/saved state?')) return;
    parseMkFile(originalFileContent);
    organizeParametersIntoGroups();
    displayParameters();
    storeOriginalValues();
    userEditedParams.clear();
    hasUnsavedChanges = false;
    document.getElementById('save-button').disabled = true;
    document.getElementById('reset-button').disabled = true;
  }

  function downloadText(content, name) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    fileName = file.name;
    const reader = new FileReader();
    reader.onload = ev => loadContent(ev.target.result, fileName);
    reader.readAsText(file, 'windows-1252');
  }

  function loadContent(content, name) {
    originalFileContent = content;
    fileName = name || fileName;
    document.getElementById('file-status').textContent = fileName;
    const n = parseMkFile(content);
    if (!n) {
      showAlert('No parameters found — check file format', 'error');
      return;
    }
    organizeParametersIntoGroups();
    displayParameters();
    storeOriginalValues();
    userEditedParams.clear();
    document.getElementById('save-button').disabled = true;
    document.getElementById('reset-button').disabled = true;
    applyLockState();
    showAlert(`Loaded ${n} parameters from ${fileName}`, 'success');
  }

  async function loadSampleData() {
    try {
      const resp = await fetch('samples/cls2115_sample.mk');
      if (!resp.ok) throw new Error('fetch failed');
      loadContent(await resp.text(), 'cls2115_sample.mk');
    } catch (e) {
      if (typeof MK_SAMPLE_MK !== 'undefined' && MK_SAMPLE_MK) {
        loadContent(MK_SAMPLE_MK, 'cls2115_sample.mk');
      } else {
        showAlert('Open samples/cls2115_sample.mk via Open File (browser blocks fetch on file://)', 'error');
      }
    }
  }

  function showAlert(message, type) {
    ['load-warning', 'save-success', 'error-message', 'unit-conversion-info'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    const map = { success: 'save-success', error: 'error-message', warning: 'load-warning', info: 'unit-conversion-info' };
    const el = document.getElementById(map[type] || 'error-message');
    if (el) {
      if (type === 'error') document.getElementById('error-text').textContent = message;
      else if (type === 'info') document.getElementById('conversion-info-text').textContent = message;
      else el.innerHTML = type === 'success'
        ? `<strong>Success!</strong> ${escapeHtml(message)}`
        : el.innerHTML;
      el.style.display = 'block';
      if (type === 'success' || type === 'error') {
        setTimeout(() => { el.style.display = 'none'; }, 5000);
      }
    }
  }

  function renderChangeHistory() {
    const tbody = document.getElementById('change-history-body');
    tbody.innerHTML = '';
    changeHistory.forEach(entry => {
      const row = document.createElement('tr');
      row.innerHTML = `<td>${escapeHtml(entry.timestamp)}</td><td>${escapeHtml(entry.key)}</td><td>${escapeHtml(entry.oldValue)}</td><td>${escapeHtml(entry.newValue)}</td>`;
      tbody.appendChild(row);
    });
  }

  function formatTimestamp(d) {
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function createBackup(name, content) {
    backups.push({ name, content, timestamp: new Date().toISOString() });
    updateBackupList();
  }

  function updateBackupList() {
    const list = document.getElementById('backup-list');
    if (!backups.length) {
      list.innerHTML = '<div class="backup-item">No backups yet</div>';
      return;
    }
    list.innerHTML = backups.map(b => `
      <div class="backup-item">
        <span class="backup-date">${new Date(b.timestamp).toLocaleString()}</span>
        <div class="backup-actions">
          <button class="small-btn btn-primary" onclick="MkEditor.downloadBackup('${escapeJsStringSingle(b.name)}')">Download</button>
          <button class="small-btn btn-warning" onclick="MkEditor.restoreBackup('${escapeJsStringSingle(b.name)}')">Restore</button>
        </div>
      </div>`).join('');
  }

  function downloadBackup(name) {
    const b = backups.find(x => x.name === name);
    if (b) downloadText(b.content, b.name);
  }

  function restoreBackup(name) {
    const b = backups.find(x => x.name === name);
    if (b && confirm('Restore this backup? Unsaved changes will be lost.')) loadContent(b.content, b.name);
  }

  function updateUnitSettings() {
    machineUnits = document.getElementById('machine-units').value;
    displayUnits = document.getElementById('display-units').value;
    document.getElementById('display-unit-text').textContent = displayUnits === 'mm' ? 'millimeters (mm)' : 'inches (in)';
    document.getElementById('machine-unit-text').textContent = machineUnits === 'mm' ? 'millimeters (mm)' : 'inches (in)';
    const needs = machineUnits !== displayUnits;
    const info = document.getElementById('unit-conversion-info');
    if (needs) {
      document.getElementById('conversion-info-text').textContent =
        `Values shown in ${displayUnits}; saved in ${machineUnits}.`;
      info.style.display = 'block';
    } else info.style.display = 'none';
    if (Object.keys(parsedParams).length) {
      displayParameters();
      storeOriginalValues();
    }
  }

  function toggleTheme() {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', next);
    document.getElementById('theme-toggle').textContent = next === 'light' ? '☀️' : '🌙';
    localStorage.setItem('mk-editor-theme', next);
  }

  function loadSavedTheme() {
    const t = localStorage.getItem('mk-editor-theme');
    if (t) {
      document.documentElement.setAttribute('data-theme', t);
      document.getElementById('theme-toggle').textContent = t === 'light' ? '☀️' : '🌙';
    }
  }

  function applyLockState() {
    document.querySelectorAll('.param-value input, .axis-cell input').forEach(inp => {
      inp.disabled = isLocked;
      inp.classList.toggle('locked', isLocked);
    });
    const btn = document.getElementById('lock-toggle');
    btn.textContent = isLocked ? '🔒' : '🔓';
    btn.classList.toggle('locked', isLocked);
  }

  function toggleLock() {
    if (isLocked) {
      const pw = prompt('Enter password to unlock parameters:');
      if (pw !== PASSWORD) {
        showAlert('Incorrect password', 'error');
        return;
      }
      isLocked = false;
    } else {
      isLocked = true;
    }
    applyLockState();
  }

  // Called by an embedding parent (technician's session viewer): the password
  // lock exists to stop end users from fat-fingering settings, but technicians
  // here are already authenticated by the platform itself, so it's just an
  // extra click. Also hides the local "Open .mk File" / "Load Sample" controls,
  // which don't apply when content is fed in via loadContent() instead. And
  // unchecks "Append changes as comments" — the embedding parent appends its
  // own Parameter Change History centrally (covers plain-text-mode saves and
  // restores too, neither of which go through this editor's own saveFile()),
  // so leaving this on here would double the history entries.
  function enableEmbeddedMode() {
    isLocked = false;
    applyLockState();
    const lockBtn = document.getElementById('lock-toggle');
    if (lockBtn) lockBtn.style.display = 'none';
    const openWrap = document.getElementById('open-file-wrapper');
    if (openWrap) openWrap.style.display = 'none';
    const sampleBtn = document.getElementById('load-sample-btn');
    if (sampleBtn) sampleBtn.style.display = 'none';
    const appendHistory = document.getElementById('append-history');
    if (appendHistory) appendHistory.checked = false;
  }

  function setupDragDrop() {
    const zone = document.getElementById('file-status-panel');
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && /\.mk$/i.test(file.name)) {
        const r = new FileReader();
        r.onload = ev => loadContent(ev.target.result, file.name);
        r.readAsText(file);
      }
    });
  }

  function init() {
    loadSavedTheme();
    document.getElementById('file-input').addEventListener('change', handleFileSelect);
    document.getElementById('machine-units').addEventListener('change', updateUnitSettings);
    document.getElementById('display-units').addEventListener('change', updateUnitSettings);
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    document.getElementById('lock-toggle').addEventListener('click', toggleLock);
    document.getElementById('param-filter').addEventListener('input', e => {
      filterText = e.target.value.trim();
      displayParameters();
    });
    document.getElementById('load-warning').style.display = 'block';
    setupDragDrop();
  }

  document.addEventListener('DOMContentLoaded', init);

  window.MkEditor = {
    saveFile, resetChanges, expandAllGroups, collapseAllGroups,
    loadSampleData, downloadBackup, restoreBackup,
    loadContent,
    setSaveHandler: (fn) => { embeddedSaveCallback = fn; },
    enableEmbeddedMode
  };
})();
