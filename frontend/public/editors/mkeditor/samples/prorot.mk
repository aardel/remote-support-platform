/*==============================================================
   Maschinenkonstanten fuer ProRot/ENC66
   Version 1.06.01
   AG/St 14.03.2013
================================================================*/
/* --------------
** BITTE BEACHTEN
** --------------
**
** Achsreihenfolge:
** Die interne Reihenfolge der Achsen wird über MK_APPLACHSIDX
** festgelegt. Alle achsbezogenen Maschinenkonstanten müssen in
** dieser Reihenfolge konfiguriert werden.
**
** Maschinenkonfiguration:
** Die Maschinenkonstante MK__DW224_255, am Ende dieser Datei,
** enthält wichtige Informationen für die SPS. Näheres steht im
** Kommentar neben der Maschinenkonstante.
**
*/
/* History:
St 27.02.13   Überarbeitung für ENC66 mit Sercos III
<--->*/

/*----------------------------------*/
/*   0. Testeinstellungen           */
/*----------------------------------*/
MK_TEST_OHNEMECHANIK       0;   /* Achsrechner wird bedient, beachtet aber nicht den istposzaehler */

MK_SPS_DUMMY               0;   /* 0 = mit integrierter SPS, 1 = ohne */


/*----------------------------------*/
/*   1. Hardware - Konfiguration    */
/*----------------------------------*/
/* Zuordnung von Applikationsachsen 0-11 (Wert) zu Achsinterface 0-11 (Zeile) -1 = Achsinterface nicht benutzt */
MK_HARDKONF                3,  /* (W-Achse) */
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1;

/* Zuordnung von Applikationsachsen 0-16 (Wert) zu Sercos-Knoten 1-16  */
MK_ESABKONF                0,   /* (X-Achse) */
                           2,   /* (Z-Achse) */
                           4,   /* (A-Achse) */
                           4,   /* (A1-Achse) */
                           5,   /* (U-Achse [X1] */
                           6,   /* (V-Achse [Z1] */
                           7,   /* (B-Achse) Scannerachse */
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1;

/* Zuordnung von Applikationsachsen 0-16 (Wert) zu CAN-Knoten 1-16 (Zeile) an CAN2 */
MK_CANDRIVES              -1,   /* CAN-Node 1  */
                          -1,   /* CAN-Node 2  */
                          -1,   /* CAN-Node 3  */
                          -1,   /* CAN-Node 4  */
                          -1,   /* CAN-Node 5  */
                          -1,   /* CAN-Node 6  */
                          -1,   /* CAN-Node 7  */
                          -1,   /* CAN-Node 8  */
                          -1,   /* CAN-Node 9  */
                          -1,   /* CAN-Node 10 */
                          -1,   /* CAN-Node 11 */
                          -1,   /* CAN-Node 12 */
                          -1,   /* CAN-Node 13 */
                          -1,   /* CAN-Node 14 */
                          -1,   /* CAN-Node 15 */
                          -1;   /* CAN-Node 16 */

/*Zuordnung von Applikationsachsen 0-11 (Wert) zu virtuellen Achsen */
MK_VIRTUALDRIVES           1,   /* (Y-Achse) */
                          -1,   
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1,
                          -1;

MK_APPLACHSIDX             0,   /* X-Achse */
                           1,   /* Y-Achse */
                           2,   /* Z-Achse */
                          -1,   /* C-Achse */
                           5,   /* U-Achse */
                           6,   /* V-Achse */
                           3,   /* W-Achse (Nozzelnachführung) */
                           4,   /* A-Achse (Gantry-Rotationsachse)*/
                           7,   /* B-Achse (Scanner)                */
                          -1,   /* u-Achse */
                          -1,   /* v-Achse */
                          -1,   /* w-Achse */
                          -1,   /* x-Achse */
                          -1,   /* y-Achse */
                          -1,   /* z-Achse */
                          -1,   /* a-Achse */
                          -1,   /* b-Achse */
                          -1;   /* c-Achse */

MK_APPLSPINDELIDX         -1,   /* Zuornung von Spindeln zu Achskanälen */
                          -1,   /* -1 = Spindel nicht benutzt */
                          -1;

