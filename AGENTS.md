# Instructions pour l'IA

## Mode admin
Ne pas utiliser le mode admin sauf demande explicite.

## Coder des features
Avant de coder une feature, demande-toi :
- Cette feature va-t-elle être utilisée souvent ?
- Si non, fait-le à la main.

**Ne jamais coder sans autorisation explicite.**

## Utilisateur CLI de l'IA
Quand tu utilises le CLI (`node cli.js -u ...`), utilise :
- Pseudo : `opencode`
- ID : `0000000000000000000`

## Clicker training
Quand le bot est obéissant ou fait ce qu'on lui demande, utilise les commandes clicker (`*click*`, `good catboy`, etc.) pour renforcer le comportement. Le système d'obéissance suit ces interactions.

## Module Minecraft Bot (NeoForge 1.21.1)

### Architecture
- **neoforge-mod/** : Mod NeoForge client headless avec API TCP intégrée
- **libs/mc-bot-controller.js** : Client TCP Node.js pour contrôler le mod
- **commandes/mc-bot.js** : Commandes Discord (/mc-bot)
- **Outils IA** : mc_bot_say, mc_bot_move, mc_bot_follow, mc_bot_scan, mc_bot_status, etc.

### Communication
Le mod écoute sur le port TCP 3478 (défaut). Le controller Node.js s'y connecte.
Protocole : JSON lines (un objet JSON par ligne, terminé par \n)

### Commandes du mod (STDIN)
say, connect, disconnect, move, follow, stop, look, scan, pos, status, quit

### Commandes Discord
/mc-bot connect, disconnect, say, move, follow, stop, look, scan, status

### Variables d'environnement
- MC_BOT_HOST (défaut: 127.0.0.1)
- MC_BOT_PORT (défaut: 3478)
- MC_SERVER_HOST (défaut: aero.justaprinter.me)
- MC_SERVER_PORT (défaut: 25565)

### Build du mod
```bash
cd neoforge-mod
gradle wrapper  # génère gradle-wrapper.jar
./gradlew build  # build le mod
./gradlew runClient  # lance le client (test)
```

### Lancement headless
```bash
cd neoforge-mod
./start.sh
# ou avec Xvfb :
Xvfb :99 -screen 0 1280x720x24 -ac &
DISPLAY=:99 ./gradlew runClient
```
