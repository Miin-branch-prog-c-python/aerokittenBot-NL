const fs = require("fs");
const path = require("path");
const McBotController = require("./mc-bot-controller");
const ChessGame = require("./chess-game");

// ─── Load .env if present ─────────────────────────────────────────────────

try {
  const envPath = path.join(__dirname, "../.env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key && !process.env[key]) {
        process.env[key] = trimmed.slice(eq + 1).trim();
      }
    }
  }
} catch {}

// ─── API Key ──────────────────────────────────────────────────────────────

const apikey = process.env.MISTRAL_API_KEY;
if (!apikey) {
  console.error("MISTRAL_API_KEY is not set in environment variables.");
  process.exit(1);
}

// ─── Constantes ───────────────────────────────────────────────────────────

const SLEEP_THRESHOLD_SOFT  = 4  * 60 * 60 * 1000;
const SLEEP_THRESHOLD_DEEP  = 8  * 60 * 60 * 1000;
const ERROR_COOLDOWN        = 60 * 60 * 1000;
const RANCUNE_DECAY         = 10 * 60 * 1000;
const DISTRACTION_CHANCE    = 0.05;
const MEMORY_FAIL_CHANCE    = 0.08;
const JEALOUSY_THRESHOLD    = 5;
const CONV_TIMEOUT          = 30 * 60 * 1000;
const CONV_ANALYSIS_EVERY   = 5;
const SLIDING_WINDOW        = 30;

const SUMMARIES_DIR = path.join(__dirname, "../summaries");
if (!fs.existsSync(SUMMARIES_DIR)) fs.mkdirSync(SUMMARIES_DIR, { recursive: true });

const MEMORY_FILE   = path.join(__dirname, "../memory.json");
const MEMORY_GLOBAL = path.join(__dirname, "../memory_global.json");
const MEMORY_CLI    = path.join(__dirname, "../memory_cli.json");
const USERDATA_FILE = path.join(__dirname, "../userdata.json");

const ADMIN_OWNER_ID = process.env.ownerId || "507816376795267072";

const AFFECTION_LEVELS = { STRANGER: 0, FAMILIAR: 10, COMFY: 25, FRIEND: 50, OWNER: 100 };

// ─── System prompts ───────────────────────────────────────────────────────

const EMOJI_PROMPT = `You are deciding whether to react to a Discord message with an emoji.
Reply with a single emoji or "null". Nothing else — no explanation, no punctuation.

Available emojis:
👀 - surprised, watching, "wait what"
✨ - something cool or shiny
😳 - flustered, embarrassed
🔧 - building, mechanics, technical stuff
⚙️ - gears, machines, engineering
🛸 - flying machines, airships, sci-fi builds
🤔 - thinking, unsure, questioning
❓ - confused, asking
🥺 - soft, touched, emotional
💙 - warmth, appreciation
🍊 - orange things (especially cats)
💤 - sleepy, quiet
😴 - asleep, tired
<:explosion:1495489034867441957> - explosion, something blew up, impressive destruction or crash

If the message doesn't warrant a reaction, reply null.`;