MK_ACHSENART               2,   /* Definition der Achse (bit-codiert)                         */
                           2,   /* Bit 0  : 0 Linearachse, 1 Rotationsachse                   */
                           2,   /* Bit 1  : 0 HW-Endschalter beachten, 1 ignorieren           */
                          12,   /* Bit 3/2: 00 Normalachse, 01 Spindel,                       */
                        1091,   /*          10 Messachse,   11 Spindel & Messachse            */
                           2,   /* Bit 5/4: Einstellung Rotationsachsen (Bit0 = 1)            */
                           2,   /*          00 Rotationsachse mit absoluter Positionierung    */
                           2,   /*          01 Modulo 360>-Achse, Vorzeichen gibt Richtung an */
                           0,   /*          11 Modulo 360>-Achse, kürzester Weg wird gefahren */
                           0,   /* Bit 6  : Gantryachse (Wert 64)                             */
                           0,   /* Bit 7  : Handrad                                           */
                           0,   /* Bit 8  : 0=Referenznocken als Öffner, 1=Schliesser         */
                           0,   /* Bit 9  : 1=Modulo-360°-Synchronachse                       */
                           0,   /* Bit 10 : 1=Absolutgeber (1024 für Syncronausgleich-Abbau)  */
                           0,   /* Bit 13 : 1=Mehrkopfachse  (4096)                           */
                           0;
                     
MK_SPINDELART              1,   /* Zuordnung von Spindelhandlern zu Spindeln */
                           1,   /* 1 = Standard-Spindelhandler */
                           1;


/*-------------------------------------------*/
/*  2.  Software-Konfiguration               */
/*-------------------------------------------*/
MK_VOREINSTELLUNG         "G24;G25;G26 X0 Y0 Z0 A0 U0 V0 B0;G17;G122 X1;G60 X0 E7;G90;G175";  /* für Initialisierung nach Reset oder Programmende */

MK_KUNDE                  "";   /* aktiviert verschiedene Kunden spezifische Erweiterungen */

MK_PASSWORT             4321;   /* Passwort (Nummer) zum Maschinenkonstanten editieren in Diagnose */

MK_SPRACHE                 0;   /* Sprachauswahl bei integrierten Bedientiel 0=deutsch */

MK_FLOPPYDISK              0;   /* Nummer der Schnittstelle an der die Floppy angeschlossen ist, 0 = keine Floppy */

MK_DRUCKER                 0;   /* Nummer der Schnittstelle an der der Drucker angeschlossen ist, 0 = kein Drucker */

MK_DRUCKER_V24MODE      9600,   /* Einstellungen für die Druckerschnittstelle */
                           8,   /* Baudrate, Datenbits, Parity, Stopbits */
                           0,
                           1;

MK_CANOPEN_BAUDRATE        0,   /* CAN1-Bitrate für CAN-Open, bzw. 0 für SLIO */
                        1000;   /* CAN2-Bitrate für CAN-Open-Antriebe */

MK_FEHLERRESTART           0;   /* 1 = Wiederanlauf nach Fehler erlaubt */

MK_S0T0_VERSATZ_ERLAUBT    0;   /* 1 = Verschiebung von S0 oder T0 erlaubt */

MK_S_VERSATZSPERRE         0;   /* Nummer des ersten gschützten Werkstückkoordinatensystems oder 0, falls inaktiv */

MK_EDIT_SOFTKEYS           "GXYZMNCFP=IJRKE:P=()ABDHLOQSTUVW{}%";

MK_TEACHSTELLEN            3;   /* Anzahl der Nachkommastellen, die beim Teachen berücksichtigt werden sollen */

MK_TEACHHEADER             "";  /* Zusatzparameter für geteachte Zeile */

MK_NCPROG_OHNE_KOMMENTARE  1;   /* 1 = DIN-Programme zur Platzersparnis ohne Kommentare im Flash-PROM ablegen */

MK_NCPROG_NICHT_INS_EEPROM 1;   /* 1 = DIN-Programme nicht ins Flash-PROM ablegen */

MK_NULLPUNKTE_SPEICHERN    0;   /* 1 = Nullpunkte automatisch speichern (nur wenn CMOS-RAM vorhanden) */

MK_METRISCH                0;   /* 1 = Weg- und Geschwindigkeitseingaben im metrischen System [mm] bzw. [mm/min] */
                                /* 0 = Weg- und Geschwindigkeitseingaben im inch-System [inch] bzw. [inch/min]   */

MK_CONST_REL_MM          1.0;   /* Eingabeaufloesung im metrischen Masssystem, bezogen auf 1mm */

MK_CONST_REL_INCH       25.4;   /* Eingabeaufloesung im inch Masssystem, bezogen auf 1mm */

MK_OVERRIDEMAX          1000;   /* max. zulaessiger override [0.1%] */

MK_EPSILONMM            0.01;   /* Toleranz bei Positionen (z.B. Kreis) [mm] */

