const fs = require('fs');
const { Sequelize, Op } = require('sequelize');
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: '/home/micuit-server/mount/database.sqlite',
    logging: false
});

sequelize.define('User', {
    userCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
    }
});

sequelize.define('minecraft-user', {
    userName: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: ""
    }
});

sequelize.define('minecraft-presence-queue', {
    userName: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: ""
    },
    joined: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
});

sequelize.define('minecraft-presence-main', {
    userName: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: ""
    },
    joined: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
});

sequelize.sync();

function getUserCount(date) {
    const User = sequelize.models.User;
    return User.findOne({ where: { createdAt: date } });
}

function fetchUserCountsByDateRange(startDate, endDate) {
    const User = sequelize.models.User;
    return User.findAll({
        where: { createdAt: { [Op.between]: [startDate, endDate] } },
        order: [['createdAt', 'ASC']]
    });
}

function getLatestUserCount() {
    const User = sequelize.models.User;
    return User.findOne({ order: [['createdAt', 'DESC']] });
}

function setUserCount(count) {
    const User = sequelize.models.User;
    return User.upsert({ userCount: count });
}

function fetchUsersByDateRange(from, to) {
    const User = sequelize.models.User;
    return User.findAll({
        where: { createdAt: { [Op.between]: [from, to] } },
        order: [['createdAt', 'ASC']]
    });
}

/**
 * Moyenne du nombre de joueurs par tranche de `slotMinutes` minutes,
 * sur les derniers `days` jours (sans tenir compte du jour, juste l'heure).
 * Retourne : [{ timeSlot: minutesDepuisMinuit (number), averageUserCount (number) }]
 */
function getUserCountEvolutionBySlot(slotMinutes = 15, days = 15) {
    const User = sequelize.models.User;

    // Nombre de secondes dans un slot
    const slotSeconds = slotMinutes * 60;

    // On regroupe par (secondes_depuis_minuit / slotSeconds) arrondi,
    // puis on remultiplie par slotMinutes pour avoir des minutes depuis minuit.
    return User.findAll({
        attributes: [
            [
                sequelize.literal(
                    `(CAST(strftime('%s', createdAt) AS INTEGER) % 86400 / ${slotSeconds}) * ${slotMinutes}`
                ),
                'timeSlot'
            ],
            [sequelize.fn('AVG', sequelize.col('userCount')), 'averageUserCount']
        ],
        where: {
            createdAt: {
                [Op.gte]: sequelize.literal(`datetime('now', '-${days} days')`)
            }
        },
        group: [
            sequelize.literal(
                `CAST(strftime('%s', createdAt) AS INTEGER) % 86400 / ${slotSeconds}`
            )
        ],
        order: [
            [
                sequelize.literal(
                    `CAST(strftime('%s', createdAt) AS INTEGER) % 86400 / ${slotSeconds}`
                ),
                'ASC'
            ]
        ],
        raw: true
    });
}

function getOldestEntry() {
    const User = sequelize.models.User;
    return User.findOne({ order: [['createdAt', 'ASC']] });
}

// Ancienne fonction conservée pour compatibilité
function getUserCountEvolutionByHour(intervalMinutes = 60) {
    return getUserCountEvolutionBySlot(intervalMinutes);
}


function getPresenceQueue() {
    const Queue = sequelize.models['minecraft-presence-queue'];
    return Queue.findAll();
}

function addToPresenceQueue(userName, joined = false, createdAt = null) {
    const Queue = sequelize.models['minecraft-presence-queue'];
    return Queue.create({ userName, joined, ...(createdAt && { createdAt }) });
}

function removeFromPresenceQueue(userName) {
    const Queue = sequelize.models['minecraft-presence-queue'];
    return Queue.destroy({ where: { userName } });
}
function getPresenceQueueQuerry(userName, dateStart, dateEnd) {
    const History = sequelize.models['minecraft-presence-history'];
    return History.findAll({
        where: {
            userName,
            createdAt: { [Op.between]: [dateStart, dateEnd] }
        },
        order: [['createdAt', 'ASC']]
    });
}

