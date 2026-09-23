const Database = require("better-sqlite3");

const db = new Database("data.sqlite");
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS members (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS recruitments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  recruiter_id TEXT NOT NULL,
  recruited_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS farms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  action TEXT NOT NULL,
  old_role_id TEXT,
  new_role_id TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS transcripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`);

const now = () => new Date().toISOString();

module.exports = {
  db,

  registerMember(guildId, userId) {
    db.prepare(`
      INSERT OR IGNORE INTO members (guild_id, user_id, joined_at)
      VALUES (?, ?, ?)
    `).run(guildId, userId, now());
  },

  addRecruitment(guildId, recruiterId, recruitedId) {
    db.prepare(`
      INSERT INTO recruitments (guild_id, recruiter_id, recruited_id, created_at)
      VALUES (?, ?, ?, ?)
    `).run(guildId, recruiterId, recruitedId, now());
  },

  getRecruitmentRanking(guildId, period) {
    const condition = periodCondition("created_at", period);
    return db.prepare(`
      SELECT recruiter_id AS user_id, COUNT(*) AS total
      FROM recruitments
      WHERE guild_id = ? ${condition.sql}
      GROUP BY recruiter_id
      ORDER BY total DESC
      LIMIT 25
    `).all(guildId, ...condition.params);
  },

  addFarm(guildId, userId, amount) {
    db.prepare(`
      INSERT INTO farms (guild_id, user_id, amount, created_at)
      VALUES (?, ?, ?, ?)
    `).run(guildId, userId, amount, now());
  },

  getFarmRanking(guildId, period) {
    const condition = periodCondition("created_at", period);
    return db.prepare(`
      SELECT user_id, SUM(amount) AS total
      FROM farms
      WHERE guild_id = ? ${condition.sql}
      GROUP BY user_id
      ORDER BY total DESC
      LIMIT 25
    `).all(guildId, ...condition.params);
  },

  addWarning(guildId, userId, moderatorId, reason) {
    db.prepare(`
      INSERT INTO warnings (guild_id, user_id, moderator_id, reason, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId, moderatorId, reason, now());
  },

  countWarnings(guildId, userId) {
    return db.prepare(`
      SELECT COUNT(*) AS total FROM warnings WHERE guild_id = ? AND user_id = ?
    `).get(guildId, userId).total;
  },

  addAction(guildId, targetId, moderatorId, action, oldRoleId, newRoleId, reason) {
    db.prepare(`
      INSERT INTO actions
      (guild_id, target_id, moderator_id, action, old_role_id, new_role_id, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(guildId, targetId, moderatorId, action, oldRoleId || null, newRoleId || null, reason || null, now());
  },

  createTicket(guildId, channelId, ownerId, type) {
    const result = db.prepare(`
      INSERT INTO tickets (guild_id, channel_id, owner_id, type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, channelId, ownerId, type, now());
    return result.lastInsertRowid;
  },

  getTicketByChannel(channelId) {
    return db.prepare(`SELECT * FROM tickets WHERE channel_id = ?`).get(channelId);
  },

  closeTicket(channelId) {
    db.prepare(`UPDATE tickets SET closed_at = ? WHERE channel_id = ?`).run(now(), channelId);
  },

  addTranscript(ticketId, filename) {
    db.prepare(`
      INSERT INTO transcripts (ticket_id, filename, created_at)
      VALUES (?, ?, ?)
    `).run(ticketId, filename, now());
  }
};

function periodCondition(column, period) {
  if (period === "total") return { sql: "", params: [] };

  const map = {
    dia: "-1 day",
    semana: "-7 days",
    mes: "-30 days"
  };

  if (!map[period]) return { sql: "", params: [] };

  return {
    sql: `AND datetime(${column}) >= datetime('now', ?)`,
    params: [map[period]]
  };
}