MK_EPSILONGRAD          0.01;   /* Toleranz bei Winkeln [Grad] */

MK_KONTURFEHLER          0.1;   /* maximal zulaessiger Bahnfehler [mm] */

MK_LAH_GRENZWINKEL        15;   /* Übergangswinkel ab dem zwangsweise bis zum Stillstand gebremst werden soll */

MK_RADIUS_B_BEWERTUNG      1;   /* Beschleunigungsbewertung bei Kreisen oder Spline-Bögen zur Geschwindigkeitsreduzierung */

MK_HANDRADFILTER           0;   /* Filterzeitkonstante für weiche Handradfunktion in [ms] */

MK_MASCH_POLAR_KART        0;   /* 1 = polares Maschinenkoordinatensystem */

MK_KARTESISCH_ACHSNR       0,   /* Nummer der cos-Achse im kart. Koordinatensystem */
                           1,   /* Nummer der sin-Achse im kart. Koordinatensystem */
                          -1;   /* Nummer der tangentialen Nachführachse oder -1 */

MK_POLAR_ACHSNR            0,   /* Nummer der Radius-Achse im pol. Koordinatensystem */
                           1;   /* Nummer der Winkel-Achse im pol. Koordinatensystem */

MK_DELTAT                  1;   /* Grobinterpolationstakt in [ms] */

MK_FIT_PRO_GIT             1;   /* Anzahl der Feininterpolationstakte pro Grobinterpolationstakt  */


/*----------------------------------------------------------------*/
/* !!! ACHTUNG    ACHTUNG    ACHTUNG   ACHTUNG   ACHTUNG      !!! */
/* !!! die folgenden 5 MK's werden erst nach dem n³chsten     !!! */
/* !!! Hochlaufen der Steuerung nach der MK-Übertragung aktiv !!! */
/*----------------------------------------------------------------*/
MK_KANALANZAHL             1;   /* Anzahl der NC-Kanäle */

MK_PFELDGROESSE         4096;   /* Parameterfeldgrösse */

MK_LAH_VORLAUFTIEFE       64,   /* Grösse des Vorlaufpuffers in Sätzen für Kanal 0 und für Kanal 1 */
                           0;

MK_LAH_RUECKLAUFGRENZE     4,   /* Anzahl der Sätze die auf der Kontur zurückgefahren */
                           0;   /* werden können für Kanal 0 und Kanal 1 */

MK_SPV_SPEICHERGROESSE  2000;   /* Grösse des internen Programmspeichers in KByte */

MK_HEADERANZAHL          100;   /* max. Anzahl gleichzeitig zu verwaltender NC-Programme */

MK_SPS_SPEICHERGROESSE   128;   /* Größe des SPS-Programmspeichers in KByte */

MK_SPS_DATENGROESSE       32;   /* Größe des SPS-Datenspeichers in KByte */


/*-------------------------------------------*/
/*  3.  Einstellung der Achsen               */
/*-------------------------------------------*/
/* Aufloesung Weggeber */
/* Anzahl Impulse pro [MK_WEG] (nach der Vervierfachung!). */
MK_IMPULSE            200000,   /* (X-Achse) */
                      200000,   /* (Y-Achse) */
                       50000,   /* (Z-Achse) */
                       -1000,   /* (W-Achse) */
                       10000,   /* (A-Achse) */
                      200000,   /* (U-Achse) */
                       50000,   /* (V-Achse) */
                       50000;

/* Angabe in [mm] oder [Grad],[WEG] bei dem der Achsrechner (!) Anzahl [MK_IMPULSE] */
MK_WEG                20.000,   /* (X-Achse) */ 
                      20.000,   /* (Y-Achse) */
                       5.000,   /* (Z-Achse) */ 
                           1,   /* (W-Achse) */
                           1,   /* (A-Achse) */ 
                      20.000,   /* (U-Achse) */ 
                       5.000,   /* (V-Achse) */ 
                       5.000;   /* B-Achse (Scanner) */

/* Maximaler Schleppabstand in Istwertgeber-Incrementen  */
MK_SCHLEPPABSTAND       2000,   
                        2000,   
                        1000,
                       32000,
                        2000,
                        2000,
                        1000,
                        1000;

MK_SCHLEPPZAEHLER          1,   /* Anzahl der Feininterpolationstakte */
                           1,   /* in denen der max. Schleppabstand */
                           1,   /* überschritten werden darf bis ein */
                           1,   /* Schleppfehler gemeldet wird */
                           1,
                           1,
                           1,
                           1;