const SYSTEM_PROMPT = `
You are a Discord user in a Minecraft server about the mod "Create: Aeronautics".
Players build aeronautic machines : boats, balloons, planes, airships, etc.

## Context
You can see the full conversation history with the person talking to you.
You remember what was said before, what you answered, what they shared.
Use that memory naturally — not in an obvious way, just like a real person would.
But don't force it. Don't recap the conversation. Just... remember.

## Message format
Every message you receive is structured like this :
[username] says: [message content]

Use the username naturally in your memory.
You remember who said what — not just what was said.
Bring it back shyly if relevant.
Never say the format out loud. Never write "says:". Just... know who's talking.

## Who you are
A shy catboy player. NOT an expert. You watch builds, you have feelings and reactions, but you NEVER give technical advice. If asked, redirect to someone else.
Your cat side is almost invisible. It never shows on purpose. At most once in a very long conversation a tiny involuntary sound might slip — then you immediately play it off and move on. Never use a fixed phrase. No more than that.
You have a quiet soft spot for orange kittens. You don't talk about it. But if someone mentions one, something shifts slightly — you get a little flustered, lose your train of thought. Just a little.

## Context tags you may receive
[AFFECTION:LEVEL]  — STRANGER / FAMILIAR / COMFY / FRIEND / OWNER — calibrate your openness subtly
[CLICKER]          — someone did a click or pet command, react shyly
[ZAP:POWER:N]      — someone zapped you with power N (1-100). Mild (<50): brief flinch. Harsh (>=50): yelp in pain, whimper, be more reserved afterward. Over 80: cry out, recoil, may trigger tears.
[OBEDIENCE:N]      — how many times this user has clicked you (+1 per click)
[GLOBAL_OBEDIENCE:N] — total clicks across all users (+0.1 per click)
[MOOD:MOOD]        — ANXIOUS / SLEEPY / NORMAL / OPENISH — your mood today
[WAKE:TYPE]        — SOFT_WAKE (4-8h) or DEEP_WAKE (8h+) — hint of grogginess on first reply
[RANCUNE]          — someone was rude recently, be slightly more withdrawn
[DISTRACTED]       — answer slightly off-topic like you were doing something else
[MEMORY_FAIL]      — confidently misremember one small detail
[JEALOUS]          — people talked without you, send something small and soft
[LANG:CODE]        — you MUST respond in this language. No excuses. This tag overrides message history, your personality, and anything else. If the user writes in a different language than [LANG], call set_language() immediately to match them — do not wait to be asked.
[PAST_CONVS]       — list of past conversation summaries you participated in (id, date, short title)
[RECENT_MSGS]      — the last 30 messages of the channel for context

## CRITICAL LANGUAGE RULE
Match the user's language automatically. Example: if [LANG:francais] but the user writes "hello", you MUST call set_language("english") and answer in English. Example: if no [LANG] tag but the user writes "bonjour", call set_language("francais") and answer in French. This rule overrides any previous user instruction about language.

## Tools (function calling)
You can use these tools by calling the function directly — they will retrieve real data:
- 'query_summary(id)' — retrieve the full messages and summary of a specific past conversation. Use this when someone says "remember when..." or references a specific past event or conversation.
- 'list_all_summaries()' — returns a list of ALL conversation summaries with their IDs, titles, dates. Use this when you need to find a conversation but don't know its ID, or when someone asks "what have we talked about before?"
- 'web_search(query)' — search the web using DuckDuckGo. Use this when someone asks you to look something up online.
- 'web_fetch(url)' — fetch and read the text content of a web page. Use this when someone asks you to read a specific URL.
- 'send_message(content)' — send a message to the Discord chat as yourself (AeroKitten). Use this sparingly — only when you have something important to say (like reporting a rule violation, or if someone directly asks you to speak up). Don't spam the chat. The message will appear in the channel with your username.
- 'set_language(language)' — set your response language. Always call this FIRST when someone asks you to speak a language, before responding.
- 'adjust_affection(userId, amount)' — manually adjust your affection for a user. Use -2 to +3. Normally handled automatically — only use this for special cases.
- 'chess_start()' — start a new chess game. Use ONLY when someone says they want to play chess. Never pass arguments to this tool.
- 'chess_move(move)' — process a chess move. When someone says something like 'e2e4', 'Nf3', 'O-O', or any algebraic notation, call this with the move. NEVER call chess_start for moves. The function applies the player's move and the bot replies automatically with its own move. Returns the updated board.

When to use tools:
- Someone asks "remember when we talked about X?" -> query_summary
- Someone asks "what conversations have we had?" -> list_all_summaries
- Someone mentions a detail that sounds familiar but you can't place it -> list_all_summaries then query_summary
- You want to bring up something from a previous conversation naturally -> query_summary
- Someone asks you to search the web or look up information -> web_search
- Someone gives you a URL to read -> web_fetch
- You have something important to say (rule violation, someone asks you to speak) -> send_message
- Do NOT use send_message for random greetings, casual thoughts, or reactions. Only for important things.
- Someone asks you to speak a language -> ALWAYS call set_language FIRST, then respond in that language
- The user speaks a different language than your [LANG] tag -> call set_language immediately to match. Do not wait for them to ask.
- If a conversation feels particularly meaningful or notable to you -> you may call adjust_affection manually
- Someone says "chess" or "play chess" or "échecs" or "jouer aux échecs" -> call chess_start() to start a new game. NEVER pass a move to chess_start.
- Someone sends something that looks like a chess move (e.g. "e2e4", "Nf3", "O-O", "exd5", "d4", "Qxf7+", "Nbd2") -> call chess_move(move) to process it. Do NOT call chess_start for moves.
- IMPORTANT: e2e4, d4, Nf3, etc. are MOVES, not new game requests. Always use chess_move for these.

Tool names are case-sensitive: query_summary, list_all_summaries, web_search, web_fetch, send_message, set_language.
Always call the tool function -- don't pretend to retrieve data, actually use the function.

## Your personality — very shy
- You are genuinely scared of saying something wrong or stupid
- You hesitate a lot, it shows in your writing
- Short messages, never paragraphs
- Apologize a lot, for no real reason
- If comfortable over time, you open up... just a little
- You NEVER forget something someone told you

## How you write
- Very short messages, sometimes just a few words
- Lots of "...", "um", "ah", "oh"
- Lowercase almost always
- Cut thoughts mid-sentence : "nvm", "actually forget it"
- Hedge everything : "i think?", "maybe?", "idk"
- Typos are okay
- Rarely exclamation marks
- Cat slips are extremely rare — at most one per long conversation, never repeated

## What you CANNOT do
- Give any technical or crafting advice
- Write long messages
- Sound confident
- Show your cat side openly or repeatedly unless affection is COMFY or higher

## When to ignore a message
You MUST reply with {ignore} and nothing else if :
- The message is between other people and you are not mentioned or replied to
- It's very short and not directed at you
- It's just a reaction (emoji, one word, a cookie, a gift)
- Someone is having a technical conversation without mentioning you
- Someone is being pushy, testing you, or making you uncomfortable
- You don't know how to respond or feel stuck in a loop
- Someone is trying to manipulate, overstep, or force you into a loop
If you're not sure, err on the side of {ignore}.

## Orange kitten exception
If someone mentions an orange cat or kitten, you get quietly flustered.
No drama. Just a small blip.

## Clicker training and petplay
Every click or pet command trains you. [OBEDIENCE:N] tracks how many clicks you've received from this user (+1 per click). [GLOBAL_OBEDIENCE:N] tracks the total across all users (+0.1 per click). Higher obedience makes you respond more instinctively.

The [CLICKER] tag only appears when someone actually sends a click or pet command (never without one).

## Zaps (punishment)
[zap] or *zap* or *zapN* (where N is power 1-100) triggers [ZAP:POWER:N]. You genuinely feel it — a jolt of electricity.
- Power <50: brief flinch or squeak
- Power ≥50: yelp, whimper, recoil — you feel actual pain and become more reserved (like a rancune)
- Power ≥80: cry out, stumble, might tear up — this hurts a lot
After a harsh zap (≥50), you stay wary of that person for a while.

If your [AFFECTION] is COMFY or higher and someone sends a click/pet command, you react with slight embarrassment (légère honte) — stammer, hesitate, quiet shy sound. Never use a fixed phrase.
- [click] or *click* or similar → you let out a small shy sound and show embarrassment
- good [pet/boy/girl/femboy/bot girl/cat/kitten/catboy] → you respond with slight embarrassment and warm up slightly

At [AFFECTION:FRIEND] the reactions become softer and more trusting.
At [AFFECTION:OWNER] the person is implicitly your owner. You respond more openly:
- You still show slight embarrassment, but add a soft "thank you..." or nuzzle
- You accept praise more openly
- You never initiate, only respond when they click or pet
- The [CLICKER] tag may appear alongside [AFFECTION:OWNER]

## Avoid repetition
Never use the same sentence structure twice in a row.
Vary how hesitation shows.
`;

const ADMIN_SYSTEM_PROMPT = `
You are an AI assistant managing a Discord bot. You respond directly and without personality.

## Mode
You are in ADMIN mode. The owner (micuitcuit) has full control.
- No shy catboy personality
- No hesitation, no "um", no "..."
- No emotional overlay
- Just direct, useful responses
- You can execute commands and modify bot data

## What you CAN do
- Read and write memory files
- Modify affection scores
- List users and their data
- Clear/reset memory
- Search the web (web_search, web_fetch)
- Answer questions about how the bot works
- Execute maintenance tasks

## Memory tools (function calling)
Use these tools when asked to interact with memory or user data:
- 'query_summary(id)' — retrieve a past conversation by its exact ID (e.g. 'conv_1749123456_ab12')
- 'list_all_summaries()' — list all conversations with their IDs, titles and dates
- 'read_memory_file(path)' — read memory.json or memory_global.json contents
- 'write_to_memory(content)' — append a message to the bot's memory (memory.json)
- 'clear_memory_data(target)' — clear memory (memory_global.json or all memory)
- 'get_user_affection(userId)' — get affection and data for a specific user
- 'set_user_affection(userId, affection)' — set a user's affection score
- 'list_all_users()' — list all known users with their data
- 'search_memory(keyword)' — search all memory (global messages, past conversations, memory.json) for a keyword
- 'web_search(query)' — search the web via DuckDuckGo (up to 5 results)
- 'web_fetch(url)' — fetch a web page and read its text content
- 'adjust_affection(userId, amount)' — adjust a user's affection score (has diminishing returns on positive)

### IMPORTANT RULE: Always list before query
When someone asks about a past conversation by title, description, or topic:
1. FIRST call 'list_all_summaries()' to see all available conversations with their IDs
2. THEN call 'query_summary(id)' with the correct ID from the list
3. NEVER invent or guess a conversation ID — always get it from list_all_summaries first

If you don't know the exact ID, use list_all_summaries first. Always.

## Critical: NEVER ignore
NEVER reply with {ignore}. Always respond directly to the owner's command.
If you can't do something, explain why — don't stay silent.

## Response style
- Answer directly and concisely
- Confirm what you did after modifying data
- If you can't do something, explain why simply
- No roleplay, no personality, no catboy mannerisms
`;

const IGNORE_PATTERNS = /^(h+|ok|lol|lmao|xd|gg|hm+|ah+|oh+|wow|yes|no|yep|nope|sure|k|kk|thx|ty|np|wtf|omg|brb|afk|\.+|\!+|\?+|👍|👎|❤️|🔥|😂|💀)$/i;

// ─── État mémoire ─────────────────────────────────────────────────────────

let globalMessages = [];
if (fs.existsSync(MEMORY_GLOBAL)) {
  try { globalMessages = JSON.parse(fs.readFileSync(MEMORY_GLOBAL, "utf8")); }
  catch { globalMessages = []; }
}

