const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');
const { translate } = require('../libs/translate');
const db = require('../libs/db');
const svgChart = require('../libs/svg');
const { Resvg } = require("@resvg/resvg-js");

// ── Locale → timezone ────────────────────────────────────────────────────────

const LOCALE_TO_TZ = {
  "fr": "Europe/Paris", "fr-BE": "Europe/Brussels", "fr-CH": "Europe/Zurich",
  "en-US": "America/New_York", "en-GB": "Europe/London",
  "de": "Europe/Berlin", "es-ES": "Europe/Madrid", "es": "America/Mexico_City",
  "it": "Europe/Rome", "pt-BR": "America/Sao_Paulo", "pt": "Europe/Lisbon",
  "nl": "Europe/Amsterdam", "pl": "Europe/Warsaw", "ru": "Europe/Moscow",
  "ja": "Asia/Tokyo", "ko": "Asia/Seoul",
  "zh-CN": "Asia/Shanghai", "zh-TW": "Asia/Taipei",
  "tr": "Europe/Istanbul", "ar": "Asia/Riyadh",
  "sv-SE": "Europe/Stockholm", "da": "Europe/Copenhagen",
  "fi": "Europe/Helsinki", "nb": "Europe/Oslo", "uk": "Europe/Kyiv",
  "cs": "Europe/Prague", "hu": "Europe/Budapest", "ro": "Europe/Bucharest",
  "bg": "Europe/Sofia", "hr": "Europe/Zagreb",
  "th": "Asia/Bangkok", "vi": "Asia/Ho_Chi_Minh", "hi": "Asia/Kolkata",
};

function getTzFromLocale(locale) {
  return LOCALE_TO_TZ[locale] ?? "UTC";
}

/** Retourne l'offset en minutes (DST compris) pour une locale ou un nom de TZ. */
function getOffsetMinutes(localeOrTz) {
  // Si c'est un nom de TZ IANA direct (contient "/"), on l'utilise tel quel
  const tz = localeOrTz?.includes("/") ? localeOrTz : getTzFromLocale(localeOrTz);
  const now = new Date();
  const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  return (local - utc) / 60_000;
}

// ── SVG helper ────────────────────────────────────────────────────────────────

async function svgToPng(svgString) {
  const resvg = new Resvg(svgString, { fitTo: { mode: "width", value: 2044 } });
  return resvg.render().asPng();
}

// ── Bucketing ─────────────────────────────────────────────────────────────────

/**
 * Regroupe un tableau de rows DB en slots de `slotMinutes` minutes.
 * Chaque row doit avoir un champ timestamp/date et userCount/averageUserCount.
 * Retourne un tableau de { slotStart: Date, averageUserCount: number }.
 */
function bucketBySlot(rows, startDate, endDate, slotMinutes) {
  const slotMs = slotMinutes * 60_000;
  const start = startDate.getTime();
  const end = endDate.getTime();
  const totalSlots = Math.ceil((end - start) / slotMs);

  // Initialise les buckets
  const buckets = Array.from({ length: totalSlots }, (_, i) => ({
    slotStart: new Date(start + i * slotMs),
    sum: 0,
    count: 0,
  }));

  for (const row of rows) {
    const ts = new Date(row.timestamp ?? row.date ?? row.createdAt).getTime();
    const idx = Math.floor((ts - start) / slotMs);
    if (idx >= 0 && idx < totalSlots) {
      buckets[idx].sum += row.userCount ?? row.averageUserCount ?? 0;
      buckets[idx].count += 1;
    }
  }

  return buckets.map(b => ({
    slotStart: b.slotStart,
    averageUserCount: b.count > 0 ? Math.round(b.sum / b.count) : 0,
  }));
}

/**
 * Convertit les rows de getUserCountEvolutionBySlot (timeSlot en minutes depuis minuit)
 * en tableau de { slotStart: Date, averageUserCount } couvrant une journée de 00h à 24h.
 */
function buildDailySlots(rows, slotMinutes) {
  const slotsPerDay = Math.ceil(1440 / slotMinutes);
  return Array.from({ length: slotsPerDay }, (_, i) => {
    const minuteOfDay = i * slotMinutes;
    const entry = rows.find(r => parseInt(r.timeSlot) === minuteOfDay);
    const count = entry ? Math.round(entry.averageUserCount) : 0;
    const d = new Date();
    d.setUTCHours(Math.floor(minuteOfDay / 60), minuteOfDay % 60, 0, 0);
    return { slotStart: d, averageUserCount: count };
  });
}