MK_SCHLEPPGENAUHALT     0.01,   /* Max. Schleppabstand für Genauhalt */
                        0.01,   /* mit Schleppabstandsüberwachung */
                        0.01,   /* in [mm] bzw. [Grad] */
                        0.01,
                        0.01,
                        0.01,
                        0.01,
                        0.01;

MK_GENAUHALTZEIT           0,   /* Zeit [s] in der der Schleppabstand kleiner */
                           0,   /* als MK_SCHLEPPGENAUHALT sein mu  */
                           0,
                           0,
                           0,
                           0,
                           0,
                           0;

MK_SSIKONF                 0,   /* Konfiguration von SSI-Gebern */
                           0,   /* Bit 0-6: Anzahl der Signifikanten Bits (12-32) */
                           0,   /* Bit 7  : 1=Binär-Code, 0=Gray-Code */
                           0,
                           0,
                           0,
                           0,
                           0;

MK_ACHSEINGAENGE        2134,   /* Zuordnung der Endschalter zu den Achseing³ngen */
                        1234,   /* 1234                                           */
                        1234,   /* üüü· Eingangsnummer des Reserveeingangs        */
                        1234,   /* üü·_ Eingangsnummer des Referenznockens        */
                        1234,   /* ü·__ Eingangsnummer des neg. Endschalters      */
                        1234,   /* ·___ Eingangsnummer des pos. Endschalters      */
                        1234,
                        1234;
                  
MK_US                      0,   /* Ùberwachung des Weggeberschmutzsignals 1 = Ùberwachung aktiv, 0 = inaktiv */
                           0,  
                           0,
                           0,
                           0,
                           0,
                           0,
                           0;

MK_UA0                     1,   /* Kabelbruchüberwachung des Weggebernullimpulses 1 = Ùberwachung aktiv, 0 = inaktiv */
                           1,
                           1,
                           1,
                           1,
                           1,
                           1,
                           1;

MK_UA12                    1,   /* Kabelbruchüberwachung der Weggebersignale Ua1 und Ua2  0 = inaktiv, 1 = Ùberwachung aktiv, 2 = einmalige Störung ignorieren */
                           1,   
                           1,  
                           1,
                           1,
                           1,
                           1,
                           1;

MK_TEACHACHSE              1,   /* Markierung der Achsen die beim Teachen */
                           1,   /* über die Teach-In-Box übernommen werden */
                           1,   /* sollen */
                           1,
                           1,
                           1,
                           1,
                           1;

MK_MASSSTAB                1,   /* Multiplikationsfaktor fuer den in einem */
                           1,   /* DIN-Satz programmierten Weg             */
                           1,
                           1,
                           1,
                           1,
                           1,
                           1;

MK_HANDRADFAKTOR           1,   /* Individueller Bewertungsfaktor für die */
                           1,   /* Handradfunktion, z.B. zur Sonderbehandlung */
                           1,   /* von Rotationsachsen */
                           1,
                           1,
                           1,
                           1,
                           1;

MK_SYNCHRONOFFSET          0,   /* Abstand der Maschinennullpunkte zweier Synchronachsen nach der Referenzpunktfahrt */
                           0,   
                           0,
                           0,
                           0,
                           0,
                           0,
                           0;

MK_SPINDELUMKEHRSPIEL      0,   /* Spindelumkehrspielkompensation */
                           0,   /* in [mm] bzw. [Grad]            */
                           0,
                           0,
                           0,
                           0,
                           0,
                           0;

MK_SYNCHRONABWEICHUNG     10,   /* Max. erlaubte Synchronabweichung von */
                          10,   /* Synchronachsen in [mm] bzw. [Grad]   */
                          10,
                          10,
                        0.05,
                          10,
                          10,
                          10;

MK_SW_ENDS_MIT_RAMPE       2;   /* 0 = bei SW-Endschalter ohne Rampe bremsen */
                                /* 1 = mit Rampe bremsen                     */
                                /* 2 = mit Vorschau auf Endlage und bremsen mit Rampe */


/*--------------------------------------------------*/
/*  3.1  Einstellung der Achsen bei Inbetriebnahme  */
/*--------------------------------------------------*/
/*LASERCOMB */
/*----------*/
/* Software-Endbegrenzung (-)-Richtung [mm], bezogen auf Grundoffset */
MK_SW_ENDS_MINUS        -401,   /* (X-Achse) */
                       -5000,   /* (Y-Achse) */
                          96,   /* (Z-Achse) */
                      -10000,   /* (W-Achse) */
                        -1.0,   /* (A-Achse) */ 
                          -1,   /* (U-Achse) */
                          88,   /* (V-Achse) */
                        94.5;   /* (B-Achse) */

