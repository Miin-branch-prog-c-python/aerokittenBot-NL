const child_process = require('child_process');
const { SlashCommandBuilder } = require('discord.js');
const { cleanMemory } = require('../libs/mistral-core');
module.exports = {
    definition: new SlashCommandBuilder()
        .setName('memoryresset')
        .setDescription('resets the memory of the bot')
        .setDefaultMemberPermissions(8192), //gerez les messages
    async execute(interaction) {
        if (interaction.guild.id !== process.env.guildId && interaction.user.id !== process.env.ownerId) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }
        child_process.execSync('mv ./memory.json ./memory_backup\\(' + new Date().toISOString() + '\\).json');
        child_process.execSync('echo "[]" > ./memory.json');
        console.log('Memory reset by', interaction.user.tag);
        cleanMemory();
        console.log('Memory cleaned in memory variable.');
        interaction.reply({ content: 'Memory reset.' });
    }
};