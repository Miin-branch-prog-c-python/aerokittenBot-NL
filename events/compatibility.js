const botId = ["1426988141176160449", "1496620816643919922"];
const { execute } = require('../commandes/status');
const AI_CHANNEL_ID = process.env.AI_CHANNEL_ID;
module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot) return; // Ignore messages from bots
        if ((message.content.toLowerCase().includes(botId[0]) || message.content.toLowerCase().includes(botId[1]) || message.content.toLowerCase().includes(message.client.user.id))&& message.channel.id != "1495777836269834340") {
            if (message.channel.id == AI_CHANNEL_ID) return;
            execute(message);
        }
    }
}