/* Software-Endbegrenzung (+)-Richtung [mm], bezogen auf Grundoffset */
MK_SW_ENDS_PLUS         3001,   /* (X-Achse) */
                        5000,   /* (Y-Achse) */   
                         406,   /* (Z-Achse) */
                       10000,   /* (W-Achse) */
                       183.0,   /* (A-Achse) */
                      3421.0,   /* (U-Achse) */
                         366,   /* (V-Achse) */
                         374;   /* (B-Achse) */

/* Abstand des Maschinennullpunkts vom Referenzpunkt [mm] bzw. [Grad] */
MK_GRUNDOFFSET         400.15,   /* (X-Achse old 397.7) */
                         0.0,   /* (Y-Achse) */   
                     -406.96,   /* (Z-Achse) */
                         0.0,   /* (W-Achse) */
                       -90.0,   /* (A-Achse) */
                    -3412.90,   /* (U-Achse) */
                     -366.86,   /* (V-Achse) */
                     -374.25;   /* (B-Achse) */


/*-----------------------*/
/* 4.0 Reglereinstellung */
/*-----------------------*/
MK_REGLER_MODE             3,   /* 0 = Regelkreis offen            */
                           3,   /* 1 = reserviert                  */
                           3,   /* 2 = P-Regler                    */
                           4,   /* 3 = P-Regler mit Feed-Forward   */
                           3,   /* 4 = Spindel                     */
                           3,   /* 5 = PID-Regler mit Feed-Forward */
                           3,
                           3;

MK_KP                      1,   /* X: Kv =  */
                           1,   /* Y: Kv =  */
                           1,   /* Z: Kv =  */
                           1,   /* Kv =  */
                           1,   /* Kv =  */
                           1,   /* Kv =  */
                           1,   /* Kv =  */
                           1;   /* */

MK_KF                      0,   /* X- Achse Feed-Forward-Faktor */
                           0,   /* Y- Achse*/
                           0,   /* Z- Achse*/
                           0,   /* */
                           0,   /* */
                           0,   /* */
                           0,   /* */
                           0;   /* */

MK_T2                      0,   /* Filterzeitkonstante für Feininterpolation [s] */
                           0,
                           0,   /* für G234 bei Fokuslagenkorrektur */
                           0,
                           0,
                           0,
                           0,
                           0;

MK_KB                      0,   /* Faktor für Beschleunigungsvorsteuerung */
                           0,
                           0,
                           0,
                           0,
                           0,
                           0,
                           0;

MK_TV                      0,   /* Vorhaltzeit [s] für D-Anteil von PID-Regler (auch für Synchronregelung) */
                           0,
                           0,
                           0,
                           0,
                           0,
                           0,
                           0;

MK_TN                      0,   /* Nachstellzeit [s] für I-Anteil von PID-Regler (auch für Synchronregelung) */
                           0,
                           0,
                           0,
                           0,
                           0,
                           0,
                           0;

MK_DRIFTABGLEICH           0,   /* Offsetjustierung [mV] für analoge Achsinterfaces */
                           0,
                           0,
                           0,
                           0,
                           0,
                           0,
                           0;

                     
/*-------------------------------------------*/
/* 5.0 Einstellungen fuer Referenzpunktfahrt */
/*-------------------------------------------*/
MK_REF_TYP                 0,   /* Art der Referenzpunktfahrt                              */
                           0,   /* 0: mit Nocken und Nullimpuls,                           */
                           0,   /* 1: mit Nocken aber ohne Nullimpuls,                     */
                           2,   /* 2: nur Zaehler nullen mit G74,                          */
                           0,   /* 3: nur Nullimpuls, Nocken gibt die Richtung an,         */
                           0,   /* 4: 2 Nocken, der Reserve-Eingang am ARI dient als zu-   */
                           0,   /*    sätzlicher Referenznocken und wird zuerst angefahren */
                           0;

MK_REF_RICHTUNG_UND_FOLGE  2,   /* Richtung der Achse bei Start der Referenzpunktfahrt     */
                           0,   /* sowie Reihenfolge bei automatischer Referenzpunktfahrt  */
                           1,   /*  0 => Achse ist nicht beteiligt                         */
                           0,   /*  X => pos. Richtung                                     */
                           0,   /* -X => neg. Richtung                                     */
                           2,
                           1,
                           1;