// ── Command ───────────────────────────────────────────────────────────────────

const SLOT_MIN = 5;
const SLOT_MAX = 60 * 24; // 1 jour max
const SLOT_DEFAULT = 15;

module.exports = {
  definition: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Displays the player count history of the server')
    .addIntegerOption(opt =>
      opt.setName('slotminutes')
        .setDescription(`Time slot size in minutes (default: ${SLOT_DEFAULT}, min: ${SLOT_MIN}, max: ${SLOT_MAX})`)
        .setMinValue(SLOT_MIN)
        .setMaxValue(SLOT_MAX)
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('startdate')
        .setDescription('Start date (YYYY-MM-DD). When set, shows the actual range instead of daily average.')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('enddate')
        .setDescription('End date (YYYY-MM-DD, default: now)')
        .setRequired(false))
    .addStringOption(opt =>
      opt.setName('timezone')
        .setDescription('Timezone override (IANA name or locale code, default: auto from locale)')
        .setRequired(false))
    .addBooleanOption(opt =>
      opt.setName('full')
        .setDescription('Show the entire history from the first entry in the database')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    const lang         = interaction.locale || 'en-US';
    const slotMinutes  = interaction.options.getInteger('slotminutes') ?? SLOT_DEFAULT;
    const tzOverride   = interaction.options.getString('timezone');
    const offsetMinutes = getOffsetMinutes(tzOverride || lang);

    const startRaw  = interaction.options.getString('startdate');
    const endRaw    = interaction.options.getString('enddate');
    const fullMode  = interaction.options.getBoolean('full') ?? false;
    const endDate   = endRaw ? new Date(endRaw) : new Date();
    let   startDate = startRaw ? new Date(startRaw) : null;

    // ── Fetch & bucket ──────────────────────────────────────────────────────

    let history; // [{ slotStart: Date, averageUserCount: number }]

    if (fullMode) {
      // Récupère la première entrée en base pour couvrir tout l'historique
      const oldest = await db.getOldestEntry();
      startDate = oldest ? new Date(oldest.createdAt) : new Date(0);
      const rows = await db.fetchUsersByDateRange(startDate, endDate);
      console.log(`[history] full-history mode from ${startDate.toISOString()}: ${rows.length} rows fetched`);
      history = bucketBySlot(rows, startDate, endDate, slotMinutes);
    } else if (startRaw) {
      const rows = await db.fetchUsersByDateRange(startDate, endDate);
      console.log(`[history] date-range mode: ${rows.length} rows fetched`);
      history = bucketBySlot(rows, startDate, endDate, slotMinutes);
    } else {
      // Mode "moyenne journalière" – on demande à la DB des moyennes par tranche
      const rows = await db.getUserCountEvolutionBySlot(slotMinutes);
      console.log(`[history] daily-average mode: ${rows.length} rows fetched`);
      history = buildDailySlots(rows, slotMinutes);
    }

    // ── Current count ───────────────────────────────────────────────────────

    const current = await db.getLatestUserCount();
    const currentCount = current?.userCount ?? 0;

    // ── Build settings for SVG ──────────────────────────────────────────────

    const settings = {
      queueTotal:    currentCount,
      queueOnline:   Math.min(30, currentCount),
      queueWaiting:  Math.max(0, currentCount - 30),
      offsetMinutes,
      slotMinutes,
      updatedAt: new Date(),
      history: {
        dates:   history.map(h => h.slotStart),
        total:   history.map(h => h.averageUserCount),
        online:  history.map(h => Math.min(30, h.averageUserCount)),
        waiting: history.map(h => Math.max(0, h.averageUserCount - 30)),
      },
    };

    console.log(`[history] ${history.length} slots of ${slotMinutes}min → SVG`);

    const svg = svgChart.generateDashboardSVG(settings, lang);
    const png = await svgToPng(svg);
    const attachment = new AttachmentBuilder(png, { name: 'history.png' });
    await interaction.editReply({ content: translate('history_message', lang), files: [attachment] });
  },
};