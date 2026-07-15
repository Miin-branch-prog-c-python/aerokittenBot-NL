#!/usr/bin/env node
const core = require("./libs/mistral-core");
const readline = require("readline");
const fs = require("fs");

const CHANNEL_ID = "cli";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const GREY = "\x1b[90m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function loadKnownUsers() {
  const seen = {};
  const globalMsgs = core.globalMessages || [];
  for (const m of globalMsgs) {
    if (m.username && m.userId && !seen[m.userId]) {
      seen[m.userId] = m.username;
    }
  }
  const userData = core.userData || {};
  for (const uid of Object.keys(userData)) {
    if (uid === "_global") continue;
    if (!seen[uid]) seen[uid] = uid;
  }
  return Object.entries(seen).map(([id, name]) => ({ id, name }));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const msgIdx = args.indexOf("-m");
  let message = null;
  if (msgIdx !== -1 && msgIdx + 1 < args.length) {
    message = args[msgIdx + 1];
  }
  const uIdx = args.indexOf("-u");
  let pseudo = null;
  if (uIdx !== -1 && uIdx + 1 < args.length) {
    pseudo = args[uIdx + 1];
  }
  const confirmed = args.includes("-y");
  return { message, args, pseudo, confirmed };
}

function disableMalus(userId) {
  const user = core.getUserData(userId);
  user.lastSeen = Date.now();
  user.lastRude = null;
  user.rudeCount = 0;
  core.saveUserData();
}

function printToolTrace(toolTrace) {
  if (!toolTrace || toolTrace.length === 0) return;
  for (const t of toolTrace) {
    console.log(`🔧 ${t.tool}`);
    console.log(`   Args: ${JSON.stringify(t.arguments)}`);
    const resp = typeof t.response === 'object'
      ? JSON.stringify(t.response, null, 2)
      : String(t.response);
    console.log(`   Response: ${resp.slice(0, 500)}`);
  }
}

function printResult(result) {
  if (!result) return;
  if (result.ignored) {
    console.log(`(ignored: ${result.reason})`);
    return;
  }
  if (result.error) {
    console.log("(error: Mistral API failed)");
    return;
  }
  printToolTrace(result.toolTrace);
  console.log(result.response || "");
}

function printSearchResults(keyword, results) {
  const total = results.global.length + results.summaries.length + results.memory.length;
  if (total === 0) {
    console.log(`(no results for "${keyword}")`);
    return;
  }
  console.log(`Found ${total} result(s) for "${keyword}":`);
  if (results.global.length) {
    console.log(`\n--- Global memory (${results.global.length}) ---`);
    for (const m of results.global) {
      console.log(`  [${m.timestamp ? new Date(m.timestamp).toISOString().slice(0,16) : '?'}] ${m.username}: ${m.content.slice(0, 200)}`);
    }
  }
  if (results.summaries.length) {
    console.log(`\n--- Past conversations (${results.summaries.length}) ---`);
    for (const m of results.summaries) {
      console.log(`  [${m.convTitle}] ${m.username}: ${m.content.slice(0, 200)}`);
    }
  }
  if (results.memory.length) {
    console.log(`\n--- memory.json (${results.memory.length}) ---`);
    for (const m of results.memory) {
      console.log(`  [${m.role}] ${m.content.slice(0, 200)}`);
    }
  }
}

async function handleCommand(line) {
  if (line.startsWith("/search ")) {
    const keyword = line.slice("/search ".length).trim();
    if (!keyword) { console.log("Usage: /search <keyword>"); return true; }
    const results = core.searchMemory(keyword);
    printSearchResults(keyword, results);
    return true;
  }
  if (line.startsWith("/web ")) {
    const query = line.slice("/web ".length).trim();
    if (!query) { console.log("Usage: /web <query>"); return true; }
    const results = await core.webSearch(query);
    if (results.error) { console.log("Error:", results.error); return true; }
    if (results.length === 0) { console.log("No results."); return true; }
    for (const r of results) {
      console.log(`\n${r.title}`);
      console.log(`  ${r.url}`);
      if (r.snippet) console.log(`  ${r.snippet}`);
    }
    return true;
  }
  if (line.startsWith("/fetch ")) {
    const url = line.slice("/fetch ".length).trim();
    if (!url) { console.log("Usage: /fetch <url>"); return true; }
    const res = await core.webFetch(url);
    if (res.error) { console.log("Error:", res.error); return true; }
    console.log(`\n${res.content.slice(0, 2000)}`);
    return true;
  }
  return false; // not a command
}

async function runOnce(message, userId, username, confirmed) {
  if (await handleCommand(message)) return;

  disableMalus(userId);

  const isAdmin = message.startsWith("[admin]");
  const result = await core.processMessage({
    channelId: CHANNEL_ID,
    userId,
    username,
    content: message,
    isAdmin,
    isMentioned: false,
    isReply: false,
    imgUrl: null,
    confirmed,
  });
  printResult(result);
}

function pickUser(rl, users) {
  return new Promise(resolve => {
    console.log(`${BOLD}Choose a user:${RESET}`);
    users.forEach((u, i) => console.log(`  ${i + 1}. ${u.name} (${u.id})`));
    console.log("  (or type a custom userId)");
    rl.question(`${RED}>${RESET}${GREY} ${RESET}`, answer => {
      const trimmed = answer.trim();
      const num = parseInt(trimmed, 10);
      if (num > 0 && num <= users.length) {
        resolve(users[num - 1]);
      } else if (trimmed) {
        resolve({ id: trimmed, name: trimmed });
      } else {
        resolve(users[0] || { id: core.ADMIN_OWNER_ID, name: "unknown" });
      }
    });
  });
}

function startInteractive(userId, username, confirmed) {
  const promptStr = `${RED}>${RESET}${GREY} ${RESET}`;
  if (confirmed) {
    console.log(`${GREY}[AeroKitten CLI]${RESET} Type /exit to quit. (user: ${username}, send_message: ON)`);
  } else {
    console.log(`${GREY}[AeroKitten CLI]${RESET} Type /exit to quit. (user: ${username}, send_message: OFF — use -y to enable)`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: promptStr,
  });

  rl.prompt();

  rl.on("line", async line => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }
    if (trimmed === "/exit" || trimmed === "/quit") {
      rl.close();
      return;
    }
    readline.moveCursor(process.stdout, 0, -1);
    readline.clearLine(process.stdout, 0);
    console.log(`${CYAN}${trimmed}${RESET}`);
    await runOnce(trimmed, userId, username, confirmed);
    rl.prompt();
  });

  rl.on("close", () => {
    console.log("Bye!");
    process.exit(0);
  });
}

// ─── Entry point ──────────────────────────────────────────────────────────

const { message, pseudo, confirmed } = parseArgs();

if (pseudo) {
  const users = loadKnownUsers();
  const match = users.find(u => u.name.toLowerCase() === pseudo.toLowerCase());
  const userId = match ? match.id : pseudo;
  const username = match ? match.name : pseudo;
  disableMalus(userId);
  if (message) {
    runOnce(message, userId, username, confirmed).then(() => process.exit(0));
  } else {
    startInteractive(userId, username, confirmed);
  }
} else if (message) {
    runOnce(message, core.ADMIN_OWNER_ID, "micuitcuit", confirmed).then(() => process.exit(0));
  } else {
    const users = loadKnownUsers();
    if (users.length === 0) {
      startInteractive(core.ADMIN_OWNER_ID, "micuitcuit", confirmed);
    } else {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      pickUser(rl, users).then(selected => {
        rl.close();
        disableMalus(selected.id);
        startInteractive(selected.id, selected.name, confirmed);
      });
    }
  }