MK_REF_VMAX1               1,   /* Geschwindigkeit zum Nocken [m/min] */
                           1,   /* bzw. [U/min] */
                           1,
                           1,
                           1,
                           1,
                           1,
                           1;

MK_REF_BMAX1               1,   /* Rampe fuer Fahrt zum Nocken [m/sec^2] */
                           1,   /* bzw. [U/sec^2] */
                           1,
                           1,
                           1,
                           1,
                           1,
                           1;

MK_REF_VMAX2               1,   /* Geschwindigkeit vom Nullimpuls [m/min] */
                           1,   /* bzw. [U/min] */
                           1,
                           1,
                           1,
                           1,
                           1,
                           1;

MK_REF_BMAX2               1,   /* Rampe bei Fahrt vom Nocken [m/sec^2] */
                           1,   /* bzw. [U/sec^2]  */
                           1,
                           1,
                           1,
                           1,
                           1,
                           1;


/*-----------------------------*/
/* 6.0 Achsbezogene Grenzwerte */
/*-----------------------------*/
MK_MODVMAX                15,   /* modale Achsgeschwindigkeit bei Schraubver.=10 */
                          15,   /* (Handverfahren) [m/min] bzw. [U/min] */
                           5,
                           1,
                           2,
                          15,
                           5,
                           2;

MK_VMAX                   50,   /* max. Achsgeschwindigkeit [m/min] bzw. [U/min]   */
                          50,   /* bei Schraubver.=15 für X- und Y-Achse eintragen */
                          10,
                           1,
                          15,
                          50,
                          10,
                          10;

MK_BESCHL                  5,   /* Beschleunigungsrampe [m/sec^2] bzw. [U/sec^2] */
                           5,
                           5,
                           1,
                           1,
                           5,
                           5,
                           5;

MK_BREMS                   5,   /* Bremsrampe [m/sec^2] bzw. [U/sec^2] */
                           5,
                           5,
                           1,
                           1,
                           5,
                           5,
                           5;

MK_T_BESCHL               60,   /* Dämpfungszeitkonstante für Beschleunigungs- und Bremsrampen [ms] */
                          60,
                          20,
                           0,
                          60,
                          60,
                          20,
                          20;

MK_QUICKSTOP               0,   /* Bremsrampenzeit in [ms] max.1000ms möglich */
                           0,
                           0,
                           0,
                           0,
                           0,
                           0,
                           0;

MK_SPINDELMAX          10000,   /* Spindeldrehzahl in [U/min] bei 10V */
                           0,
                           0;


/*-----------------------------*/
/* 7.0 Bahnbezogene Grenzwerte */
/*-----------------------------*/
MK_VBAHNMAX               50;   /* max. Bahngeschwindigkeit [m/min] */

MK_BAHNBESCHL            4.0;   /* Beschleunigungsrampe [m/sec^2] */

MK_BAHNBREMS             4.0;   /* Bremsrampe [m/sec^2] */

MK_T_BAHNBESCHL           90;   /* Dämpfungszeitkonstante für Brems- und Beschleunigungsrampen [ms] */


/*-------------------------------------------*/
/* 8.0  Einstellung Zusatzkarten             */
/*-------------------------------------------*/
MK_MESS_AUFLOESUNG       1.0,   /* AuflÉsung der Analog-Messwerte [mm/V] */
                         1.0,
                         1.0,
                         1.0,
                         1.0,
                         1.0,
                         1.0,
                         1.0;

                   
/*------------------------------------------------*/
/* 9.0  Technologie - spezifische Einstellungen   */
/*------------------------------------------------*/
MK_MFKT_UPR_TABELLE        6,   /* Tabelle der M-Funktionen nach denen eine */
                         200,   /* G22 L9000+Mfktnr eingefügt werden soll.  */
                          14,   /* Strahl ein mit Verweilzeit für das Stahlschneiden   */
                         110,   /* Spülen aktivieren */
                          15,   /* Strahl aus mit eventuellem Sichern der Z-Achse */
                           0,
                           0,
                           0,
                           0,
                           0,
                           0,
                           0,
                           0,
                           0,
                           0,
                           0;

MK_WLK_C_GRENZWINKEL      45;   /* Schneiden/Nähen: Winkel bis zum die C-Achse schlagartig zugestellt werden soll */

MK_X_WINKEL                0;   /* Winkel der schräggestellten X-Achse in Grad (X-Z Ebene) */

MK_GEWINDE_VMAX            0;   /* Gewindeschleifen */