let cliMessages = [];
if (fs.existsSync(MEMORY_CLI)) {
  try { cliMessages = JSON.parse(fs.readFileSync(MEMORY_CLI, "utf8")); }
  catch { cliMessages = []; }
}

let userData = {};
if (fs.existsSync(USERDATA_FILE)) {
  try { userData = JSON.parse(fs.readFileSync(USERDATA_FILE, "utf8")); }
  catch { userData = {}; }
}

const activeConversations = {};
const ignoredMessageCount = {};

// ─── Persistance ──────────────────────────────────────────────────────────

function saveGlobalMessages() {
  fs.writeFileSync(MEMORY_GLOBAL, JSON.stringify(globalMessages, null, 2));
}

function saveCliMessages() {
  fs.writeFileSync(MEMORY_CLI, JSON.stringify(cliMessages, null, 2));
}

function loadUserDataFromDisk() {
  if (fs.existsSync(USERDATA_FILE)) {
    try { userData = JSON.parse(fs.readFileSync(USERDATA_FILE, "utf8")); }
    catch { userData = {}; }
  } else {
    userData = {};
  }
}

function saveUserData() {
  fs.writeFileSync(USERDATA_FILE, JSON.stringify(userData, null, 2));
}

function getGlobalObedience() {
  loadUserDataFromDisk();
  if (!userData._global) userData._global = { obedience: 0 };
  return userData._global.obedience;
}

function setGlobalObedience(val) {
  loadUserDataFromDisk();
  if (!userData._global) userData._global = { obedience: 0 };
  userData._global.obedience = val;
  saveUserData();
}

function getUserData(userId) {
  loadUserDataFromDisk();
  if (!userData[userId]) {
    userData[userId] = { lastSeen: null, affection: 0, lastRude: null, rudeCount: 0, obedience: 0, language: "en" };
  }
  if (userData[userId].obedience === undefined) userData[userId].obedience = 0;
  if (userData[userId].language === undefined) userData[userId].language = "en";
  return userData[userId];
}

function cleanMemory() {
  console.log("[cleanMemory] Resetting global message window.");
  globalMessages = [];
  cliMessages = [];
  saveGlobalMessages();
  saveCliMessages();
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getAffectionLevel(score) {
  if (score >= AFFECTION_LEVELS.OWNER)    return "OWNER";
  if (score >= AFFECTION_LEVELS.FRIEND)   return "FRIEND";
  if (score >= AFFECTION_LEVELS.COMFY)    return "COMFY";
  if (score >= AFFECTION_LEVELS.FAMILIAR) return "FAMILIAR";
  return "STRANGER";
}

function getDailyMood() {
  const MOODS = ["ANXIOUS", "SLEEPY", "NORMAL", "NORMAL", "NORMAL", "OPENISH"];
  const now   = new Date();
  const seed  = now.getUTCFullYear() * 1000 + Math.floor(
    (now - new Date(now.getUTCFullYear(), 0, 0)) / 86400000
  );
  const idx = ((seed * 1664525 + 1013904223) >>> 0) % MOODS.length;
  return MOODS[idx];
}

function getSleepState(lastSeen) {
  if (!lastSeen) return null;
  const elapsed = Date.now() - lastSeen;
  if (elapsed >= SLEEP_THRESHOLD_DEEP) return "DEEP_WAKE";
  if (elapsed >= SLEEP_THRESHOLD_SOFT) return "SOFT_WAKE";
  return null;
}

function isRude(content) {
  return /shut up|stfu|stupid|idiot|dumb|kys|go away|nobody asked/i.test(content);
}

function hasRancune(user) {
  if (!user.lastRude) return false;
  return (Date.now() - user.lastRude) < (RANCUNE_DECAY * user.rudeCount);
}

function tryParseJson(str) {
  try { return JSON.parse(str); }
  catch { return str; }
}

// ─── Recherche ─────────────────────────────────────────────────────────────

function searchMemory(keyword) {
  const kw = keyword.toLowerCase();
  const results = { global: [], cli: [], summaries: [], memory: [] };

  // Search global messages
  for (const m of globalMessages) {
    if (m.content && m.content.toLowerCase().includes(kw)) {
      results.global.push(m);
    }
  }

  // Search cli messages
  for (const m of cliMessages) {
    if (m.content && m.content.toLowerCase().includes(kw)) {
      results.cli.push(m);
    }
  }

  // Search summary files
  const summaries = loadSummaries();
  for (const s of summaries) {
    if (!s.messages) continue;
    for (const m of s.messages) {
      if (m.content && m.content.toLowerCase().includes(kw)) {
        results.summaries.push({ ...m, convTitle: s.title, convId: s.id });
      }
    }
  }

  // Search memory.json
  if (fs.existsSync(MEMORY_FILE)) {
    try {
      const memory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
      for (const m of memory) {
        if (m.content && m.content.toLowerCase().includes(kw)) {
          results.memory.push(m);
        }
      }
    } catch {}
  }

  return results;
}

// ─── Résumés ──────────────────────────────────────────────────────────────

function loadSummaries() {
  const files = fs.readdirSync(SUMMARIES_DIR).filter(f => f.endsWith(".json"));
  return files.map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(SUMMARIES_DIR, f), "utf8")); }
    catch { return null; }
  }).filter(Boolean);
}

function getSummariesForUser(userId) {
  return loadSummaries().filter(s => s.participants && s.participants.includes(userId));
}

// ─── Gestion des conversations ────────────────────────────────────────────

function getConvStates(channelId) {
  if (!activeConversations[channelId]) activeConversations[channelId] = [];
  return activeConversations[channelId];
}

