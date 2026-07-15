// ─────────────────────────────────────────────
//  svgDashboard.js
//  Génère le SVG du dashboard file d'attente
//  Usage : generateDashboardSVG(data, lang)
// ─────────────────────────────────────────────

const { translate } = require("./translate"); // ← ta lib de traduction


// ══════════════════════════════════════════════
//  1. GÉNÉRATEUR DE GRAPHE
// ══════════════════════════════════════════════

// Dimensions internes du graphe (coordonnées SVG)
const GRAPH = {
  x:      300,
  y:      62,
  width:  682,   // 982 - 300
  height: 310,   // 372 - 62
  bottom: 372,
  right:  982,
};

/**
 * Mappe une valeur (0→maxValue) vers une coordonnée Y SVG.
 */
function valueToY(value, maxValue = 100) {
  return GRAPH.bottom - (value / maxValue) * GRAPH.height;
}

/**
 * Génère les points SVG (polyline/polygon) depuis un tableau de valeurs.
 * @returns {{ line: string, area: string, pts: {x,y}[] }}
 */
function buildCurvePoints(values, maxValue = 100) {
  const n    = values.length;
  const step = GRAPH.width / (n - 1);

  const pts = values.map((v, i) => ({
    x: GRAPH.x + i * step,
    y: valueToY(v, maxValue),
  }));

  const line = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  const area = [
    `${GRAPH.x},${GRAPH.bottom}`,
    ...pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`),
    `${GRAPH.right},${GRAPH.bottom}`,
  ].join(" ");

  return { line, area, pts };
}

/**
 * Formate un offset en minutes en chaîne lisible.
 * ex: 90 → "UTC+1:30" | -300 → "UTC-5" | 0 → "UTC"
 */
function formatOffset(offsetMinutes) {
  if (offsetMinutes === 0) return "UTC";
  const sign = offsetMinutes > 0 ? "+" : "-";
  const abs  = Math.abs(offsetMinutes);
  const h    = Math.floor(abs / 60);
  const m    = abs % 60;
  return m === 0
    ? `UTC${sign}${h}`
    : `UTC${sign}${h}:${String(m).padStart(2, "0")}`;
}

/**
 * Applique un offset en minutes à une Date UTC et retourne "HH:MM" local.
 */
function fmtLocalTime(date, offsetMinutes) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Génère les labels de l'axe X depuis un tableau de dates.
 */
function buildXLabels(dates, offsetMinutes = 0) {
  const n    = dates.length;
  const step = GRAPH.width / (n - 1);

  return dates.map((d, i) => {
    const x   = (GRAPH.x + i * step).toFixed(1);
    const lbl = fmtLocalTime(d, offsetMinutes);
    return `<text x="${x}" y="390" font-family="'Courier New', monospace" font-size="9" fill="#484f58" text-anchor="middle">${lbl}</text>`;
  }).join("\n  ");
}

/**
 * Génère les cercles de données sur une courbe.
 */
function buildDots(pts, color, filter = "") {
  const filterAttr = filter ? ` filter="${filter}"` : "";
  return pts.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}"${filterAttr}/>`
  ).join("\n  ");
}

/**
 * Détecte une langue approximative depuis un offset UTC en minutes.
 * Très imprécis — à utiliser uniquement comme fallback.
 */
function guessLangFromOffset(offsetMinutes) {
  const h = offsetMinutes / 60;
  if (h === 9) return "ja";
  return "en";
}


// ══════════════════════════════════════════════
//  2. ASSEMBLEUR SVG PRINCIPAL
// ══════════════════════════════════════════════