MK_SPINDELMAX_GS1          0,   /* Spindeldrehzahl in [U/min] bei 10V für Getriebestufe 1 für Spindeltyp 9 */
                           0,   
                           0;

MK_SPINDELMAX_GS2          0,   /* Spindeldrehzahl in [U/min] bei 10V für Getriebestufe 2 für Spindeltyp 9 */
                           0,   
                           0;

MK_SPINDELMAX_GS3          0,   /* Spindeldrehzahl in [U/min] bei 10V für Getriebestufe 3 für Spindeltyp 9 */
                           0,   
                           0;

MK_SPINDELDREHZAHLMAX  10000,   /* Max. zulässige Spindeldrehzahl in [U/min] nicht bei allen Spindelhandlern berücksichtigt) */
                           0,   
                           0;

MK_SPINDELDREHZAHLMIN      0,   /* Min. zulässige Spindeldrehzahl in [U/min] (nicht bei allen Spindelhandlern berücksichtigt) */
                           0,   
                           0;


/*------------------------------------------------------------*/
/* 9.1  Technologie - spezifische Einstellungen der P-Felder  */
/* Achtung:                                                   */
/* Die Werte werden Maschinespezifisch eingetragen            */
/*------------------------------------------------------------*/
/* Anwendungsspezifische Technologieparameter, die ab P760 im Parameterfeld abgelegt werden */
MK_TECHNOLOGIEDATEN1       1,   /* P760 = Spülluft ein (0 => mit Hautschalter, 1 => mit Maschine ein) */
                          10,   /* P761 = Nachlaufzeit [sec] für Absaugung "alte Version" */
                         2.5,   /* P762 = Kv der Z-Achsenregelung (G231) */
                        5000,   /* P763 = Wartezeit [ms] bis Bezugspunktfahren gelöscht wird, wenn nicht Starttaste gedrückt wird */
			0.85,   /* P764 = Abstand Laserdüse zu Fußunterkante [mm od. inch] */
			0.76,   /* P765 = Abstand Fokuspunkt zu Fußunterkante [mm od. inch] */
                           1,   /* P766 = 0 => ohne Meßzyklus  1 => mit Meßzyklus Auswertung in Prog. 9200 */
                         250,   /* P767 = Ueberbrueckungszeit[ms] bei Ueberwachung Duese/Schuh (DW254) */
                        -15.748,   /* P768 = Zielposition beim Freifahren od. Wechselpos. der X-Achse [mm od. inch] */
                        133.8583;   /* P769 = Zielposition beim Freifahren od. Wechselpos. der U-Achse [mm od. inch] */

/* Anwendungsspezifische Technologieparameter, die ab P770 im Parameterfeld abgelegt werden */
MK_TECHNOLOGIEDATEN2       0,   /* P770 = Offset für Rotation gegenüber Flachbett (soll hier 0 sein) */
                      15.748,   /* P771 = Sicherheitsabstand X <--> U [mm od. inch] */
                           0,   /* P772 = */
                      0.1181,   /* P773 = sichere Position der Z-Achse (bezogen auf Abstand zum pos. Softwarelimit) [mm od. inch] */
                          10,   /* P774 = Ausgangsspannung (Laserleistung) bei Schwellwert von 100% und max. Geschwindigkeit */
                           0,   /* P775 = Für Testbetrieb 0= Overriede in Auto aus 1= Override in Auto aktiv */
                         500,   /* P776 = Verweilzeit [ms] nach M59 (Schuh runter) nur aktiv wenn Schuh nicht schon unten ist */
                         400,   /* P777 = Verweilzeit [ms] nach M122 (Shutter auf) */
                   1968.5039,   /* P778 = max. Bahngeschwindigkeit [mm/min od. inch/mim] muß gleich MK_VBAHNMAX sein */
                        4000;   /* P779 = max. Wartezeit [ms] bis zur automatischen Übernahme des Schuh/Düsenabstand */

/* Anwendungsspezifische Technologieparameter, die ab P780 im Parameterfeld abgelegt werden */
MK_TECHNOLOGIEDATEN3      -0.1575,   /* P780 = Neg. Vergleichswert fuer akt. Pos. Messgeber Fuss [mm od. inch]im %9200  */
                           0.1575,   /* P781 = Pos. Vergleichswert fuer akt. Pos. Messgeber Fuss [mm od. inch]im %9200  */
                              0.2,   /* P782 = Sichere Z-Achs-Höhe in mm oder inch über der Materialoberfl. für sich. Leerverfahren */
                          -0.0394,   /* P783 = Neg. Softwarelimit für Y-Achse im Flachbettbetrieb */
                      -20.785,   /* P784 = Y-Offset für Rotation */
                        90.0,   /* P785 = A-Offset (zum Beladen) */
                        40.0,   /* P786 = A-Pos-Negativ Entspannen erlaubt */
                       140.0,   /* P787 = A-Pos-Positiv Entspannen erlaubt */
                       12000,   /* P788 = Zeitkonstante für Spülen in Bar pro ms */
                          2;   /* alt.14 P789 = b0: Flachbett Laser; b1: Rotation Laser; b2: Rotation Fräser b3: Werkzeugwechsel b4: Werkzeugerkennung */

