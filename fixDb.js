/**
 * fix-db.js — corrections ciblées de la DB Pay2Play
 *
 * Fixes appliqués :
 *   1. Suppression des events avec username se terminant par ':' (artefacts de parsage Discord)
 *   2. Suppression des events de la boucle déco/reco du 11 mai 02:26–03:01
 *
 * Usage :
 *   DRY_RUN=1 node fix-db.js    ← affiche les comptes sans toucher la DB
 *   node fix-db.js               ← applique les corrections
 */

const { Sequelize, Op } = require('sequelize');

const DRY_RUN = process.env.DRY_RUN === '1';
const DB_PATH = '/home/micuit-server/mount/database.sqlite';

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: DB_PATH,
    logging: false
});

sequelize.define('minecraft-presence-queues', {
    userName: { type: Sequelize.STRING, allowNull: false, defaultValue: '' },
    joined:   { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }
});
sequelize.define('minecraft-presence-mains', {
    userName: { type: Sequelize.STRING, allowNull: false, defaultValue: '' },
    joined:   { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }
});

// Fenêtre de la boucle déco/reco
const LOOP_START = new Date('2026-05-11T02:26:00.000Z');
const LOOP_END   = new Date('2026-05-11T03:01:00.000Z');

async function fix() {
    await sequelize.authenticate();
    const Queue = sequelize.models['minecraft-presence-queues'];
    const Main  = sequelize.models['minecraft-presence-mains'];

    // ── 1. Usernames avec ':' final ──────────────────────────────────────────
    const colonWhereQueue = { userName: { [Op.like]: '%:' } };
    const colonWhereMain  = { userName: { [Op.like]: '%:' } };

    const colonQueueCount = await Queue.count({ where: colonWhereQueue });
    const colonMainCount  = await Main.count({ where: colonWhereMain });
    console.log(`[colon] queue: ${colonQueueCount} events, main: ${colonMainCount} events`);

    if (!DRY_RUN) {
        await Queue.destroy({ where: colonWhereQueue });
        await Main.destroy({ where: colonWhereMain });
        console.log('[colon] supprimés.');
    }

    // ── 2. Boucle déco/reco du 11 mai ────────────────────────────────────────
    const loopWhere = { createdAt: { [Op.between]: [LOOP_START, LOOP_END] } };

    const loopQueueCount = await Queue.count({ where: loopWhere });
    const loopMainCount  = await Main.count({ where: loopWhere });
    console.log(`[loop] queue: ${loopQueueCount} events, main: ${loopMainCount} events`);

    if (!DRY_RUN) {
        await Queue.destroy({ where: loopWhere });
        await Main.destroy({ where: loopWhere });
        console.log('[loop] supprimés.');
    }

    if (DRY_RUN) console.log('\n[DRY_RUN] Aucune modification appliquée.');

    await sequelize.close();
}

fix().catch(err => { console.error(err); process.exit(1); });