const { Client, GatewayIntentBits, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─── Load .env if present ─────────────────────────────────────────────────
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (key && !process.env[key]) {
        process.env[key] = trimmed.slice(eq + 1).trim();
      }
    }
  }
} catch {}

// ─── CLI mode ─────────────────────────────────────────────────────────────
if (process.argv.includes("--cli")) {
  const msgIdx = process.argv.indexOf("-m");
  const msg = msgIdx !== -1 && msgIdx + 1 < process.argv.length
    ? process.argv[msgIdx + 1]
    : null;
  // If -m is provided with --cli, pass it to cli.js via spawn
  require("./cli");
  return; // cli.js handles its own lifecycle
}

// ─── Discord mode ─────────────────────────────────────────────────────────

const TOKEN = process.env.TOKEN_DISCORD;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});
const commands = fs.readdirSync('./commandes').map(file => require(`./commandes/${file}`));
const events = fs.readdirSync('./events').map(file => require(`./events/${file}`));


for (const event of events) {
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}
client.once('clientReady', async () => {
    // console.log(`${client.user.tag} est connecté!`);
    try {
        for (const command of commands) {
            await client.application.commands.create(command.definition);
            if (command.onload) {
                await command.onload();
            }
        }
        console.log('Commande synchronisée');
        //annonce la liste des server sur le quel le bot est connecté
        const guilds = await client.guilds.fetch();
        console.log('Serveurs connectés:', guilds.map(guild => guild.name).join(', '));
    } catch (error) {
        console.error('Erreur de synchronisation:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const commandName = interaction.commandName;
    const command = commands.find(cmd => cmd.definition.name === commandName);
    if (!command) return;
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error('Erreur lors de l\'exécution de la commande:', error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: 'Il y a eu une erreur lors de l\'exécution de cette commande.\n ```' + error.message + '```', ephemeral: true });
            } else {
                await interaction.reply({ content: 'Il y a eu une erreur lors de l\'exécution de cette commande.\n ```' + error.message + '```', ephemeral: true });
            }
        } catch (replyError) {
            console.error('Erreur lors de l\'envoi du message d\'erreur:', replyError);
        }
    }
});

client.login(TOKEN);