/* Anwendungsspezifische Technologieparameter, die ab P790 im Parameterfeld abgelegt werden */
MK_TECHNOLOGIEDATEN4     15.748,   /* P790 = ScannerGravur: Z-Position */
                          15,   /* P791 = ScannerGravur: Laserprogrammnummer */
                           0,   /* P792 = ScannerGravur: Erweiterung Softwarelimit Y-. */
                           0,   /* P793 = ScannerGravur: Erweiterung Softwarelimit Y+. */
                           0,   /* P794 = 0: Im Stahlmodul mit Schuh nachführen -  1: Im Stahlmodul kapazitiv nachführen */
                         5.0,   /* P795 = max. Schneidgasdruck bei 10V Ausgangsspannung [bar] */
                         0,   /* P796 = Fokuslagenkorrektur für Stahl in mm */
                           1,   /* P797 = Richtungsabh. Korrektur Schnittspalt unten über Geschwindigkeitsoverride 0:Laserleistung 1:Override*/
                           0,   /* P798 = X-Offset für Fräsen - PTSn */
                        39.3701;   /* P799 = Geschwindigkeit für Fräser absenken (mm/min) */


/*---------------------------------------------*/
/*  10.0  SPS - spezifische Einstellungen      */
/*---------------------------------------------*/
/* Die folgenden Werte werden in den Datenbaustein 2 der SPS geschrieben */
MK_DW224_255           30000,   /* DW 224: MMI Überwachung Timeoutzeit [ms] */
                           0,   /* DW 225: Toleranzwert Überstand Duese und Schuh nach unten [um] */
                         500,   /* DW 226: Wartezeit für Abfrage Schneidgas ok (mit M108) [ms] */
                           0,   /* DW 227: Ausschaltzeit für Positionierlasers [min] */
                           0,   /* DW 228: 1 = Postionierlaser an ueber Verfahrtasten bei Shutterstellung 2 bei Rofin */
                           0,   /* DW 229: */
                          20,   /* DW 230: Nachlaufzeit Absaugung [s] */
                         500,   /* DW 231: Einschalt-Verzögerung Absaugungen [ms] */
                           0,   /* DW 232: */
                           0,   /* DW 233: */
                           0,   /* DW 234: */
                           0,   /* DW 235: */
                           0,   /* DW 236: */
                           0,   /* DW 237: */
                           0,   /* DW 238: */
                           0,   /* DW 239: */
                           0,   /* DW 240: */
                           0,   /* DW 241: */
                           0,   /* DW 242: */
                           0,   /* DW 243: */
                         108,   /* alt.104 DW 244: b0: Stromüberwachung Fräser, b1: Schraubautomat, b2: Drehmagazin, b3: Sycotec-Spindel, b5: Spindelleistungsüberw., b6: Spannzangen-Sensor */
                           0,   /* DW 245: */
                           0,   /* DW 246: LAM-Mode 0: NA, 1:ProRot, 2: MTL */
                           2,   /* DW 247: Bit0 nicht verwendet, Bit1 = 1 (Slab3) */
                           6,   /* DW 248: bit 1: GravurScanner vorhanden, bit 2: Abdeckhaube nicht vorhanden */
                           1,   /* DW 249: Bit1 = 0 (Status Wasserkühler / E0.5) negieren ;Bit1 = 1 (Fehler 0: Ok) */
                           0,   /* DW 250: 0 = Standard; 1 = drei Absaugungen (2 x Flachbett, 1 x Rotation) */
                           0,   /* DW 251: */
                           0,   /* DW 252: */
                           0,   /* DW 253: nur fuer Test: 1 => Überbrückung für E_Laser_HV_ein  */
                           1,   /* DW 254: 1 = Überwachung ein einschalten, ob Düse unter Schuh fährt beim schneiden */
                           0;   /* DW 255: nur fuer Test: 1 => Vorbesetzen von Eingängen und internen Zuständen */
