/**
 * db.js — Shared database helpers for server.js and bot.js
 *
 * Cross-process safety strategy:
 *  1. LOCK  — acquire an exclusive .lock file before any read-modify-write cycle.
 *             Uses the atomic 'wx' flag (create-or-fail) so only one process
 *             enters the critical section at a time.
 *             Lock file stores { pid, timestamp } for stale-lock recovery:
 *             if the lock is older than LOCK_TTL_MS or belongs to a dead PID,
 *             it is removed automatically.
 *  2. WRITE — write to a .tmp file first, then atomically rename it to the real
 *             path, so a crash mid-write never leaves a partial/corrupt file.
 *  3. RULE  — callbacks passed to withDB() must be fast and DB-only.
 *             NEVER make network calls (Telegram, Chargily, etc.) inside a
 *             withDB() callback — do all network I/O after withDB() returns.
 */

const fs   = require('fs');
const path = require('path');

const DB_PATH   = path.join(__dirname, 'database.json');
const LOCK_PATH = DB_PATH + '.lock';
const TMP_PATH  = DB_PATH + '.tmp';

// A lock held for longer than this is considered stale (e.g. process crashed)
const LOCK_TTL_MS = 30_000; // 30 seconds

// ─── Lock helpers ─────────────────────────────────────────────────────────────

/**
 * Check whether a PID is still alive on this OS.
 * Returns true if the process exists, false if it does not.
 */
function isPidAlive(pid) {
    try {
        // signal 0 = existence check, throws if process not found
        process.kill(pid, 0);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * If a stale lock file exists, remove it and log why.
 * A lock is stale when:
 *   - it cannot be parsed (corrupted), or
 *   - it is older than LOCK_TTL_MS, or
 *   - the PID that created it is no longer running.
 */
function clearStaleLock() {
    try {
        const raw      = fs.readFileSync(LOCK_PATH, 'utf-8');
        const { pid, timestamp } = JSON.parse(raw);
        const age      = Date.now() - timestamp;

        if (age > LOCK_TTL_MS) {
            console.warn(`⚠️ [db] Removing stale lock: age ${age}ms > TTL ${LOCK_TTL_MS}ms (pid ${pid})`);
            fs.unlinkSync(LOCK_PATH);
            return;
        }

        if (!isPidAlive(pid)) {
            console.warn(`⚠️ [db] Removing stale lock: pid ${pid} is no longer running`);
            fs.unlinkSync(LOCK_PATH);
        }
    } catch (e) {
        if (e.code === 'ENOENT') return; // lock already gone, nothing to do
        // Lock file is unreadable/corrupt — remove it
        console.warn(`⚠️ [db] Lock file unreadable, removing: ${e.message}`);
        try { fs.unlinkSync(LOCK_PATH); } catch (_) {}
    }
}

/**
 * Acquire the lock file.
 * Retries up to `maxRetries` times with `retryDelay` ms between attempts.
 * On each failed attempt, checks whether the existing lock is stale and
 * removes it if so, allowing immediate re-acquisition.
 * Throws if the lock cannot be acquired in time.
 */
async function acquireLock(maxRetries = 100, retryDelay = 200) {
    const lockData = JSON.stringify({ pid: process.pid, timestamp: Date.now() });

    for (let i = 0; i < maxRetries; i++) {
        try {
            // 'wx' = exclusive create: fails with EEXIST if the file is already there
            fs.writeFileSync(LOCK_PATH, lockData, { flag: 'wx' });
            return; // lock acquired
        } catch (e) {
            if (e.code !== 'EEXIST') throw e; // unexpected error

            // Try to clear a stale lock, then retry immediately on this iteration
            clearStaleLock();
            await new Promise(r => setTimeout(r, retryDelay));
        }
    }

    throw new Error(
        `Could not acquire DB lock after ${maxRetries} retries ` +
        `(~${(maxRetries * retryDelay) / 1000}s). ` +
        `Lock path: ${LOCK_PATH}`
    );
}

function releaseLock() {
    try { fs.unlinkSync(LOCK_PATH); } catch (_) { /* already gone */ }
}

// ─── Initialise ───────────────────────────────────────────────────────────────

function initializeDB() {
    if (!fs.existsSync(DB_PATH)) {
        console.log('📁 database.json not found. Creating new database...');
        fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
        console.log('✅ Database initialized successfully');
    }
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Read the database without modifying it.
 * Acquires the lock briefly so the read always sees a fully-committed state.
 *
 * @returns {Promise<Array>} Parsed database array.
 */
async function readDB() {
    await acquireLock();
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } finally {
        releaseLock();
    }
}

/**
 * Read-modify-write helper.
 *
 * Acquires the lock, reads the DB, calls `fn(db)` so you can mutate the array,
 * then atomically writes the result back and releases the lock.
 *
 * ⚠️  IMPORTANT: `fn` must be FAST and DB-ONLY.
 *     Do NOT make network calls (Telegram, Chargily, etc.) inside `fn`.
 *     Collect the data you need, return it from `fn`, and do network I/O
 *     AFTER withDB() resolves.
 *
 * Usage:
 *   const data = await withDB(db => {
 *       const student = db.find(s => s.invoiceId === id);
 *       if (student) student.status = 'paid';
 *       return student ? { ...student } : null; // snapshot to use outside lock
 *   });
 *   if (data) await sendTelegramMessage(data); // network call outside the lock
 *
 * @param {function(Array): any} fn  Synchronous mutator — keep it fast.
 * @returns {Promise<any>} Whatever `fn` returns.
 */
async function withDB(fn) {
    await acquireLock();
    try {
        const db     = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        const result = fn(db); // synchronous only — keeps lock duration minimal

        // Atomic write: write to .tmp first, then rename
        fs.writeFileSync(TMP_PATH, JSON.stringify(db, null, 2));
        fs.renameSync(TMP_PATH, DB_PATH);

        return result;
    } finally {
        releaseLock();
    }
}

module.exports = { initializeDB, readDB, withDB };
