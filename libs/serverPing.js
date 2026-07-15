const { status } = require('minecraft-server-util');

function pingServer() {
    return status('aero.justaprinter.me', 25565);
}
module.exports = pingServer;