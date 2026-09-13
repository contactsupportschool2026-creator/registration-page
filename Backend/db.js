/**
 * db.js — Shared database helpers
 * Supports both old array format and new object format:
 * { students: [], activeTests: { scientific: null, literature: null } }
 */

const fs   = require('fs');
const path = require('path');

const DB_PATH   = path.join(__dirname, 'database.json');
const LOCK_PATH = DB_PATH + '.lock';
const TMP_PATH  = DB_PATH + '.tmp';

const LOCK_TTL_MS = 30_000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO  = process.env.GITHUB_REPO || 'contactsupportschool2026-creator/registration-page';

let syncPromise = Promise.resolve();

function syncToGitHub() {
    syncPromise = syncPromise.then(async () => {
        if (!GITHUB_TOKEN) return;
        try {
            const axios   = require('axios');
            const content = fs.readFileSync(DB_PATH, 'utf-8');

            let sha = null;
            try {
                const res = await axios.get(
                    `https://api.github.com/repos/${GITHUB_REPO}/contents/Backend/database.json`,
                    { headers: { Authorization: `Token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
                );
                sha = res.data.sha;
            } catch (_) {}

            const body = {
                message: 'data: sync database',
                content: Buffer.from(content).toString('base64'),
                branch: 'main'
            };
            if (sha) body.sha = sha;

            await axios.put(
                `https://api.github.com/repos/${GITHUB_REPO}/contents/Backend/database.json`,
                body,
                { headers: { Authorization: `Token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' } }
            );
            console.log('[db] Synced to GitHub');
        } catch (e) {
            console.error('[db] GitHub sync failed:', e.message);
        }
    });
    return syncPromise;
}

function isPidAlive(pid) {
    try { process.kill(pid, 0); return true; }
    catch (_) { return false; }
}

function clearStaleLock() {
    try {
        const raw = fs.readFileSync(LOCK_PATH, 'utf-8');
        const { pid, timestamp } = JSON.parse(raw);
        const age = Date.now() - timestamp;
        if (age > LOCK_TTL_MS || !isPidAlive(pid)) {
            fs.unlinkSync(LOCK_PATH);
        }
    } catch (e) {
        if (e.code !== 'ENOENT') {
            try { fs.unlinkSync(LOCK_PATH); } catch (_) {}
        }
    }
}

async function acquireLock(maxRetries = 100, retryDelay = 200) {
    const lockData = JSON.stringify({ pid: process.pid, timestamp: Date.now() });
    for (let i = 0; i < maxRetries; i++) {
        try {
            fs.writeFileSync(LOCK_PATH, lockData, { flag: 'wx' });
            return;
        } catch (e) {
            if (e.code !== 'EEXIST') throw e;
            clearStaleLock();
            await new Promise(r => setTimeout(r, retryDelay));
        }
    }
    throw new Error(`Could not acquire DB lock after ${maxRetries} retries`);
}

function releaseLock() {
    try { fs.unlinkSync(LOCK_PATH); } catch (_) {}
}

function initializeDB() {
    if (!fs.existsSync(DB_PATH)) {
        const initial = {
            students: [],
            activeTests: {
                scientific: null,
                literature: null
            }
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
        console.log('[db] Database initialized with new structure');
    }
}

// Normalize any old array format into the new object format
function normalizeDB(raw) {
    if (Array.isArray(raw)) {
        return {
            students: raw,
            activeTests: {
                scientific: null,
                literature: null
            }
        };
    }
    if (!raw.activeTests) {
        raw.activeTests = { scientific: null, literature: null };
    }
    if (!raw.students) {
        raw.students = [];
    }
    return raw;
}

async function readDB() {
    await acquireLock();
    try {
        const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        return normalizeDB(raw);
    } finally {
        releaseLock();
    }
}

async function withDB(fn) {
    await acquireLock();
    try {
        const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        const db = normalizeDB(raw);
        const result = fn(db);
        fs.writeFileSync(TMP_PATH, JSON.stringify(db, null, 2));
        fs.renameSync(TMP_PATH, DB_PATH);
        syncToGitHub();
        return result;
    } finally {
        releaseLock();
    }
}

module.exports = { initializeDB, readDB, withDB };
