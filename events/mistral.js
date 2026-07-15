const { EmbedBuilder } = require("discord.js");
const core = require("../libs/mistral-core");

const AI_CHANNEL_ID    = process.env.AI_CHANNEL_ID;
const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID || null;

if (!AI_CHANNEL_ID) {
  console.error("AI_CHANNEL_ID is not set in environment variables.");
  process.exit(1);
}

// ─── Queue par channel (Discord-only) ─────────────────────────────────────

const channelQueues = {};
const lastErrorSent = {};

function enqueue(channelId, fn) {
  const prev = channelQueues[channelId] ?? Promise.resolve();
  const next = prev.then(fn).catch(err => console.error("[queue] Unhandled error:", err));
  channelQueues[channelId] = next;
  return next;
}

function getTypingDelay(isAdmin, sleepState, mood) {
  if (isAdmin) return 300 + Math.random() * 400;
  if (sleepState === "DEEP_WAKE") return 3000 + Math.random() * 2000;
  if (sleepState === "SOFT_WAKE") return 1500 + Math.random() * 1000;
  if (mood === "SLEEPY") return 2000 + Math.random() * 1500;
  return 600 + Math.random() * 800;
}

async function simulateTyping(channel, ms) {
  await channel.sendTyping();
  await new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Event ────────────────────────────────────────────────────────────────

module.exports = {
  name: "messageCreate",
  async execute(message) {
    if (message.author.bot && message.channel.id !== QUEUE_CHANNEL_ID) return;
    if (message.channel.id !== AI_CHANNEL_ID) return;

    const channelId   = message.channel.id;
    const isMentioned = message.mentions.has(message.client.user.id);
    const isReply     = message.reference
      ? (await message.fetchReference().catch(() => null))?.author?.id === message.client.user.id
      : false;

    const cleanContent = message.content
      .replace(`<@${message.client.user.id}>`, "")
      .trim();

    const isAdmin = cleanContent.startsWith("[admin]") && (message.author.id === core.ADMIN_OWNER_ID );
    if (isAdmin) {
      const adminPrompt = cleanContent.replace("[admin]", "").trim();
      console.log(`[admin] Command from owner: ${adminPrompt.slice(0, 100)}`);
    }

    // ── Emoji reaction (non-blocking) ──
    if (!isAdmin) {
      core.askMistralEmoji(cleanContent).then(emoji => {
        if (emoji) message.react(emoji).catch(() => {});
      });
    }

    // ── Enqueue the response ──
    enqueue(channelId, async () => {
      const hasImage = message.attachments.some(a => a.contentType?.startsWith("image/"));
      const imgUrl   = hasImage
        ? message.attachments.find(a => a.contentType?.startsWith("image/")).url
        : null;

      // ── Typing delay ──
      const userData     = core.getUserData(message.author.id);
      const sleepState   = core.getSleepState(userData.lastSeen);
      const mood         = core.getDailyMood();
      const typingDelay  = getTypingDelay(isAdmin, sleepState, mood);
      await simulateTyping(message.channel, typingDelay);

      // ── Process through core ──
      const result = await core.processMessage({
        channelId,
        userId    : message.author.id,
        username  : message.author.username,
        content   : cleanContent,
        isAdmin,
        isMentioned,
        isReply,
        imgUrl,
      });

      // ── Handle result ──
      if (!result) {
        console.log("[discord] processMessage returned null (unexpected)");
        return;
      }

      if (result.ignored) {
        console.log(`[discord] Ignored (${result.reason})`);
        return;
      }

      if (result.error) {
        const lastErr = lastErrorSent[channelId] ?? 0;
        if (Date.now() - lastErr > core.ERROR_COOLDOWN) {
          lastErrorSent[channelId] = Date.now();
          await message.channel.send("sorry... something went wrong i think");
        } else {
          console.log("[error suppressed] already sent recently");
        }
        return;
      }

      // ── Send response ──
      if (isAdmin && result.toolTrace?.length > 0) {
        const embeds = result.toolTrace.map(t => {
          const e = new EmbedBuilder()
            .setColor(0x00aaff)
            .setTitle(`🔧 ${t.tool}`)
            .addFields(
              { name: "Arguments", value: `\`\`\`json\n${JSON.stringify(t.arguments, null, 2).slice(0, 900)}\n\`\`\``, inline: false },
            );
          const respStr = typeof t.response === 'object'
            ? JSON.stringify(t.response, null, 2).slice(0, 900)
            : String(t.response).slice(0, 900);
          if (respStr) e.addFields({ name: "Response", value: `\`\`\`json\n${respStr}\n\`\`\``, inline: false });
          return e;
        });

        const safeContent = (result.response || "✅ Done").length > 1900
          ? (result.response || "✅ Done").slice(0, 1900) + "..."
          : (result.response || "✅ Done");
        await message.channel.send({ content: safeContent, embeds });
        console.log("[admin] Response sent with embeds");
      } else {
        const safeMsg = (result.response || "").length > 2000
          ? (result.response || "").slice(0, 1997) + "..."
          : (result.response || "");
        if (safeMsg) await message.channel.send(safeMsg);
        console.log(`[bot] Response sent: ${(result.response || '').slice(0, 100)}`);
      }
    });
  },

  cleanMemory: core.cleanMemory,
};