async function getPresenceMain(startDate = null, endDate = null) {
    const PresenceMain = sequelize.models['minecraft-presence-main'];
    const records = await PresenceMain.findAll({
        where: {
            ...(startDate && endDate && { createdAt: { [Op.between]: [startDate, endDate] } })
        },
        order: [['createdAt', 'ASC']]
    });

    const playtime = {};
    const byPlayer = {};

    for (const r of records) {
        if (!byPlayer[r.userName]) byPlayer[r.userName] = [];
        byPlayer[r.userName].push(r);
    }

    const SUSPECT_THRESHOLD_MS = 10 * 3600000; // 10h max pour une session main (capacité 30, rotation rapide)

    for (const [userName, events] of Object.entries(byPlayer)) {
        let total = 0;
        let joinTime = null;

        for (const event of events) {
            if (event.joined) {
                // Si un JOIN arrive alors qu'un autre est déjà ouvert, la session précédente
                // est orpheline — on la ferme au moment du nouveau JOIN
                if (joinTime !== null) {
                    const impliedDuration = new Date(event.createdAt).getTime() - joinTime;
                    if (impliedDuration > 0 && impliedDuration <= SUSPECT_THRESHOLD_MS) {
                        total += impliedDuration;
                    } else {
                        console.warn(`[presence] Session orpheline ignorée : ${userName}, durée=${Math.floor(impliedDuration / 3600000)}h`);
                    }
                }
                joinTime = new Date(event.createdAt).getTime();
            } else {
                if (joinTime !== null) {
                    const duration = new Date(event.createdAt).getTime() - joinTime;
                    if (duration > 0 && duration <= SUSPECT_THRESHOLD_MS) {
                        total += duration;
                    } else {
                        console.warn(`[presence] Session suspecte ignorée : ${userName}, durée=${Math.floor(duration / 3600000)}h, joinTime=${new Date(joinTime).toLocaleString()}`);
                        fs.appendFile('presence-suspect.log',
                            `${new Date().toISOString()} - ${userName} - session de ${Math.floor(duration / 3600000)}h - joinTime: ${new Date(joinTime).toISOString()}\n`,
                            err => { if (err) console.error('Erreur écriture log suspect :', err); }
                        );
                    }
                    joinTime = null;
                }
                // LEAVE sans JOIN précédent → ignoré silencieusement
            }
        }

        // Session encore ouverte en fin de boucle → on l'ignore toujours
        // Date.now() donnerait un temps cumulé faux à chaque appel
        if (joinTime !== null) {
            console.warn(`[presence] Session non terminée ignorée : ${userName}, joinTime=${new Date(joinTime).toLocaleString()}`);
        }

        playtime[userName] = total;
    }

    return Object.entries(playtime)
        .sort(([, a], [, b]) => b - a)
        .map(([userName, ms]) => ({ userName, ms }));
}

function addToPresenceMain(userName, joined = false, createdAt = null) {
    const Main = sequelize.models['minecraft-presence-main'];
    return Main.create({ userName, joined, ...(createdAt && { createdAt }) });
}

function removeFromPresenceMain(userName) {
    const Main = sequelize.models['minecraft-presence-main'];
    return Main.destroy({ where: { userName } });
}

function getPresenceMainQuerry(userName, dateStart, dateEnd) {
    const History = sequelize.models['minecraft-presence-history'];
    return History.findAll({
        where: {
            userName,
            createdAt: { [Op.between]: [dateStart, dateEnd] }
        },
        order: [['createdAt', 'ASC']]
    });
}

function presenceExists(model, userName, joined, createdAt) {
    const m = sequelize.models[model];
    return m.findOne({
        where: {
            userName,
            joined,
            createdAt: {
                [Op.between]: [
                    new Date(createdAt - 1000),
                    new Date(+createdAt + 1000)
                ]
            }
        }
    });
}
module.exports = {
    getUserCount,
    setUserCount,
    fetchUserCountsByDateRange,
    getLatestUserCount,
    getOldestEntry,
    getUserCountEvolutionByHour,
    getUserCountEvolutionBySlot,
    fetchUsersByDateRange,

    getPresenceQueue,
    addToPresenceQueue,
    removeFromPresenceQueue,
    getPresenceQueueQuerry,
    
    getPresenceMain,
    addToPresenceMain,
    removeFromPresenceMain,
    getPresenceMainQuerry,

    presenceExists
};