# AeroKitten — Discord Bot

A shy catboy Discord bot powered by Mistral AI, for the Create: Aeronautics Minecraft server.

## Features

- **AI Chat** — Powered by Mistral Small API with personality, memory, and affection system
- **Affection System** — The bot warms up to frequent talkers, with diminishing returns
- **Clicker Training** — Pet and praise the bot to increase obedience
- **Conversation Memory** — Summaries kept for long-term context recall
- **Web Search** — DuckDuckGo search and URL fetching via tools
- **Discord & CLI** — Same core engine runs on Discord and via command line
- **Chess** — Play chess against the bot
- **Admin Mode** — Prefix messages with `[admin]` for owner commands

## Requirements

- Node.js 22+ or Bun
- A Mistral AI API key
- A Discord bot token

## Setup

```bash
# Install dependencies
npm install

# Copy and edit environment
cp .env.example .env
# Fill in:
#   TOKEN_DISCORD=your_discord_bot_token
#   MISTRAL_API_KEY=your_mistral_api_key
#   ownerId=your_discord_user_id
#   AI_CHANNEL_ID=channel_id_for_ai_chat

# Run
npm start
# or
node index.js
```

## CLI Mode

```bash
node cli.js -m "hello"           # one-shot
node cli.js                      # interactive REPL
node cli.js -m "/web search"     # web search
node cli.js -m "/fetch url"      # fetch URL
node cli.js -m "/search keyword" # search memory
```

## Commands

| Prefix | Effect |
|--------|--------|
| `[admin]` | Owner commands (bypasses personality) |
| `[click]` / `*click*` | Clicker training |
| `good [pet/kitten/catboy...]` | Praise the bot |
| `[zap]` / `*zapN*` | Zap (owner only, N = power 1-100) |

## Project Structure

```
index.js                 # Discord entry point
cli.js                   # CLI entry point
libs/mistral-core.js     # Core AI engine
events/mistral.js        # Discord event handlers
commandes/               # Discord commands
summaries/               # Conversation summaries (auto-generated)
```

## License

ISC