/**
 * Génère le SVG complet du dashboard.
 *
 * @param {object}   data
 * @param {number}   data.queueTotal      Nombre total de joueurs en file
 * @param {number}   data.queueOnline     Joueurs connectés
 * @param {number}   data.queueWaiting    Joueurs en attente
 * @param {Date}     data.updatedAt       Date de la dernière MAJ
 * @param {object}   data.history         Historique des données
 * @param {number[]} data.history.total
 * @param {number[]} data.history.online
 * @param {number[]} data.history.waiting
 * @param {Date[]}   data.history.dates
 * @param {number}  [data.offsetMinutes=0]  Offset timezone en minutes (ex: 120 = UTC+2)
 * @param {string}  [lang="en"]             Code langue Discord (ex: "fr", "en-US", "de")
 * @returns {string} SVG complet
 */
function generateDashboardSVG(data, lang = "en") {
  const {
    queueTotal    = "???",
    queueOnline   = "???",
    queueWaiting  = "???",
    updatedAt     = null,
    history       = {},
    offsetMinutes = 0,
  } = data;

  // Valeurs par défaut si pas d'historique fourni
  const histTotal   = history.total   ?? [40, 55, 60, 74, 80, 75, 70];
  const histOnline  = history.online  ?? [20, 30, 40, 50, 60, 52, 46];
  const histWaiting = history.waiting ?? [10, 18, 22, 28, 38, 32, 27];
  const histDates   = history.dates   ?? Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setUTCHours(i * 4, 0, 0, 0); return d;
  });


  const maxValue = Math.max(
    1,
    ...([histTotal, histOnline, histWaiting].map(arr =>
      arr.reduce((m, v) => v > m ? v : m, 0)
    ))
  ) * 1.1;

  const curveTotal   = buildCurvePoints(histTotal,   maxValue);
  const curveOnline  = buildCurvePoints(histOnline,  maxValue);
  const curveWaiting = buildCurvePoints(histWaiting, maxValue);

  const offsetStr  = formatOffset(offsetMinutes);
  const updatedStr = updatedAt
    ? fmtLocalTime(updatedAt, offsetMinutes) + ` ${offsetStr}`
    : `--:-- ${offsetStr}`;

  const graphDate = histDates.length
    ? histDates[0].toLocaleDateString("fr-FR")
    : translate("dashboard_unknown_date", lang);

  // Ligne "maintenant"
  const now       = new Date();
  const startDate = histDates[0];
  const endDate   = histDates[histDates.length - 1];
  const totalMs   = endDate - startDate;
  const elapsedMs = Math.min(Math.max(now - startDate, 0), totalMs);
  const nowX      = totalMs > 0
    ? (GRAPH.x + (elapsedMs / totalMs) * GRAPH.width).toFixed(1)
    : (GRAPH.x + GRAPH.width / 2).toFixed(1);

  // Y-axis labels dynamiques
  const yLabels = [100, 80, 60, 40, 20, 0].map(pct => {
    const val   = Math.round(pct / 100 * maxValue);
    const y     = valueToY(pct / 100 * maxValue, maxValue);
    const lineY = y.toFixed(1);
    return `
  <text x="296" y="${(y + 4).toFixed(1)}" font-family="'Courier New', monospace" font-size="9" fill="#484f58" text-anchor="end">${val}</text>
  <line x1="300" y1="${lineY}" x2="982" y2="${lineY}" stroke="${pct === 0 ? "#30363d" : "#21262d"}" stroke-width="1"/>`;
  }).join("");

  // ── Traductions via ta lib ──────────────────────────────────────────────
  const T = {
    queue_title:  translate("dashboard_queue_title",  lang),
    players:      translate("dashboard_players",      lang),
    online:       translate("dashboard_online",       lang),
    waiting:      translate("dashboard_waiting",      lang),
    updated_at:   translate("dashboard_updated_at",   lang),
    graph_title:  translate("dashboard_graph_title",  lang),
    curve_total:  translate("dashboard_curve_total",  lang),
    curve_online: translate("dashboard_curve_online", lang),
    curve_wait:   translate("dashboard_curve_wait",   lang),
    now:          translate("dashboard_now",          lang),
  };
  // ────────────────────────────────────────────────────────────────────────

  return /* svg */`<svg xmlns="http://www.w3.org/2000/svg" width="1022" height="438" viewBox="0 0 1022 438">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1117"/><stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
    <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1c2333"/><stop offset="100%" stop-color="#161b22"/>
    </linearGradient>
    <linearGradient id="fillCyan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="fillOrange" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fb923c" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#fb923c" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="fillPurple" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
    </linearGradient>
    <filter id="glowCyan" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glowOrange" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="glowNumber" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="softShadow">
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#000" flood-opacity="0.5"/>
    </filter>
    <clipPath id="graphClip">
      <rect x="300" y="62" width="682" height="310"/>
    </clipPath>
  </defs>

  <!-- Background -->
  <rect width="1022" height="438" fill="url(#bgGrad)"/>
  <g opacity="0.04" stroke="#fff" stroke-width="0.5">
    ${[100,200,300,400,500,600,700,800,900,1000].map(x=>`<line x1="${x}" y1="0" x2="${x}" y2="438"/>`).join("")}
    ${[80,160,240,320,400].map(y=>`<line x1="0" y1="${y}" x2="1022" y2="${y}"/>`).join("")}
  </g>
  <rect x="0" y="0" width="1022" height="2" fill="#22d3ee" opacity="0.6"/>

  <!-- ── LEFT PANEL ── -->
  <rect x="18" y="18" width="248" height="402" rx="12" fill="url(#cardGrad)" filter="url(#softShadow)"/>
  <rect x="18" y="18" width="248" height="402" rx="12" fill="none" stroke="#30363d" stroke-width="1"/>
  <rect x="18" y="18" width="248" height="3" rx="2" fill="#22d3ee" opacity="0.8"/>

  <text x="142" y="58" text-anchor="middle" font-family="'Courier New',monospace" font-size="11" font-weight="700" letter-spacing="3" fill="#8b949e">${T.queue_title}</text>

  <circle cx="142" cy="185" r="78" fill="none" stroke="#30363d" stroke-width="1.5"/>
  <circle cx="142" cy="185" r="78" fill="none" stroke="#22d3ee" stroke-width="2" stroke-dasharray="320 170" stroke-dashoffset="-85" opacity="0.7" filter="url(#glowCyan)"/>
  <circle cx="142" cy="185" r="64" fill="#0d1117" opacity="0.8"/>
  <circle cx="142" cy="107" r="4" fill="#22d3ee" filter="url(#glowCyan)"/>

  <text x="142" y="175" text-anchor="middle" font-family="'Courier New',monospace" font-size="52" font-weight="700" fill="#22d3ee" filter="url(#glowNumber)">${queueTotal}</text>
  <text x="142" y="202" text-anchor="middle" font-family="'Courier New',monospace" font-size="11" fill="#8b949e" letter-spacing="2">${T.players}</text>

  <line x1="42" y1="295" x2="242" y2="295" stroke="#30363d" stroke-width="1"/>

  <text x="80"  y="328" text-anchor="middle" font-family="'Courier New',monospace" font-size="22" font-weight="700" fill="#fb923c">${queueOnline}</text>
  <text x="80"  y="345" text-anchor="middle" font-family="'Courier New',monospace" font-size="9"  fill="#8b949e" letter-spacing="1.5">${T.online}</text>
  <line x1="142" y1="308" x2="142" y2="360" stroke="#30363d" stroke-width="1"/>
  <text x="204" y="328" text-anchor="middle" font-family="'Courier New',monospace" font-size="22" font-weight="700" fill="#a78bfa">${queueWaiting}</text>
  <text x="204" y="345" text-anchor="middle" font-family="'Courier New',monospace" font-size="9"  fill="#8b949e" letter-spacing="1.5">${T.waiting}</text>

  <text x="142" y="394" text-anchor="middle" font-family="'Courier New',monospace" font-size="9" fill="#484f58" letter-spacing="1">${T.updated_at}: ${updatedStr}</text>

  <!-- ── RIGHT PANEL ── -->
  <rect x="280" y="18" width="724" height="402" rx="12" fill="url(#cardGrad)" filter="url(#softShadow)"/>
  <rect x="280" y="18" width="724" height="402" rx="12" fill="none" stroke="#30363d" stroke-width="1"/>
  <rect x="280" y="18" width="724" height="3" rx="2" fill="#fb923c" opacity="0.7"/>

  <text x="300" y="48" font-family="'Courier New',monospace" font-size="11" font-weight="700" letter-spacing="3" fill="#8b949e">${T.graph_title}</text>

  <!-- Legend -->
  <rect x="660" y="34" width="12" height="3" rx="1.5" fill="#22d3ee"/>
  <text x="677" y="43" font-family="'Courier New',monospace" font-size="9" fill="#8b949e" letter-spacing="1">${T.curve_total}</text>
  <rect x="720" y="34" width="12" height="3" rx="1.5" fill="#fb923c"/>
  <text x="737" y="43" font-family="'Courier New',monospace" font-size="9" fill="#8b949e" letter-spacing="1">${T.curve_online}</text>
  <rect x="802" y="34" width="12" height="3" rx="1.5" fill="#a78bfa"/>
  <text x="819" y="43" font-family="'Courier New',monospace" font-size="9" fill="#8b949e" letter-spacing="1">${T.curve_wait}</text>

  <!-- Y-axis + grid -->
  ${yLabels}
  <line x1="300" y1="62" x2="300" y2="372" stroke="#30363d" stroke-width="1"/>

  <!-- X-axis labels -->
  ${buildXLabels(histDates, offsetMinutes)}
  <text x="641" y="406" text-anchor="middle" font-family="'Courier New',monospace" font-size="9" fill="#30363d" letter-spacing="1">${graphDate}</text>
  <text x="982" y="406" text-anchor="end" font-family="'Courier New',monospace" font-size="9" fill="#484f58" letter-spacing="1">${offsetStr}</text>

  <!-- Curve TOTAL (cyan) -->
  <polygon clip-path="url(#graphClip)" fill="url(#fillCyan)" points="${curveTotal.area}"/>
  <polyline clip-path="url(#graphClip)" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" filter="url(#glowCyan)" points="${curveTotal.line}"/>
  ${buildDots(curveTotal.pts, "#22d3ee", "url(#glowCyan)")}

  <!-- Curve ONLINE (orange) -->
  <polygon clip-path="url(#graphClip)" fill="url(#fillOrange)" points="${curveOnline.area}"/>
  <polyline clip-path="url(#graphClip)" fill="none" stroke="#fb923c" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" filter="url(#glowOrange)" points="${curveOnline.line}"/>
  ${buildDots(curveOnline.pts, "#fb923c", "url(#glowOrange)")}

  <!-- Curve WAITING (purple) -->
  <polygon clip-path="url(#graphClip)" fill="url(#fillPurple)" points="${curveWaiting.area}"/>
  <polyline clip-path="url(#graphClip)" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${curveWaiting.line}"/>
  ${buildDots(curveWaiting.pts, "#a78bfa")}

  <!-- Now cursor -->
  <line x1="${nowX}" y1="62" x2="${nowX}" y2="372" stroke="#fff" stroke-width="1" stroke-dasharray="4 4" opacity="0.15"/>
  <text x="${parseFloat(nowX) + 4}" y="76" font-family="'Courier New',monospace" font-size="8" fill="#484f58" letter-spacing="1">${T.now}</text>
</svg>`;
}


// ══════════════════════════════════════════════
//  3. EXPORT
// ══════════════════════════════════════════════

module.exports = { generateDashboardSVG, guessLangFromOffset, formatOffset, fmtLocalTime };