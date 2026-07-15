const { SlashCommandBuilder } = require('discord.js');
const { translate, randomMod } = require('../libs/translate');
const serverPing = require('../libs/serverPing');
module.exports = {
    definition: new SlashCommandBuilder()
        .setName('status')
        .setDescription('displays the status of the server'),
    async execute(interaction) {
        const lang = interaction.locale || 'en';
//	console.log(lang)
        serverPing().then((res) => {
            const players = res.players.online;
            const playerInTheQueue = players - parseInt(process.env.serverPlayerMax);
            const playerInTheServer = players - playerInTheQueue;
            if (playerInTheQueue > 0) {
                interaction.reply({ content: translate('status_message_server_full', lang, playerInTheServer,process.env.serverPlayerMax, playerInTheQueue)+translate(randomMod(), lang) ,
  allowedMentions: { parse: [] } });
            } else {
                interaction.reply({ content: translate('status_message_server_not_full', lang,players, process.env.serverPlayerMax, Math.abs(playerInTheQueue))+translate(randomMod(), lang) ,
  allowedMentions: { parse: [] } });
            }
        }).catch((err) => {
            console.error('Erreur lors du ping du serveur:', err);
            interaction.reply({ content: translate('status_message_server_error', lang),
  allowedMentions: { parse: [] }  });
        });
    }
};
    
