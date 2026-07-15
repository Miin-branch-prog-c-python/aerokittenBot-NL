const { addToPresenceQueue, addToPresenceMain, presenceExists } = require("./libs/db");

const TOKEN = process.env.TOKEN_DISCORD;
const MAIN_CHANNEL_ID = process.env.MAIN_CHANNEL_ID;
const QUEUE_CHANNEL_ID = process.env.QUEUE_CHANNEL_ID;

async function fetchMessages(channelId, before = null) {
    const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const res = await fetch(url, {
        headers: { Authorization: TOKEN }
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.json();
}

async function processChannel(channelId, addFn) {
    let before = null;
    let total = 0;

    while (true) {
        const messages = await fetchMessages(channelId, before);
        if (!messages.length) break;

        for (const msg of messages) {
            const content = msg.content;
            const isJoin = content.endsWith("joined");
            const isLeave = content.endsWith("left");
            if (!isJoin && !isLeave) continue;

            const userName = content.split(" ")[0];
            const joined = isJoin;
            const createdAt = new Date(msg.timestamp);
            const modelName = channelId === MAIN_CHANNEL_ID
                ? 'minecraft-presence-main'
                : 'minecraft-presence-queue';

            const exists = await presenceExists(modelName, userName, joined, createdAt);
            if (exists) continue;

            await addFn(userName, joined, createdAt);
            total++;
        }

        before = messages[messages.length - 1].id;
        console.log(`[${channelId}] ${total} entrées traitées, dernier message : ${before}`);

        // anti-ratelimit
        await new Promise(r => setTimeout(r, 500));
    }

    console.log(`[${channelId}] terminé — ${total} entrées au total`);
}

async function main() {
    // await processChannel(MAIN_CHANNEL_ID, addToPresenceMain);
    await processChannel(QUEUE_CHANNEL_ID, addToPresenceQueue);
}

main().catch(console.error);