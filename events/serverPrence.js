const { addToPresenceQueue, addToPresenceMain} = require("../libs/db");

module.exports = {
    name: "messageCreate",
    async execute(message) {
        if (!message.author.bot) return; 
        if (message.channel.id == process.env.MAIN_CHANNEL_ID) {
            if (message.content.endsWith("joined")) {
                const userName = message.content.split(" ")[0];
                await addToPresenceMain(userName, true);
            }else if (message.content.endsWith("left")) {
                const userName = message.content.split(" ")[0];
                await addToPresenceMain(userName, false);
            }
        } else if (message.channel.id == process.env.QUEUE_CHANNEL_ID) {
            if (message.content.endsWith("joined")) {
                const userName = message.content.split(" ")[0];
                await addToPresenceQueue(userName, true);
            }else if (message.content.endsWith("left")) {
                const userName = message.content.split(" ")[0];
                await addToPresenceQueue(userName, false);
            }
        }
    }
};