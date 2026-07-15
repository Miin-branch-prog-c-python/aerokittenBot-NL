const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  definition: new SlashCommandBuilder()
    .setName('github')
    .setDescription('Get the GitHub repository link for AeroKitten'),

  async execute(interaction) {
    await interaction.reply('https://github.com/micuit-cuit/aerokittenBot');
  },
};
