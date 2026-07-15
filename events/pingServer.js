const getServerStatus = require("../libs/serverPing");
const db = require("../libs/db");
module.exports = {
    name: 'clientReady',
    once: false,
    async execute(client) {
        console.log('Bot is ready, checking initial server status...');
        let lastPlayerCount = await db.getLatestUserCount().then(entry => entry ? entry.userCount : 0).catch(() => 0);
        console.log(`${client.user.tag} est connecté! Initial player count: ${lastPlayerCount}`);
        setInterval( () => {
            getServerStatus().then(res => {
            if (!res) return;
            const playersOnline = res.players.online;
                if (playersOnline !== lastPlayerCount) {
                    lastPlayerCount = playersOnline;
                    db.setUserCount(playersOnline);
                    console.log('Updated player count in database:', playersOnline);
                }
            }).catch(err => {
                console.error('Error fetching server status:', err);
            });
        }, 1000);
    }
};