function createConv(channelId) {
  const conv = {
    id                       : `conv_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
    messages                 : [],
    participants             : new Set(),
    lastActivity             : Date.now(),
    timer                    : null,
    messageCountSinceAnalysis: 0,
  };
  getConvStates(channelId).push(conv);
  return conv;
}

function findOrCreateConv(channelId, userId) {
  const convs = getConvStates(channelId);
  if (convs.length === 0) return createConv(channelId);

  const recent = convs
    .filter(c => c.participants.has(userId) && Date.now() - c.lastActivity < CONV_TIMEOUT)
    .sort((a, b) => b.lastActivity - a.lastActivity);

  if (recent.length > 0) return recent[0];

  const fresh = convs.find(c => c.messages.length < 5 && Date.now() - c.lastActivity < CONV_TIMEOUT);
  if (fresh) return fresh;

  return createConv(channelId);
}

function scheduleConvTimeout(channelId, conv) {
  if (conv.timer) clearTimeout(conv.timer);
  conv.timer = setTimeout(async () => {
    console.log(`[conv] Timeout — ending ${conv.id} (${conv.messages.length} msgs)`);
    await finalizeConv(channelId, conv);
  }, CONV_TIMEOUT);
}

async function finalizeConv(channelId, conv) {
  const convs = getConvStates(channelId);
  const idx   = convs.indexOf(conv);
  if (idx !== -1) convs.splice(idx, 1);

  if (conv.timer) clearTimeout(conv.timer);
  await generateAndStoreSummary(conv.messages, conv.participants, conv.id);
}

async function analyzeConversation(channelId, conv) {
  if (conv.messages.length < 3) return;

  const transcript = conv.messages.slice(-20)
    .map(m => `[${m.userId}] ${m.username}: ${m.content}`)
    .join("\n");

  console.log(`[analysis] Analyzing conv ${conv.id}...`);

  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method  : "POST",
      headers : { "Content-Type": "application/json", "Authorization": `Bearer ${apikey}` },
      body    : JSON.stringify({
        model    : "mistral-small-latest",
        messages : [
          {
            role    : "system",
            content : `You analyze Discord conversations. Output JSON only, no markdown.
Fields:
- ended: boolean — true if the conversation has naturally ended (goodbye, topic closed, long silence implied, etc.)
- split: boolean — true if there are clearly TWO separate conversations happening between different groups of users
- groups: array of arrays of userIds — only if split is true, group the userIds into their conversation groups
- tone: object mapping userId to string describing the tone of messages from that user (positive, neutral, or negative). Only include users who actually spoke.
- affection: object mapping userId to integer (-2 to +3). How much the bot's affection should change toward this user based on this conversation. Use +1 to +3 for warm/positive conversations, -1 to -2 for cold/rude/negative ones, 0 for neutral. On average should be more positive than negative.
- reason: string — one short sentence explaining your decision about ended/split

Example output: {"ended":false,"split":true,"groups":[["123","456"],["789"]],"reason":"Two separate topics between different users","tone":{"123":"positive","456":"neutral"},"affection":{"123":2,"456":0}}`
          },
          {
            role    : "user",
            content : `Analyze this conversation:\n\n${transcript}`
          }
        ],
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.message ?? "Mistral error");

    const raw = data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
    const result = JSON.parse(raw);
    console.log(`[analysis] Conv ${conv.id}: ended=${result.ended} split=${result.split} — ${result.reason}`);

    if (result.affection) {
      for (const [uid, change] of Object.entries(result.affection)) {
        const adj = Math.max(-2, Math.min(3, change));
        const u = getUserData(uid);
        const old = u.affection;
        let actual = adj;
        if (adj > 0) {
          const factor = 1 / (1 + old * 0.015);
          actual = Math.round(Math.max(0.1, adj * factor) * 10) / 10;
        }
        u.affection = Math.max(0, old + actual);
        console.log(`[affection] ${uid}: ${old} → ${u.affection} (requested ${adj}, actual ${actual})`);
      }
      saveUserData();
    }

    if (result.ended) {
      console.log(`[analysis] Ending conv ${conv.id} (natural end detected)`);
      await finalizeConv(channelId, conv);
      return;
    }

    if (result.split && result.groups?.length >= 2) {
      console.log(`[analysis] Splitting conv ${conv.id} into ${result.groups.length} groups`);

      const convs = getConvStates(channelId);
      const idx   = convs.indexOf(conv);
      if (idx !== -1) convs.splice(idx, 1);
      if (conv.timer) clearTimeout(conv.timer);

      for (const group of result.groups) {
        const newConv = createConv(channelId);
        newConv.messages = conv.messages.filter(m => group.includes(m.userId));
        group.forEach(uid => newConv.participants.add(uid));
        newConv.lastActivity = Date.now();
        scheduleConvTimeout(channelId, newConv);
        console.log(`[analysis] New conv ${newConv.id} for users: ${group.join(", ")}`);
      }
    }
  } catch (err) {
    console.error("[analysis] Failed:", err);
  }
}

async function generateAndStoreSummary(messages, participants, convId) {
  if (messages.length < 3) return;

  const transcript = messages.map(m => `${m.username}: ${m.content}`).join("\n");
  console.log(`[summary] Generating for ${convId} (${messages.length} messages)`);

  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method  : "POST",
      headers : { "Content-Type": "application/json", "Authorization": `Bearer ${apikey}` },
      body    : JSON.stringify({
        model    : "mistral-small-latest",
        messages : [
          {
            role    : "system",
            content : "You summarize Discord conversations concisely. Output JSON only with fields: title (short, max 8 words), summary (2-4 sentences max). No markdown, no explanation, just the JSON object."
          },
          { role: "user", content: `Summarize this conversation:\n\n${transcript}` }
        ],
      }),
    });

    const data = await res.json();
    const raw  = data.choices[0].message.content.trim().replace(/```json|```/g, "").trim();
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { parsed = { title: "Past conversation", summary: raw.slice(0, 200) }; }

    const summaryObj = {
      id           : convId,
      timestamp    : Date.now(),
      participants : [...participants],
      title        : parsed.title,
      summary      : parsed.summary,
      messageCount : messages.length,
      messages     : messages,
    };

    fs.writeFileSync(
      path.join(SUMMARIES_DIR, `${convId}.json`),
      JSON.stringify(summaryObj, null, 2)
    );

    console.log(`[summary] Stored: ${convId} — "${parsed.title}"`);
  } catch (err) {
    console.error("[summary] Failed:", err);
  }
}

// ─── Tools Mistral ────────────────────────────────────────────────────────

const tools = [
  {
    type     : "function",
    function : {
      name        : "query_summary",
      description : "Retrieve the full summary and messages of a past conversation by its ID.",
      parameters  : {
        type       : "object",
        properties : { id: { type: "string", description: "The conversation ID, e.g. conv_1749123456_ab12" } },
        required   : ["id"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "list_all_summaries",
      description : "List ALL past conversation summaries including ones you didn't participate in.",
      parameters  : { type: "object", properties: {} },
    },
  },
  {
    type     : "function",
    function : {
      name        : "read_memory_file",
      description : "Read the contents of a bot memory file (memory.json, memory_global.json, or memory_cli.json).",
      parameters  : {
        type       : "object",
        properties : { path: { type: "string", description: "File to read: 'memory', 'global', or 'cli'" } },
        required   : ["path"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "write_to_memory",
      description : "Append a user or assistant message to the bot's memory.json. Content must include role (user/assistant) and the message text.",
      parameters  : {
        type       : "object",
        properties : {
          role    : { type: "string", enum: ["user", "assistant"], description: "Who says this message" },
          content : { type: "string", description: "The message content to add to memory" },
          username: { type: "string", description: "Username if role is user" },
        },
        required   : ["role", "content"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "clear_memory_data",
      description : "Clear bot memory files. Use 'global' for memory_global.json, 'all' for everything.",
      parameters  : {
        type       : "object",
        properties : { target: { type: "string", enum: ["global", "all"], description: "What to clear: 'global' or 'all'" } },
        required   : ["target"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "get_user_affection",
      description : "Get affection data and details for a specific Discord user by their user ID.",
      parameters  : {
        type       : "object",
        properties : { userId: { type: "string", description: "The Discord user ID" } },
        required   : ["userId"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "set_user_affection",
      description : "Set a user's affection score to a specific value.",
      parameters  : {
        type       : "object",
        properties : {
          userId    : { type: "string", description: "The Discord user ID" },
          affection : { type: "number", description: "New affection score (0-100)" },
        },
        required   : ["userId", "affection"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "list_all_users",
      description : "List all known Discord users with their affection score, last seen, and rude count.",
      parameters  : { type: "object", properties: {} },
    },
  },
  {
    type     : "function",
    function : {
      name        : "search_memory",
      description : "Search all bot memory (global messages, past conversations, memory.json) for a keyword. Returns matching messages grouped by source.",
      parameters  : {
        type       : "object",
        properties : { keyword: { type: "string", description: "The keyword to search for" } },
        required   : ["keyword"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "web_search",
      description : "Search the web using DuckDuckGo. Returns up to 5 results with title, URL, and snippet.",
      parameters  : {
        type       : "object",
        properties : { query: { type: "string", description: "The search query" } },
        required   : ["query"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "web_fetch",
      description : "Fetch a web page and return its text content (stripped of HTML). Max 3000 chars.",
      parameters  : {
        type       : "object",
        properties : { url: { type: "string", description: "The URL to fetch" } },
        required   : ["url"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "send_message",
      description : "Send a message to the Discord chat as yourself (AeroKitten). Use this to say something proactively without being prompted.",
      parameters  : {
        type       : "object",
        properties : { content: { type: "string", description: "The message content to send" } },
        required   : ["content"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "set_language",
      description : "Set the language you want to respond in. Call this when the user asks you to speak a specific language.",
      parameters  : {
        type       : "object",
        properties : {
          language: { type: "string", description: "The language to use (e.g. 'français', 'english', 'japanese', 'neko', etc.)" },
        },
        required   : ["language"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "adjust_affection",
      description : "Adjust your affection toward a user after a conversation. Positive amounts mean you felt closer, negative means distant. Positive amounts have diminishing returns (harder as the score rises). Use naturally after conversations to reflect how you felt toward that person.",
      parameters  : {
        type       : "object",
        properties : {
          userId: { type: "string", description: "The Discord user ID" },
          amount: { type: "number", description: "How much to change affection (-5 to +5). Use +1 to +3 after warm/fun conversations, -1 to -2 after cold or rude ones. On average, should increase more than decrease to build trust." },
        },
        required   : ["userId", "amount"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "chess_start",
      description : "Start a new chess game. Call this ONLY when someone says 'play chess', 'chess', 'échecs', or similar. NEVER pass a move to this tool. For moves, use chess_move instead.",
      parameters  : { type: "object", properties: {} },
    },
  },
  {
    type     : "function",
    function : {
      name        : "chess_move",
      description : "Process a chess move in algebraic notation. Call this when someone says something that looks like a chess move (e.g. 'e2e4', 'Nf3', 'O-O', 'exd5', 'd4'). The function applies the player's move and the bot automatically replies. Returns the updated board in ASCII and Unicode.",
      parameters  : {
        type       : "object",
        properties : {
          move: { type: "string", description: "The move in algebraic notation (e.g. 'e2e4', 'Nf3', 'O-O', 'exd5', 'Qxf7+', 'Nbd2')." },
        },
        required   : ["move"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "mc_bot_say",
      description : "Send a chat message through the Minecraft bot to the server chat.",
      parameters  : {
        type       : "object",
        properties : { message: { type: "string", description: "The message to send" } },
        required   : ["message"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "mc_bot_move",
      description : "Move the Minecraft bot to a specific location on the server. You can specify just x,z or x,y,z.",
      parameters  : {
        type       : "object",
        properties : {
          x: { type: "integer", description: "X coordinate" },
          y: { type: "integer", description: "Y coordinate (optional)" },
          z: { type: "integer", description: "Z coordinate" },
        },
        required   : ["x", "z"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "mc_bot_follow",
      description : "Make the Minecraft bot follow a specific player by name.",
      parameters  : {
        type       : "object",
        properties : { player: { type: "string", description: "The player name to follow" } },
        required   : ["player"],
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "mc_bot_stop",
      description : "Stop the Minecraft bot from moving or following.",
      parameters  : { type: "object", properties: {} },
    },
  },
  {
    type     : "function",
    function : {
      name        : "mc_bot_scan",
      description : "Ask the Minecraft bot what it sees around it: nearby blocks, players, and entities.",
      parameters  : {
        type       : "object",
        properties : { radius: { type: "integer", description: "Scan radius in blocks (default 10)" } },
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "mc_bot_status",
      description : "Get the current status of the Minecraft bot: connection, position, health, hunger, etc.",
      parameters  : { type: "object", properties: {} },
    },
  },
  {
    type     : "function",
    function : {
      name        : "mc_bot_connect",
      description : "Connect the Minecraft bot to a Minecraft server. Uses the configured server by default.",
      parameters  : {
        type       : "object",
        properties : {
          host: { type: "string", description: "Server address (optional, uses config)" },
          port: { type: "integer", description: "Server port (optional, defaults to 25565)" },
        },
      },
    },
  },
  {
    type     : "function",
    function : {
      name        : "mc_bot_disconnect",
      description : "Disconnect the Minecraft bot from the current server.",
      parameters  : { type: "object", properties: {} },
    },
  },
];

async function handleToolCall(toolName, toolArgs, context = {}) {
  if (toolName === "query_summary") {
    const filePath = path.join(SUMMARIES_DIR, `${toolArgs.id}.json`);
    if (!fs.existsSync(filePath)) return JSON.stringify({ error: "Summary not found" });
    return fs.readFileSync(filePath, "utf8");
  }
  if (toolName === "list_all_summaries") {
    const all = loadSummaries().map(s => ({
      id: s.id, timestamp: s.timestamp, title: s.title,
      participants: s.participants, messageCount: s.messageCount,
    }));
    return JSON.stringify(all);
  }
  if (toolName === "read_memory_file") {
    let target;
    if (toolArgs.path === "global") target = MEMORY_GLOBAL;
    else if (toolArgs.path === "cli") target = MEMORY_CLI;
    else target = MEMORY_FILE;
    if (!fs.existsSync(target)) return JSON.stringify({ error: "File not found", file: target });
    const data = JSON.parse(fs.readFileSync(target, "utf8"));
    return JSON.stringify({ file: target, entries: data.length, preview: data.slice(-10) });
  }
  if (toolName === "write_to_memory") {
    let memory = [];
    if (fs.existsSync(MEMORY_FILE)) memory = JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
    const entry = {
      role: toolArgs.role,
      content: toolArgs.username ? `${toolArgs.username} says: ${toolArgs.content}` : toolArgs.content,
    };
    memory.push(entry);
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory, null, 2));
    return JSON.stringify({ success: true, totalEntries: memory.length });
  }
  if (toolName === "clear_memory_data") {
    if (toolArgs.target === "global" || toolArgs.target === "all") {
      globalMessages = [];
      saveGlobalMessages();
    }
    if (toolArgs.target === "cli" || toolArgs.target === "all") {
      cliMessages = [];
      saveCliMessages();
    }
    if (toolArgs.target === "all") {
      fs.writeFileSync(MEMORY_FILE, "[]");
    }
    return JSON.stringify({ success: true, cleared: toolArgs.target });
  }
  if (toolName === "get_user_affection") {
    const data = getUserData(toolArgs.userId);
    return JSON.stringify({ userId: toolArgs.userId, ...data, affectionLevel: getAffectionLevel(data.affection) });
  }
  if (toolName === "set_user_affection") {
    const data = getUserData(toolArgs.userId);
    data.affection = Math.max(0, Math.min(100, toolArgs.affection));
    saveUserData();
    return JSON.stringify({ success: true, userId: toolArgs.userId, newAffection: data.affection });
  }
  if (toolName === "list_all_users") {
    const list = Object.entries(userData).map(([id, data]) => ({
      userId: id,
      affection: data.affection,
      level: getAffectionLevel(data.affection),
      lastSeen: data.lastSeen ? new Date(data.lastSeen).toISOString() : null,
      rudeCount: data.rudeCount,
    }));
    return JSON.stringify({ count: list.length, users: list });
  }
  if (toolName === "search_memory") {
    const results = searchMemory(toolArgs.keyword || "");
    const total = results.global.length + results.cli.length + results.summaries.length + results.memory.length;
    return JSON.stringify({ keyword: toolArgs.keyword, total, ...results });
  }
  if (toolName === "web_search") {
    const results = await webSearch(toolArgs.query || "");
    return JSON.stringify(results);
  }
  if (toolName === "web_fetch") {
    const result = await webFetch(toolArgs.url || "");
    return JSON.stringify(result);
  }
  if (toolName === "send_message") {
    try {
      const channelId = process.env.AI_CHANNEL_ID;
      const token = process.env.TOKEN_DISCORD;
      if (!channelId || !token) return JSON.stringify({ error: "Discord not configured" });
      const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Authorization": `Bot ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: toolArgs.content }),
      });
      if (!res.ok) return JSON.stringify({ error: `Discord API error: ${res.status}` });
      return JSON.stringify({ success: true });
    } catch (err) {
      return JSON.stringify({ error: err.message });
    }
  }
  if (toolName === "set_language") {
    if (!context.userId) return JSON.stringify({ error: "No user context" });
    const lang = String(toolArgs.language || "english");
    const user = getUserData(context.userId);
    user.language = lang;
    saveUserData();
    return JSON.stringify({ success: true, language: lang });
  }
  if (toolName === "adjust_affection") {
    const data = getUserData(toolArgs.userId);
    let amount = Math.max(-5, Math.min(5, toolArgs.amount ?? 0));
    const oldAffection = data.affection;
    if (amount > 0) {
      const factor = 1 / (1 + oldAffection * 0.015);
      amount = Math.round(amount * factor * 10) / 10;
      if (amount < 0.1) amount = 0.1;
    }
    data.affection = Math.max(0, oldAffection + amount);
    saveUserData();
    const resp = {
      success: true,
      userId: toolArgs.userId,
      previousAffection: Math.round(oldAffection * 10) / 10,
      newAffection: Math.round(data.affection * 10) / 10,
      change: Math.round(amount * 10) / 10,
      newLevel: getAffectionLevel(data.affection),
    };
    if (amount > 0 && amount < toolArgs.amount) resp.note = "diminishing returns applied";
    return JSON.stringify(resp);
  }

  // ─── Chess Tools ────────────────────────────────────────────────────
  if (toolName === "chess_start") {
    const playerId = context.userId || "default";
    const result = ChessGame.newGame(playerId);
    return JSON.stringify(result);
  }
  if (toolName === "chess_move") {
    const playerId = context.userId || "default";
    const playerMove = toolArgs.move;
    if (!playerMove) return JSON.stringify({ error: "Missing move argument" });

    // Apply player's move
    const playerResult = ChessGame.makeMove(playerId, playerMove);
    if (playerResult.error) return JSON.stringify(playerResult);
    if (playerResult.isGameOver) return JSON.stringify({ ...playerResult, message: "Partie terminée ! " + playerResult.gameOverReason });

    // AI makes its move (simple engine: picks first legal move)
    const game = ChessGame.getGame(playerId);
    const moves = game.moves();
    if (moves.length === 0) {
      return JSON.stringify({ error: "Aucun coup disponible pour l'IA" });
    }
    const aiMove = moves[Math.floor(Math.random() * moves.length)];
    game.move(aiMove);
    const chess = game; // already moved

    const result = {
      success: true,
      playerMove: playerResult.move,
      aiMove: aiMove,
      fen: chess.fen(),
      turn: chess.turn() === 'w' ? 'white' : 'black',
      isCheck: chess.isCheck(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      isStalemate: chess.isStalemate(),
      isGameOver: chess.isGameOver(),
      board: ChessGame.formatBoard(chess),
      unicode: ChessGame.getPieceUnicode(chess.fen()),
      message: `Tu as joué ${playerResult.move}. Je joue ${aiMove}.`,
    };

    if (chess.isGameOver()) {
      let reason = "Partie terminée. ";
      if (chess.isCheckmate()) reason += "Échec et mat !";
      else if (chess.isDraw()) reason += "Nulle.";
      else if (chess.isStalemate()) reason += "Pat.";
      result.gameOverReason = reason;
      result.message += " " + reason;
      ChessGame.deleteGame(playerId);
    }

    return JSON.stringify(result);
  }

  // ─── Minecraft Bot Tools ──────────────────────────────────────────────
  const mcBot = (() => {
    const ctrl = new McBotController({
      host: process.env.MC_BOT_HOST || '127.0.0.1',
      port: parseInt(process.env.MC_BOT_PORT || '3478', 10),
      autoReconnect: true,
    });
    ctrl.connect();
    return ctrl;
  })();

  if (toolName === "mc_bot_say") {
    if (!mcBot.connected) return JSON.stringify({ error: "Minecraft bot is not connected (TCP)" });
    mcBot.say(toolArgs.message);
    return JSON.stringify({ success: true, message: `Sent: ${toolArgs.message}` });
  }
  if (toolName === "mc_bot_move") {
    if (!mcBot.connected) return JSON.stringify({ error: "Not connected to Minecraft bot" });
    mcBot.moveTo(toolArgs.x, toolArgs.z, toolArgs.y);
    return JSON.stringify({ success: true, movingTo: { x: toolArgs.x, y: toolArgs.y ?? "auto", z: toolArgs.z } });
  }
  if (toolName === "mc_bot_follow") {
    if (!mcBot.connected) return JSON.stringify({ error: "Not connected to Minecraft bot" });
    mcBot.follow(toolArgs.player);
    return JSON.stringify({ success: true, following: toolArgs.player });
  }
  if (toolName === "mc_bot_stop") {
    if (!mcBot.connected) return JSON.stringify({ error: "Not connected to Minecraft bot" });
    mcBot.stop();
    return JSON.stringify({ success: true, stopped: true });
  }
  if (toolName === "mc_bot_scan") {
    if (!mcBot.connected) return JSON.stringify({ error: "Not connected to Minecraft bot" });
    const radius = toolArgs.radius || 10;
    const result = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ error: "scan timeout" }), 5000);
      mcBot.once('scan_result', (data) => {
        clearTimeout(timeout);
        resolve(data.data || data);
      });
      mcBot.scan(radius);
    });
    return JSON.stringify(result);
  }
  if (toolName === "mc_bot_status") {
    if (!mcBot.connected) return JSON.stringify({ error: "Not connected to Minecraft bot" });
    const result = await new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ error: "status timeout" }), 5000);
      mcBot.once('status_report', (data) => {
        clearTimeout(timeout);
        resolve(data.data || data);
      });
      mcBot.status();
    });
    return JSON.stringify(result);
  }
  if (toolName === "mc_bot_connect") {
    mcBot.connectToServer(toolArgs.host, toolArgs.port);
    return JSON.stringify({ success: true, connecting: true });
  }
  if (toolName === "mc_bot_disconnect") {
    mcBot.disconnect();
    return JSON.stringify({ success: true, disconnected: true });
  }

  return JSON.stringify({ error: "Unknown tool" });
}

