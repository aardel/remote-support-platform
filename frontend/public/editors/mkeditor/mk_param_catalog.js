// Built by mk_build_catalog.py — proper sections + English descriptions
const MK_CATALOG_VERSION = 111;
const MK_SECTION_ORDER = [
  "0. \u00b7 Test Settings",
  "1. \u00b7 Hardware Configuration",
  "2. \u00b7 Software Configuration",
  "3. \u00b7 Axis Settings",
  "3.1 \u00b7 Axis Commissioning",
  "4.0 \u00b7 Controller Tuning",
  "5.0 \u00b7 Reference Point Homing",
  "6.0 \u00b7 Axis Limits",
  "7.0 \u00b7 Path / Trajectory Limits",
  "8.0 \u00b7 Extension Cards",
  "9.0 \u00b7 Technology Settings",
  "9.1 \u00b7 Technology P-Field Mapping",
  "10.0 \u00b7 PLC Settings"
];
const MK_DEFAULT_GROUPS = {
  "0. · Test Settings": {
    "paramTypes": {
      "MK_SPS_DUMMY": "none",
      "MK_TEST_OHNEMECHANIK": "none"
    }
  },
  "1. · Hardware Configuration": {
    "paramTypes": {
      "MK_ACHSENART": "none",
      "MK_APPLACHSIDX": "none",
      "MK_APPLSPINDELIDX": "speed",
      "MK_CANDRIVES": "none",
      "MK_ESABKONF": "none",
      "MK_HARDKONF": "none",
      "MK_SPINDELART": "speed",
      "MK_VIRTUALDRIVES": "none"
    }
  },
  "2. · Software Configuration": {
    "paramTypes": {
      "MK_CANOPEN_BAUDRATE": "none",
      "MK_CONST_REL_INCH": "none",
      "MK_CONST_REL_MM": "none",
      "MK_DELTAT": "time",
      "MK_DRUCKER": "none",
      "MK_DRUCKER_V24MODE": "none",
      "MK_EDIT_SOFTKEYS": "none",
      "MK_EPSILONGRAD": "angle",
      "MK_EPSILONMM": "length",
      "MK_FEHLERRESTART": "none",
      "MK_FIT_PRO_GIT": "none",
      "MK_FLOPPYDISK": "none",
      "MK_HANDRADFILTER": "time",
      "MK_HEADERANZAHL": "none",
      "MK_KANALANZAHL": "none",
      "MK_KARTESISCH_ACHSNR": "none",
      "MK_KONTURFEHLER": "length",
      "MK_KUNDE": "none",
      "MK_LAH_GRENZWINKEL": "angle",
      "MK_LAH_RUECKLAUFGRENZE": "none",
      "MK_LAH_VORLAUFTIEFE": "none",
      "MK_MASCH_POLAR_KART": "angle",
      "MK_METRISCH": "none",
      "MK_NCPROG_NICHT_INS_EEPROM": "none",
      "MK_NCPROG_OHNE_KOMMENTARE": "none",
      "MK_NULLPUNKTE_SPEICHERN": "none",
      "MK_OVERRIDEMAX": "none",
      "MK_PASSWORT": "none",
      "MK_PFELDGROESSE": "none",
      "MK_POLAR_ACHSNR": "angle",
      "MK_RADIUS_B_BEWERTUNG": "none",
      "MK_S0T0_VERSATZ_ERLAUBT": "none",
      "MK_SPRACHE": "none",
      "MK_SPS_DATENGROESSE": "none",
      "MK_SPS_SPEICHERGROESSE": "none",
      "MK_SPV_SPEICHERGROESSE": "none",
      "MK_S_VERSATZSPERRE": "none",
      "MK_TEACHHEADER": "none",
      "MK_TEACHSTELLEN": "none",
      "MK_VOREINSTELLUNG": "none"
    }
  },
  "3. · Axis Settings": {
    "paramTypes": {
      "MK_ACHSEINGAENGE": "none",
      "MK_GENAUHALTZEIT": "time",
      "MK_HANDRADFAKTOR": "none",
      "MK_IMPULSE": "none",
      "MK_MASSSTAB": "none",
      "MK_SCHLEPPABSTAND": "none",
      "MK_SCHLEPPGENAUHALT": "time",
      "MK_SCHLEPPZAEHLER": "none",
      "MK_SPINDELUMKEHRSPIEL": "speed",
      "MK_SSIKONF": "none",
      "MK_SW_ENDS_MIT_RAMPE": "length",
      "MK_SYNCHRONABWEICHUNG": "none",
      "MK_SYNCHRONOFFSET": "length",
      "MK_TEACHACHSE": "none",
      "MK_UA0": "none",
      "MK_UA12": "none",
      "MK_US": "none",
      "MK_WEG": "length"
    }
  },
  "3.1 · Axis Commissioning": {
    "paramTypes": {
      "MK_GRUNDOFFSET": "length",
      "MK_SW_ENDS_MINUS": "length",
      "MK_SW_ENDS_PLUS": "length"
    }
  },
  "4.0 · Controller Tuning": {
    "paramTypes": {
      "MK_DRIFTABGLEICH": "none",
      "MK_KB": "none",
      "MK_KF": "none",
      "MK_KP": "none",
      "MK_REGLER_MODE": "none",
      "MK_T2": "none",
      "MK_TN": "none",
      "MK_TV": "none"
    }
  },
  "5.0 · Reference Point Homing": {
    "paramTypes": {
      "MK_REF_BMAX1": "none",
      "MK_REF_BMAX2": "none",
      "MK_REF_RICHTUNG_UND_FOLGE": "none",
      "MK_REF_TYP": "none",
      "MK_REF_VMAX1": "speed",
      "MK_REF_VMAX2": "speed"
    }
  },
  "6.0 · Axis Limits": {
    "paramTypes": {
      "MK_BESCHL": "none",
      "MK_BREMS": "none",
      "MK_MODVMAX": "speed",
      "MK_QUICKSTOP": "time",
      "MK_SPINDELMAX": "speed",
      "MK_T_BESCHL": "time",
      "MK_VMAX": "speed"
    }
  },
  "7.0 · Path / Trajectory Limits": {
    "paramTypes": {
      "MK_BAHNBESCHL": "none",
      "MK_BAHNBREMS": "none",
      "MK_T_BAHNBESCHL": "time",
      "MK_VBAHNMAX": "none"
    }
  },
  "8.0 · Extension Cards": {
    "paramTypes": {
      "MK_MESS_AUFLOESUNG": "length"
    }
  },
  "9.0 · Technology Settings": {
    "paramTypes": {
      "MK_GEWINDE_VMAX": "speed",
      "MK_MFKT_UPR_TABELLE": "none",
      "MK_SPINDELDREHZAHLMAX": "speed",
      "MK_SPINDELDREHZAHLMIN": "speed",
      "MK_SPINDELMAX_GS1": "speed",
      "MK_SPINDELMAX_GS2": "speed",
      "MK_SPINDELMAX_GS3": "speed",
      "MK_WLK_C_GRENZWINKEL": "angle",
      "MK_X_WINKEL": "angle"
    }
  },
  "9.1 · Technology P-Field Mapping": {
    "paramTypes": {
      "MK_TECHNOLOGIEDATEN1": "none",
      "MK_TECHNOLOGIEDATEN2": "none",
      "MK_TECHNOLOGIEDATEN3": "length",
      "MK_TECHNOLOGIEDATEN4": "length"
    }
  },
  "10.0 · PLC Settings": {
    "paramTypes": {
      "MK_DW224_255": "none"
    }
  }
};
const MK_PARAM_DESCRIPTIONS = {
  "MK_ACHSEINGAENGE": "Limit switch / axis input assignment (bit-coded)",
  "MK_ACHSENART": "Axis type definition (bit-coded)",
  "MK_APPLACHSIDX": "Application axis order (internal axis index sequence)",
  "MK_APPLSPINDELIDX": "Spindle index assignment to axis channels",
  "MK_BAHNBESCHL": "Path acceleration ramp [m/s²]",
  "MK_BAHNBREMS": "Path deceleration ramp [m/s²]",
  "MK_BESCHL": "Axis acceleration ramp [m/s²] or [rpm/s]",
  "MK_BREMS": "Axis deceleration ramp [m/s²] or [rpm/s]",
  "MK_CANDRIVES": "CAN node assignment per application axis (CAN2)",
  "MK_CANOPEN_BAUDRATE": "CAN1 bitrate for CANopen (0 = SLIO)",
  "MK_CONST_REL_INCH": "Input resolution in inch system (relative to 1 inch)",
  "MK_CONST_REL_MM": "Input resolution in metric system (relative to 1 mm)",
  "MK_DELTAT": "Coarse interpolation cycle time [ms]",
  "MK_DRIFTABGLEICH": "Analog axis interface offset trim [mV]",
  "MK_DRUCKER": "Printer interface number (0 = none)",
  "MK_DRUCKER_V24MODE": "Printer serial port settings (baud etc.)",
  "MK_DW224_255": "PLC DW255 bit field — machine options for SPS (see file comment)",
  "MK_EDIT_SOFTKEYS": "Softkey editor layout string",
  "MK_EPSILONGRAD": "Angle tolerance [degrees]",
  "MK_EPSILONMM": "Position tolerance for arcs etc. [mm]",
  "MK_ESABKONF": "Sercos node assignment per application axis",
  "MK_FEHLERRESTART": "1 = allow restart after error",
  "MK_FIT_PRO_GIT": "Fine interpolation cycles per coarse cycle",
  "MK_FLOPPYDISK": "Floppy drive interface number (0 = none)",
  "MK_GENAUHALTZEIT": "Time [s] lag must stay below threshold for precise stop",
  "MK_GEWINDE_VMAX": "Thread grinding max speed",
  "MK_GRUNDOFFSET": "Machine zero / datum offset per axis [mm or deg]",
  "MK_HANDRADFAKTOR": "Handwheel sensitivity factor per axis",
  "MK_HANDRADFILTER": "Handwheel smoothing filter time constant [ms]",
  "MK_HARDKONF": "Hardware axis mapping: application axis index → axis interface slot",
  "MK_HEADERANZAHL": "Max simultaneous NC program headers managed",
  "MK_IMPULSE": "Encoder pulses per revolution per axis (after quadrature)",
  "MK_KANALANZAHL": "Number of NC channels",
  "MK_KARTESISCH_ACHSNR": "Cosine axis number in Cartesian system",
  "MK_KB": "Acceleration feed-forward factor",
  "MK_KF": "Feed-forward factor (per axis row)",
  "MK_KONTURFEHLER": "Maximum allowed path/contour error [mm]",
  "MK_KP": "Speed controller gain Kv (per axis row)",
  "MK_KUNDE": "Customer-specific extension selector (empty = standard)",
  "MK_LAH_GRENZWINKEL": "Corner angle above which mandatory stop-before-turn applies",
  "MK_LAH_RUECKLAUFGRENZE": "Blocks to retract along contour on interrupt",
  "MK_LAH_VORLAUFTIEFE": "Look-ahead buffer depth [blocks] per channel",
  "MK_MASCH_POLAR_KART": "1 = polar machine coordinate system",
  "MK_MASSSTAB": "Scale factor for displayed axis values",
  "MK_MESS_AUFLOESUNG": "Analog measurement resolution [mm/V]",
  "MK_METRISCH": "1 = metric distances/speeds [mm, mm/min]; 0 = imperial",
  "MK_MFKT_UPR_TABELLE": "M-function table for program interrupt handling",
  "MK_MODVMAX": "Modal axis speed at screw pitch = 10",
  "MK_NCPROG_NICHT_INS_EEPROM": "1 = do not store DIN programs in flash PROM",
  "MK_NCPROG_OHNE_KOMMENTARE": "1 = store DIN programs without comments (save flash space)",
  "MK_NULLPUNKTE_SPEICHERN": "1 = auto-save zero points (requires CMOS RAM)",
  "MK_OVERRIDEMAX": "Maximum feed override [0.1%]",
  "MK_PASSWORT": "Password (numeric) required to edit machine constants in diagnostics",
  "MK_PFELDGROESSE": "Parameter field size",
  "MK_POLAR_ACHSNR": "Radius axis number in polar system",
  "MK_QUICKSTOP": "Quick-stop ramp time [ms] (max 1000)",
  "MK_RADIUS_B_BEWERTUNG": "Acceleration scaling on arcs/splines for speed reduction",
  "MK_REF_BMAX1": "Homing ramp to cam [m/s²]",
  "MK_REF_BMAX2": "Homing ramp leaving cam [m/s²]",
  "MK_REF_RICHTUNG_UND_FOLGE": "Homing direction and sequence",
  "MK_REF_TYP": "Reference/homing method type",
  "MK_REF_VMAX1": "Homing speed to cam/switch [m/min]",
  "MK_REF_VMAX2": "Homing speed from null pulse [m/min]",
  "MK_REGLER_MODE": "Servo loop mode (0 = open, etc.)",
  "MK_S0T0_VERSATZ_ERLAUBT": "1 = allow offset of S0 or T0 work coordinate system",
  "MK_SCHLEPPABSTAND": "Max following error (lag) per axis in encoder increments",
  "MK_SCHLEPPGENAUHALT": "Max lag for precise stop",
  "MK_SCHLEPPZAEHLER": "Number of fine interpolation cycles for lag monitoring",
  "MK_SPINDELART": "Spindle handler assignment per spindle",
  "MK_SPINDELDREHZAHLMAX": "Absolute max spindle speed [rpm]",
  "MK_SPINDELDREHZAHLMIN": "Absolute min spindle speed [rpm]",
  "MK_SPINDELMAX": "Spindle speed at 10 V output [rpm]",
  "MK_SPINDELMAX_GS1": "Spindle max speed gear stage 1 at 10 V [rpm]",
  "MK_SPINDELMAX_GS2": "Spindle max speed gear stage 2 at 10 V [rpm]",
  "MK_SPINDELMAX_GS3": "Spindle max speed gear stage 3 at 10 V [rpm]",
  "MK_SPINDELUMKEHRSPIEL": "Spindle backlash compensation",
  "MK_SPRACHE": "Operator panel language (0 = German)",
  "MK_SPS_DATENGROESSE": "PLC data memory size [kB]",
  "MK_SPS_DUMMY": "0 = integrated PLC active, 1 = PLC disabled",
  "MK_SPS_SPEICHERGROESSE": "PLC program memory size [kB]",
  "MK_SPV_SPEICHERGROESSE": "Internal NC program memory size [kB]",
  "MK_SSIKONF": "SSI encoder configuration",
  "MK_SW_ENDS_MINUS": "Negative software limit per axis [mm], relative to datum",
  "MK_SW_ENDS_MIT_RAMPE": "Software limit braking: 0 = hard stop at limit",
  "MK_SW_ENDS_PLUS": "Positive software limit per axis [mm], relative to datum",
  "MK_SYNCHRONABWEICHUNG": "Max allowed sync axis deviation",
  "MK_SYNCHRONOFFSET": "Sync axis null-point offset after homing",
  "MK_S_VERSATZSPERRE": "First protected work coordinate system number (0 = inactive)",
  "MK_T2": "Fine interpolation filter time constant [s]",
  "MK_TEACHACHSE": "Axes enabled for teach-in",
  "MK_TEACHHEADER": "Extra parameters appended to taught NC line",
  "MK_TEACHSTELLEN": "Decimal places used when teaching positions",
  "MK_TECHNOLOGIEDATEN1": "Technology data block 1 (P760 area — blow air, etc.)",
  "MK_TECHNOLOGIEDATEN2": "Technology data block 2 (P770 — rotation vs flatbed offset)",
  "MK_TECHNOLOGIEDATEN3": "Technology data block 3 (P780 — foot switch compare value)",
  "MK_TECHNOLOGIEDATEN4": "Technology data block 4 (P790 — scanner engraving Z)",
  "MK_TEST_OHNEMECHANIK": "Run axis controller without mechanics (ignores position encoder)",
  "MK_TN": "I-term reset time [s] for PID controller",
  "MK_TV": "D-term lead time [s] for PID controller",
  "MK_T_BAHNBESCHL": "Path ramp damping time constant [ms]",
  "MK_T_BESCHL": "Ramp damping time constant [ms]",
  "MK_UA0": "Encoder null-pulse cable break monitoring",
  "MK_UA12": "Encoder signal Ua1/Ua2 cable break monitoring",
  "MK_US": "Encoder dirt signal monitoring (1 = active)",
  "MK_VBAHNMAX": "Max path/traverse speed [m/min]",
  "MK_VIRTUALDRIVES": "Virtual drive assignment per application axis",
  "MK_VMAX": "Max axis speed [m/min] or [rpm]",
  "MK_VOREINSTELLUNG": "G-code preset string applied after reset or program end",
  "MK_WEG": "Lead screw pitch / travel per revolution per axis [mm or deg]",
  "MK_WLK_C_GRENZWINKEL": "Cut/sew: angle below which C-axis snaps instantly",
  "MK_X_WINKEL": "X-axis skew angle in X-Z plane [degrees]"
};
