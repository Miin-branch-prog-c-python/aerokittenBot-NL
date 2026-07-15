const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const path = require('path');

const McBotController = require(path.join(__dirname, '..', 'libs', 'mc-bot-controller'));

// Shared controller instance (lazy-init)
let controller = null;
function getController() {
  if (!controller) {
    controller = new McBotController({
      host: process.env.MC_BOT_HOST || '127.0.0.1',
      port: parseInt(process.env.MC_BOT_PORT || '3478', 10),
    });
    controller.on('connected', () => {
      console.log('[McBot] Controller connected to Minecraft bot');
    });
    controller.on('disconnected', () => {
      console.log('[McBot] Controller disconnected from Minecraft bot');
    });
    controller.connect();
  }
  return controller;
}

module.exports = {
  definition: new SlashCommandBuilder()
    .setName('mc-bot')
    .setDescription('Control the Minecraft bot')
    .addSubcommand(sub => sub
      .setName('connect')
      .setDescription('Connect the bot to the Minecraft server')
      .addStringOption(opt => opt.setName('host').setDescription('Server address').setRequired(false))
      .addIntegerOption(opt => opt.setName('port').setDescription('Server port').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('disconnect')
      .setDescription('Disconnect the bot from the server'))
    .addSubcommand(sub => sub
      .setName('say')
      .setDescription('Send a chat message as the bot')
      .addStringOption(opt => opt.setName('message').setDescription('Message to send').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('move')
      .setDescription('Move the bot to coordinates')
      .addIntegerOption(opt => opt.setName('x').setDescription('X coordinate').setRequired(true))
      .addIntegerOption(opt => opt.setName('z').setDescription('Z coordinate').setRequired(true))
      .addIntegerOption(opt => opt.setName('y').setDescription('Y coordinate (optional)').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('follow')
      .setDescription('Make the bot follow a player')
      .addStringOption(opt => opt.setName('player').setDescription('Player name').setRequired(true)))
    .addSubcommand(sub => sub
      .setName('stop')
      .setDescription('Stop the bot from moving'))
    .addSubcommand(sub => sub
      .setName('look')
      .setDescription('Make the bot look at coordinates')
      .addIntegerOption(opt => opt.setName('x').setDescription('X coordinate').setRequired(true))
      .addIntegerOption(opt => opt.setName('z').setDescription('Z coordinate').setRequired(true))
      .addIntegerOption(opt => opt.setName('y').setDescription('Y coordinate').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('scan')
      .setDescription('Scan the bot surroundings')
      .addIntegerOption(opt => opt.setName('radius').setDescription('Scan radius').setRequired(false)))
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Get bot status')),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const ctrl = getController();

    if (!ctrl.connected && sub !== 'status') {
      await interaction.editReply({
        content: '⚠️ Not connected to the Minecraft bot. Use `/mc-bot status` to check or wait for reconnection.',
        ephemeral: true,
      });
      return;
    }

    try {
      switch (sub) {
        case 'connect': {
          const host = interaction.options.getString('host') || process.env.MC_SERVER_HOST || 'aero.justaprinter.me';
          const port = interaction.options.getInteger('port') || parseInt(process.env.MC_SERVER_PORT || '25565', 10);
          ctrl.connectToServer(host, port);
          await interaction.editReply({ content: `🔄 Connecting to \`${host}:${port}\`...`, ephemeral: true });
          break;
        }

        case 'disconnect': {
          ctrl.disconnect();
          await interaction.editReply({ content: '🛑 Disconnecting bot...', ephemeral: true });
          break;
        }

        case 'say': {
          const message = interaction.options.getString('message', true);
          ctrl.say(message);
          await interaction.editReply({ content: `💬 Bot sent: \`${message}\``, ephemeral: true });
          break;
        }

        case 'move': {
          const x = interaction.options.getInteger('x', true);
          const z = interaction.options.getInteger('z', true);
          const y = interaction.options.getInteger('y');
          ctrl.moveTo(x, z, y);
          const coords = y !== null ? `\`${x}, ${y}, ${z}\`` : `\`${x}, ${z}\``;
          await interaction.editReply({ content: `🚶 Moving bot to ${coords}...`, ephemeral: true });
          break;
        }

        case 'follow': {
          const player = interaction.options.getString('player', true);
          ctrl.follow(player);
          await interaction.editReply({ content: `👀 Following player \`${player}\``, ephemeral: true });
          break;
        }

        case 'stop': {
          ctrl.stop();
          await interaction.editReply({ content: '⏹️ Bot stopped.', ephemeral: true });
          break;
        }

        case 'look': {
          const lx = interaction.options.getInteger('x', true);
          const lz = interaction.options.getInteger('z', true);
          const ly = interaction.options.getInteger('y');
          ctrl.lookAt(lx, lz, ly);
          const coords = ly !== null ? `\`${lx}, ${ly}, ${lz}\`` : `\`${lx}, ${lz}\``;
          await interaction.editReply({ content: `👁️ Looking at ${coords}...`, ephemeral: true });
          break;
        }

        case 'scan': {
          const radius = interaction.options.getInteger('radius') || 10;
          ctrl.scan(radius);
          await interaction.editReply({ content: `🔍 Scanning surroundings (radius ${radius})...`, ephemeral: true });
          break;
        }

        case 'status': {
          const embed = new EmbedBuilder()
            .setTitle('🤖 AeroKitten Bot Status')
            .setColor(ctrl.connected ? 0x00ff00 : 0xff0000)
            .addFields(
              { name: 'TCP Connection', value: ctrl.connected ? '✅ Connected' : '❌ Disconnected', inline: true },
              { name: 'Host', value: `${ctrl.host}:${ctrl.port}`, inline: true },
            );

          if (ctrl.connected) {
            ctrl.status();
            const statusHandler = (data) => {
              const d = data.data || data;
              if (d.connected) {
                embed.addFields(
                  { name: 'Game Connection', value: '✅ Online', inline: true },
                  { name: 'Server', value: d.server || 'Unknown', inline: true },
                  { name: 'Moving', value: d.moving ? '✅ Yes' : '❌ No', inline: true },
                  { name: 'Following', value: d.follow_target || 'Nobody', inline: true },
                );
                if (d.position && !d.position.error) {
                  embed.addFields({
                    name: 'Position',
                    value: `X: ${Math.round(d.position.x)}, Y: ${Math.round(d.position.y)}, Z: ${Math.round(d.position.z)}`,
                    inline: true,
                  });
                }
              } else {
                embed.addFields({ name: 'Game Connection', value: '❌ Offline', inline: true });
              }
              controller.removeListener('status_report', statusHandler);
            };
            controller.once('status_report', statusHandler);
            // Fallback timeout
            setTimeout(() => controller.removeListener('status_report', statusHandler), 2000);
          }

          await interaction.editReply({ embeds: [embed], ephemeral: true });
          break;
        }
      }
    } catch (error) {
      console.error('[McBot] Command error:', error);
      await interaction.editReply({
        content: `❌ Error: \`${error.message}\``,
        ephemeral: true,
      });
    }
  },

  // Called once on bot startup
  onload() {
    const ctrl = getController();
    ctrl.on('connected', () => console.log('[McBot] Ready to control Minecraft bot'));
  },
};