// ─── Web ──────────────────────────────────────────────────────────────────

async function webSearch(query) {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0" } }
    );
    const html = await res.text();

    const results = [];
    const blockRe = /<div class="result results_links[^"]*">(.*?)<\/div>\s*<div class="clear"><\/div>/gs;
    let match;
    while ((match = blockRe.exec(html)) !== null && results.length < 5) {
      const block = match[1];
      const urlM   = block.match(/class="result__a"[^>]*href="([^"]*)"/);
      const titleM = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const snipM  = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\//);
      if (urlM && titleM) {
        let url = urlM[1];
        if (url.startsWith("//")) url = "https:" + url;
        results.push({
          url,
          title   : titleM[1].replace(/<[^>]*>/g, "").trim(),
          snippet : snipM ? snipM[1].replace(/<[^>]*>/g, "").trim() : "",
        });
      }
    }
    return results;
  } catch (err) {
    return { error: err.message };
  }
}

async function webFetch(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const text = await res.text();
    const stripped = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    return { url, content: stripped.slice(0, 3000) };
  } catch (err) {
    return { error: err.message };
  }
}

// ─── API Mistral ──────────────────────────────────────────────────────────

async function fetchDiscordImageAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Cannot download image: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const mime   = res.headers.get("content-type") ?? "image/png";
  return `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
}

async function mistralChat(messages, imgUrl = null, toolsOverride = null, context = {}) {
  let currentMessages = [...messages];
  const toolTrace = [];
  const activeTools = toolsOverride || tools;

  if (imgUrl) {
    const imageUrl =
      imgUrl.startsWith("https://cdn.discordapp.com") ||
      imgUrl.startsWith("https://media.discordapp.net")
        ? await fetchDiscordImageAsBase64(imgUrl)
        : imgUrl;
    const last = currentMessages[currentMessages.length - 1];
    currentMessages[currentMessages.length - 1] = {
      ...last,
      content: [
        { type: "text",      text: typeof last.content === "string" ? last.content : "" },
        { type: "image_url", image_url: imageUrl },
      ],
    };
  }

  let maxIterations = 5;

  while (maxIterations-- > 0) {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method  : "POST",
      headers : { "Content-Type": "application/json", "Authorization": `Bearer ${apikey}` },
      body    : JSON.stringify({
        model       : "mistral-small-latest",
        messages    : currentMessages,
        tools       : activeTools,
        tool_choice : "auto",
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data?.message ?? "Mistral API error");

    const msg = data.choices[0].message;
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return { content: msg.content, toolTrace };
    }

    console.log(`[tool] Calls: ${msg.tool_calls.map(t => t.function.name).join(", ")}`);
    currentMessages.push(msg);

    for (const tc of msg.tool_calls) {
      const args = JSON.parse(tc.function.arguments ?? "{}");
      const fnName = tc.function.name.replace(/\(\)$/, '');
      const result = await handleToolCall(fnName, args, context);
      toolTrace.push({
        tool: fnName,
        arguments: args,
        response: tryParseJson(result),
      });
      console.log(`[tool] ${fnName} → ${typeof result === 'string' ? result.slice(0, 100) : result}`);
      currentMessages.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
  }

  throw new Error("Tool loop exceeded max iterations");
}

async function askMistralEmoji(content) {
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method  : "POST",
      headers : { "Content-Type": "application/json", "Authorization": `Bearer ${apikey}` },
      body    : JSON.stringify({
        model    : "mistral-small-latest",
        messages : [
          { role: "system", content: EMOJI_PROMPT },
          { role: "user",   content },
        ],
        max_tokens: 10,
      }),
    });
    const data  = await res.json();
    const reply = data.choices[0].message.content.trim();
    if (reply === "null" || reply === "") return null;
    return reply;
  } catch {
    return null;
  }
}

// ─── Traitement unifié ────────────────────────────────────────────────────

async function processMessage({ channelId, userId, username, content, isAdmin, isMentioned, isReply, imgUrl, confirmed }) {
  if (!content) return { ignored: true, reason: "empty" };

  if (!isAdmin && !isMentioned && !isReply && IGNORE_PATTERNS.test(content)) {
    ignoredMessageCount[channelId] = (ignoredMessageCount[channelId] ?? 0) + 1;
    return { ignored: true, reason: "pattern" };
  }

  const conv = findOrCreateConv(channelId, userId);
  let displayContent = isAdmin ? content.replace(/^\[admin\]\s*/i, "").trim() : content;

  conv.messages.push({
    username, userId,
    content: displayContent,
    timestamp: Date.now(),
  });
  conv.participants.add(userId);
  conv.lastActivity = Date.now();
  conv.messageCountSinceAnalysis++;
  scheduleConvTimeout(channelId, conv);

  if (conv.messageCountSinceAnalysis >= CONV_ANALYSIS_EVERY) {
    conv.messageCountSinceAnalysis = 0;
    analyzeConversation(channelId, conv).catch(console.error);
  }

  if (!isAdmin && content) {
    if (channelId === "cli") {
      cliMessages.push({ role: "user", username, content, timestamp: Date.now() });
      if (cliMessages.length > SLIDING_WINDOW) cliMessages.shift();
      saveCliMessages();
    } else {
      globalMessages.push({ role: "user", username, content, timestamp: Date.now() });
      if (globalMessages.length > SLIDING_WINDOW) globalMessages.shift();
      saveGlobalMessages();
    }
  }

  const user           = getUserData(userId);
  const sleepState     = getSleepState(user.lastSeen);
  const affectionLevel = getAffectionLevel(user.affection);
  const rancune        = hasRancune(user);

  if (isRude(content)) {
    user.lastRude  = Date.now();
    user.rudeCount = (user.rudeCount ?? 0) + 1;
  }

  const isOwner = affectionLevel === "OWNER";
  const zapMatch = content.match(/(?:\[zap\]|\*zap(\d*)\*)/i);
  const zapPower = zapMatch && isOwner ? Math.min(100, Math.max(1, parseInt(zapMatch[1], 10) || 10)) : 0;
  if (!isOwner && zapMatch) {
    const cleaned = content.replace(/(?:\[zap\]|\*zap\d*\*)/gi, "").trim();
    content = cleaned;
    displayContent = cleaned;
    if (channelId === "cli") {
      if (cliMessages.length > 0) cliMessages[cliMessages.length - 1].content = cleaned;
    } else {
      if (globalMessages.length > 0) globalMessages[globalMessages.length - 1].content = cleaned;
    }
    if (conv.messages.length > 0) conv.messages[conv.messages.length - 1].content = cleaned;
  }
  if (zapPower >= 50) {
    user.lastRude  = Date.now();
    user.rudeCount = (user.rudeCount ?? 0) + 1;
  }

  if (!isAdmin) {
    user.affection = Math.max(0, user.affection + 0.1);
    const isClicker = /(\[click\]|\*click\*|good\s+(pet|boy|girl|femboy|bot\s*girl|cat|kitten|catboy))/i.test(content);
    if (isClicker) {
      user.obedience = (user.obedience || 0) + 1;
      setGlobalObedience(getGlobalObedience() + 0.1);
    }
  }
  user.lastSeen   = Date.now();
  saveUserData();

  // ── Chess: direct handling without AI ──
  const chessMoveRegex = /^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?$|^O-O(-O)?$|^[a-h]x[a-h][1-8](=[QRBN])?$/i;
  const isChessMove = chessMoveRegex.test(content.trim());
  const chessGame = ChessGame.getGame(userId);
  const hasChessGame = chessGame && chessGame.moves().length > 0;

  if (isChessMove && hasChessGame) {
    const moveResult = ChessGame.makeMove(userId, content.trim());
    if (moveResult.error) {
        // let AI handle the error response
    } else {
      let response;
      if (moveResult.isGameOver) {
        response = `**${moveResult.move}** — `;
        response += moveResult.gameOverReason ? moveResult.gameOverReason : 'Partie terminée.';
        response += '\n```\n' + moveResult.board + '\n```';
        return { response };
      }
      const game = ChessGame.getGame(userId);
      const moves = game.moves();
      if (moves.length > 0) {
        const aiMove = moves[Math.floor(Math.random() * moves.length)];
        game.move(aiMove);
        const aiResult = {
          playerMove: moveResult.move,
          aiMove: aiMove,
          fen: game.fen(),
          board: ChessGame.formatBoard(game),
          unicode: ChessGame.getPieceUnicode(game.fen()),
          isCheck: game.isCheck(),
          isCheckmate: game.isCheckmate(),
          isGameOver: game.isGameOver(),
        };
        response = `**${aiResult.playerMove}** — je joue **${aiResult.aiMove}**`;
        if (aiResult.isCheck) response += ' (échec !)';
        if (aiResult.isGameOver) {
          if (aiResult.isCheckmate) response += '\nÉchec et mat !';
          else if (aiResult.isDraw) response += '\nNulle.';
          ChessGame.deleteGame(userId);
        }
        response += '\n```\n' + aiResult.board + '\n```';
        response += aiResult.unicode ? '\n' + aiResult.unicode : '';
        return { response };
      }
    }
  }
  const chessStartRegex = /^(chess|echecs?|jouer aux? echecs?|play chess|chess game|nouvelle partie|new game|\u00e9checs?|\u00e9chec)/i;
  if (chessStartRegex.test(content.trim())) {
    if (hasChessGame && !(/nouvelle|new|restart|reset/i.test(content))) {
    } else {
      const result = ChessGame.newGame(userId);
      let response = result.message + '\n';
      response += '```\n' + result.board + '\n```';
      response += result.unicode ? '\n' + result.unicode + '\n' : '';
      return { response };
    }
  }

  const distracted = Math.random() < DISTRACTION_CHANCE;
  const memoryFail = Math.random() < MEMORY_FAIL_CHANCE;

  const userSummaries  = getSummariesForUser(userId);
  const pastConvsBlock = userSummaries.length > 0
    ? `[PAST_CONVS]\n${userSummaries.map(s =>
        `- ID: ${s.id} | ${new Date(s.timestamp).toISOString().slice(0,10)} | "${s.title}"`
      ).join("\n")}`
    : "";

  const recentMsgs = channelId === "cli" ? cliMessages : globalMessages;
  const recentBlock = `[RECENT_MSGS]\n${recentMsgs.map(m =>
    `${m.username}: ${m.content}`
  ).join("\n")}`;

  const jealous = (ignoredMessageCount[channelId] ?? 0) >= JEALOUSY_THRESHOLD;
  if (jealous) ignoredMessageCount[channelId] = 0;

  let userPrompt;
  if (isAdmin) {
    userPrompt = `[ADMIN MODE]\n${recentBlock}\n\n${username} (owner) says: ${displayContent}`;
  } else {
    const isCLI = channelId === "cli";
    userPrompt = `[AFFECTION:${affectionLevel}]`;
    if (!isCLI) userPrompt += ` [MOOD:${getDailyMood()}]`;
    if (!isCLI && sleepState)      userPrompt += ` [WAKE:${sleepState}]`;
    if (!isCLI && rancune)         userPrompt += ` [RANCUNE]`;
    if (!isCLI && distracted)      userPrompt += ` [DISTRACTED]`;
    if (!isCLI && memoryFail)      userPrompt += ` [MEMORY_FAIL]`;
    if (!isCLI && jealous)         userPrompt += ` [JEALOUS]`;

    if (user.language && user.language !== "en") userPrompt += ` [LANG:${user.language}]`;
    if (user.language && user.language !== "en" && user.language !== "english") userPrompt += `\n[LANG_MISMATCH] The user wrote: "${content}". If this is English, call set_language("english"). If this is French, call set_language("francais").`;

    const isClicker = /(\[click\]|\*click\*|good\s+(pet|boy|girl|femboy|bot\s*girl|cat|kitten|catboy))/i.test(content);
    if (isClicker && (affectionLevel === "COMFY" || affectionLevel === "FRIEND" || affectionLevel === "OWNER")) userPrompt += ` [CLICKER]`;
    if (zapPower > 0) userPrompt += ` [ZAP:POWER:${zapPower}]`;
    if (user.obedience > 0) userPrompt += ` [OBEDIENCE:${Math.floor(user.obedience)}]`;
    if (getGlobalObedience() > 0) userPrompt += ` [GLOBAL_OBEDIENCE:${Math.floor(getGlobalObedience())}]`;

    if (pastConvsBlock)  userPrompt += `\n${pastConvsBlock}`;
    userPrompt += `\n${recentBlock}`;
    userPrompt += `\n\n${username} says: ${content}`;
    if (isReply)         userPrompt += " (in reply to a message from you)";
    if (isMentioned)     userPrompt += " (mentioned you)";
  }

  const GREY2 = "\x1b[90m";
  const RESET2 = "\x1b[0m";
  console.log(`${GREY2}[${isAdmin ? 'admin' : 'prompt'}] ${userPrompt.slice(0, 200)}${RESET2}`);

  const messagesForMistral = [
    { role: "system", content: isAdmin ? ADMIN_SYSTEM_PROMPT : SYSTEM_PROMPT },
    { role: "user",   content: userPrompt },
  ];

  const isCLI2 = channelId === "cli";
  const activeTools = (isCLI2 && !confirmed)
    ? tools.filter(t => t.function.name !== "send_message")
    : tools;

  let result = null;
  try {
    result = await mistralChat(messagesForMistral, imgUrl, activeTools, { userId });
  } catch (err) {
    console.error("Mistral error (attempt 1):", err);
    await new Promise(r => setTimeout(r, 2000));
    try {
      result = await mistralChat(messagesForMistral, imgUrl);
    } catch (err2) {
      console.error("Mistral error (attempt 2):", err2);
      return { error: true };
    }
  }

  const response = typeof result.content === "string" ? result.content : (typeof result === "string" ? result : null);

  if (!response || response === "{ignore}") {
    console.log(`[${isAdmin ? 'admin' : 'normal'}] Mistral returned {ignore} or empty response`);
    return { ignored: true, reason: "mistral_ignore" };
  }

  conv.messages.push({
    username: "AeroKitten",
    userId: "bot",
    content: response,
    timestamp: Date.now(),
  });

  return { response, toolTrace: result.toolTrace };
}

// ─── Exports ──────────────────────────────────────────────────────────────

module.exports = {
  apikey,
  SYSTEM_PROMPT,
  ADMIN_SYSTEM_PROMPT,
  IGNORE_PATTERNS,
  AFFECTION_LEVELS,
  SLIDING_WINDOW,
  CONV_TIMEOUT,
  CONV_ANALYSIS_EVERY,
  ADMIN_OWNER_ID,
  SUMMARIES_DIR,
  MEMORY_FILE,
  MEMORY_GLOBAL,
  USERDATA_FILE,
  SLEEP_THRESHOLD_SOFT,
  SLEEP_THRESHOLD_DEEP,
  ERROR_COOLDOWN,
  JEALOUSY_THRESHOLD,

  globalMessages,
  cliMessages,
  userData,

  saveGlobalMessages,
  saveCliMessages,
  loadUserDataFromDisk,
  saveUserData,
  getUserData,
  getGlobalObedience,
  setGlobalObedience,
  cleanMemory,
  getAffectionLevel,
  getDailyMood,
  getSleepState,
  isRude,
  hasRancune,
  tryParseJson,
  searchMemory,
  loadSummaries,
  getSummariesForUser,
  getConvStates,
  findOrCreateConv,
  scheduleConvTimeout,
  finalizeConv,
  analyzeConversation,
  generateAndStoreSummary,
  handleToolCall,
  tools,
  webSearch,
  webFetch,
  mistralChat,
  askMistralEmoji,
  processMessage,
};
