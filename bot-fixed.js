const TelegramBot = require('node-telegram-bot-api');
const cron        = require('node-cron');
const axios       = require('axios');
require('dotenv').config();

const { initializeDB, readDB, withDB } = require('./db');
const { withRetry }                    = require('./retry');

const bot          = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const SUPPORT_TEXT = `\n\n_For any issues, contact support: @${process.env.TELEGRAM_SUPPORT_USERNAME}_`;

// Ensure the database file exists before the bot starts handling messages
initializeDB();

// ==========================================
// HELPER: Check if user is admin (chat ID match only — no session check)
// ==========================================
function isAdmin(chatId) {
    return chatId.toString() === (process.env.TELEGRAM_CHAT_ID || '').trim();
}

// ==========================================
// SESSION GATE: Admin authentication store
// ==========================================
// All three sets are keyed by chatId.toString().
// They reset on every bot process restart (in-memory only, by design).
const verifiedSessions = new Set(); // chat IDs that passed the gate this session
const blockedUsers     = new Set(); // chat IDs that sent a wrong chat ID
const challengedUsers  = new Set(); // chat IDs that received the challenge prompt

/** Returns true only if chatId has been verified this session. */
function isVerified(chatId) {
    return verifiedSessions.has(chatId.toString());
}

/**
 * Used by all admin command handlers.
 * Requires BOTH the correct chat ID AND an active session verification.
 * Returns silently on failure — the gate handler manages all user-facing messages.
 */
function isAuthorized(chatId) {
    return isAdmin(chatId) && isVerified(chatId);
}

// ==========================================
// HELPER: Safe sendMessage (logs but never throws)
// ==========================================
async function safeSend(chatId, text, options = {}) {
    try {
        await withRetry(
            () => bot.sendMessage(chatId, text, options),
            { label: `telegram:sendMessage:${chatId}`, maxRetries: 3, baseDelayMs: 1000 }
        );
    } catch (err) {
        console.error(`❌ [safeSend] Failed to send message to ${chatId} after retries:`, err.message);
    }
}

// ==========================================
// HELPER: Generate a new Chargily renewal link
// ==========================================
async function createRenewalLink(student) {
    const payload = {
        amount:      2000,
        currency:    'dzd',
        description: `Renouvellement: ${student.firstName} ${student.lastName}`,
        client_name: `${student.firstName} ${student.lastName}`,
        client_email:'student@example.com',
        back_url:    `${process.env.FRONTEND_URL}/payment.html`,
        webhook_url: `${process.env.BACKEND_URL}/api/webhook/chargily`
    };

    const res = await withRetry(
        () => axios.post('https://pay.chargily.net/api/v2/checkouts', payload, {
            headers: {
                'Authorization': `Bearer ${process.env.CHARGILY_SECRET_KEY_2}`,
                'Content-Type': 'application/json'
            }
        }),
        { label: 'chargily:renewal-link' }
    );

    // withDB acquires the cross-process lock before updating the student record
    await withDB(db => {
        const idx = db.findIndex(s => s.chatId && s.chatId.toString() === student.chatId.toString());
        if (idx !== -1) {
            db[idx].invoiceId         = res.data.id;
            db[idx].status            = 'pending';
            db[idx].linkSentTimestamp = new Date().toISOString();
        }
    });

    return res.data.checkout_url;
}

// ==========================================
// FEATURE 1: STUDENT REGISTERS THEIR TELEGRAM ID
// ==========================================
// ==========================================
// GLOBAL MESSAGE GATE
// Intercepts every incoming message before command handlers run.
// Exempt: /start <token>  — used by students for account linking, no auth needed.
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text   = (msg.text || '').trim();

    // ── Exempt: student onboarding link (/start <invoiceId>) ────────────────
    if (/^\/start\s+\S+/.test(text)) return;

    // ── If user has an active search prompt, treat this message as their search query ──
    if (pendingSearches.has(chatId)) {
        pendingSearches.delete(chatId);
        return handleSearchQuery(chatId, text);
    }

    // ── Already verified this session → let command handlers run ────────────
    if (isVerified(chatId)) return;

    // ── Permanently blocked this session → silently ignore ──────────────────
    if (blockedUsers.has(chatId)) return;

    const adminId = (process.env.TELEGRAM_CHAT_ID || '').trim();

    // ── User was challenged; this message is their chat ID response ──────────
    if (challengedUsers.has(chatId)) {
        challengedUsers.delete(chatId);
        if (text === adminId) {
            verifiedSessions.add(chatId);
            await safeSend(chatId, '✅ *Access granted.* Welcome, Admin!', { parse_mode: 'Markdown' });
        } else {
            blockedUsers.add(chatId);
            await safeSend(chatId, '⛔ Access denied. This bot is restricted to the admin only.');
        }
        return;
    }

    // ── First contact (or first message after restart) → send challenge ──────
    challengedUsers.add(chatId);
    await safeSend(
        chatId,
        '🔐 *Admin access required.*\n\nPlease send your Chat ID to continue.',
        { parse_mode: 'Markdown' }
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT COMMAND: /start <invoiceId>  (exempt from the gate above)
// ─────────────────────────────────────────────────────────────────────────────
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId    = msg.chat.id;
    const invoiceId = match[1];

    try {
        let studentName = null;

        await withDB(db => {
            const student = db.find(s => s.invoiceId === invoiceId);
            if (student) {
                student.chatId = chatId.toString(); // always store as string
                studentName    = student.firstName;
            }
        });

        if (studentName) {
            await safeSend(chatId, `✅ Welcome ${studentName}! Your Telegram account is now linked to our system.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        } else {
            await safeSend(chatId, `❌ Invoice ID not recognized. Make sure you clicked the correct link after payment.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('❌ [/start] Error:', error.message);
        await safeSend(chatId, `⚠️ A system error occurred while linking your account. Please try again or contact support.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// ADMIN COMMAND 1: /getall - Show All Students
// ==========================================
bot.onText(/\/getall/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    try {
        let db;
        try {
            db = await readDB();
        } catch (readErr) {
            console.error('❌ [/getall] Failed to read DB:', readErr.message);
            return safeSend(chatId, '⚠️ *Database read failed.* Please try again.', { parse_mode: 'Markdown' });
        }

        // Double-check: ensure db is actually an array
        if (!Array.isArray(db) || db.length === 0) {
            return safeSend(chatId, '📭 *No students found in the database.*', { parse_mode: 'Markdown' });
        }

        let lines = [];
        lines.push(`📊 *Total Students: ${db.length}*\n`);

        db.forEach((student, index) => {
            lines.push(`*${index + 1}. ${student.firstName} ${student.lastName}*`);
            lines.push(`   Invoice: \`${student.invoiceId}\``);
            lines.push(`   Status: ${student.status}`);
            lines.push(`   Renewals: ${student.renewalCount || 0}`);
            lines.push(`   Telegram: ${student.chatId || 'Not linked'}`);
            lines.push(`   Expires: ${student.subscriptionEndDate ? student.subscriptionEndDate.split('T')[0] : 'N/A'}`);
            lines.push(''); // blank line between students
        });

        // Build chunks safely — never break mid-line (prevents broken Markdown)
        let currentChunk = '';
        for (const line of lines) {
            const maybeChunk = currentChunk + line + '\n';
            if (maybeChunk.length > 4000) {
                await safeSend(chatId, currentChunk, { parse_mode: 'Markdown' });
                currentChunk = line + '\n';
            } else {
                currentChunk = maybeChunk;
            }
        }
        // Send the last chunk
        if (currentChunk.trim()) {
            await safeSend(chatId, currentChunk, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('❌ [/getall] Error:', error.message);
        await safeSend(chatId, `⚠️ Failed to retrieve student list: ${error.message}`, { parse_mode: 'Markdown' });
    }
});



// ==========================================
// PENDING SEARCH STORE: users who typed /search and are awaiting their query
// ==========================================
const pendingSearches = new Set(); // chat IDs awaiting a search query

// ==========================================
// ADMIN COMMAND: /search - Find Students by name, invoice ID, or any field
// ==========================================
// Usage: Just type /search (no arguments).
// The bot will ask for a name, invoice ID, or keyword, then search across all student fields.
bot.onText(/^\/search$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    pendingSearches.add(chatId.toString());
    await safeSend(
        chatId,
        '🔍 *Search Students*\n\nType a name, invoice ID, or any keyword related to the student (wilaya, specialty, school name, etc.).\n\nI\'ll find all matching students.',
        { parse_mode: 'Markdown' }
    );
});

// ── Handle the search query (captured via the message gate below) ──
async function handleSearchQuery(chatId, query) {
    try {
        let db;
        try {
            db = await readDB();
        } catch (readErr) {
            console.error('❌ [/search] Failed to read DB:', readErr.message);
            return safeSend(chatId, '⚠️ *Database read failed.* Please try again.', { parse_mode: 'Markdown' });
        }

        if (!Array.isArray(db) || db.length === 0) {
            return safeSend(chatId, '📭 *No students in the database.*', { parse_mode: 'Markdown' });
        }

        const q = query.toLowerCase();
        const results = db.filter(s => {
            return (
                (s.firstName && s.firstName.toLowerCase().includes(q)) ||
                (s.lastName && s.lastName.toLowerCase().includes(q)) ||
                (s.invoiceId && s.invoiceId.toLowerCase().includes(q)) ||
                (s.wilaya && s.wilaya.toLowerCase().includes(q)) ||
                (s.shaba && s.shaba.toLowerCase().includes(q)) ||
                (s.schoolName && s.schoolName.toLowerCase().includes(q)) ||
                (s.dob && s.dob.includes(q)) ||
                (s.status && s.status.toLowerCase().includes(q)) ||
                (s.chatId && s.chatId.toString().includes(q))
            );
        });

        if (results.length === 0) {
            return safeSend(chatId, `🔍 No students found matching "*${query}*"`, { parse_mode: 'Markdown' });
        }

        if (results.length === 1) {
            // Single match — show full card immediately
            return safeSend(chatId, formatStudentCard(results[0]), { parse_mode: 'Markdown' });
        }

        // Multiple matches — show compact list, each with invoice ID for further lookup
        let lines = [];
        lines.push(`🔍 *${results.length} students found for "${query}":*
`);
        results.forEach((s, i) => {
            lines.push(`*${i + 1}.* ${s.firstName} ${s.lastName} — \`${s.invoiceId}\` — ${s.status}`);
        });
        lines.push('');

        // Build safely by lines
        let chunk = '';
        for (const line of lines) {
            const maybe = chunk + line + '\n';
            if (maybe.length > 4000) {
                await safeSend(chatId, chunk, { parse_mode: 'Markdown' });
                chunk = line + '\n';
            } else {
                chunk = maybe;
            }
        }
        if (chunk.trim()) {
            await safeSend(chatId, chunk, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('❌ [/search] Error:', error.message);
        await safeSend(chatId, `⚠️ Failed to search students: ${error.message}`, { parse_mode: 'Markdown' });
    }
}

// ==========================================
// ADMIN COMMAND 3: /updatestatus - Change Student Status
// ==========================================
bot.onText(/\/updatestatus (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    try {
        const invoiceId    = match[1].trim();
        const newStatus    = match[2].toLowerCase();
        const validStatuses = ['pending', 'paid', 'warned', 'kicked'];

        if (!validStatuses.includes(newStatus)) {
            return safeSend(chatId, `❌ *Invalid status* - Use: ${validStatuses.join(', ')}`, { parse_mode: 'Markdown' });
        }

        let result = null;
        await withDB(db => {
            const student = db.find(s => s.invoiceId === invoiceId);
            if (student) {
                result = { name: `${student.firstName} ${student.lastName}`, old: student.status };
                student.status = newStatus;
            }
        });

        if (!result) {
            return safeSend(chatId, `❌ *Student not found* with invoice ID: \`${invoiceId}\``, { parse_mode: 'Markdown' });
        }

        await safeSend(chatId, `✅ *Status Updated*\n\n*Student:* ${result.name}\n*Old Status:* ${result.old}\n*New Status:* ${newStatus}`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('❌ [/updatestatus] Error:', error.message);
        await safeSend(chatId, `⚠️ Failed to update status: ${error.message}`, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// ADMIN COMMAND 4: /updatechat - Link Telegram Chat ID
// ==========================================
bot.onText(/\/updatechat (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    try {
        const invoiceId  = match[1].trim();
        const newChatId  = match[2].trim();
        let result       = null;

        await withDB(db => {
            const student = db.find(s => s.invoiceId === invoiceId);
            if (student) {
                result             = { name: `${student.firstName} ${student.lastName}`, old: student.chatId };
                student.chatId     = newChatId;
            }
        });

        if (!result) {
            return safeSend(chatId, `❌ *Student not found* with invoice ID: \`${invoiceId}\``, { parse_mode: 'Markdown' });
        }

        await safeSend(chatId, `✅ *Telegram ID Linked*\n\n*Student:* ${result.name}\n*Old Chat ID:* ${result.old || 'None'}\n*New Chat ID:* ${newChatId}`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('❌ [/updatechat] Error:', error.message);
        await safeSend(chatId, `⚠️ Failed to link chat ID: ${error.message}`, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// ADMIN COMMAND 5: /delete - Remove Student Record
// ==========================================
bot.onText(/\/delete (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    try {
        const invoiceId = match[1].trim();
        let deleted     = null;

        await withDB(db => {
            const idx = db.findIndex(s => s.invoiceId === invoiceId);
            if (idx !== -1) {
                deleted = db.splice(idx, 1)[0];
            }
        });

        if (!deleted) {
            return safeSend(chatId, `❌ *Student not found* with invoice ID: \`${invoiceId}\``, { parse_mode: 'Markdown' });
        }

        await safeSend(chatId, `✅ *Student Deleted*\n\n*Name:* ${deleted.firstName} ${deleted.lastName}\n*Invoice:* \`${invoiceId}\``, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('❌ [/delete] Error:', error.message);
        await safeSend(chatId, `⚠️ Failed to delete student: ${error.message}`, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// ADMIN COMMAND: /exportpdf - Download full student database as PDF
// ==========================================
bot.onText(/\/exportpdf/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    try {
        const db = await readDB();

        if (db.length === 0) {
            return safeSend(chatId, '📭 *No students in database* — nothing to export.', { parse_mode: 'Markdown' });
        }

        await safeSend(chatId, `⏳ Generating PDF for *${db.length}* student(s)…`, { parse_mode: 'Markdown' });

        const { generateStudentsPDF } = require('./pdf');
        const pdfBuffer = await generateStudentsPDF(db);

        const now      = new Date();
        const datePart = now.toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = `students-${datePart}.pdf`;

        await bot.sendDocument(
            chatId,
            pdfBuffer,
            { caption: `📄 Student export — ${db.length} student(s) — ${datePart}` },
            { filename, contentType: 'application/pdf' }
        );

    } catch (error) {
        console.error('❌ [/exportpdf] Error:', error.message);
        await safeSend(chatId, `⚠️ Failed to generate PDF: ${error.message}`);
    }
});

// ==========================================
// ADMIN COMMAND 6: /help - Show Available Commands
// ==========================================
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    const helpMessage = `
🤖 *Admin Commands*

*📋 View Students*
\`/getall\` — List all students
\`/search\` — Search by name, invoice ID, wilaya, specialty, school, or status
\`/exportpdf\` — Download full database as a PDF file

*💳 Payments*
\`/sendlink <invoiceId>\` — Send a payment renewal link to a student
\`/extend <chatId> <days>\` — Extend a student's subscription by N days

*✏️ Edit Records*
\`/updatestatus <invoiceId> <status>\` — Change status (pending/paid/warned/kicked)
\`/updatechat <invoiceId> <chatId>\` — Link a Telegram chat to a student
\`/delete <invoiceId>\` — Remove a student from the database

📌 *Examples:*
\`/search\` — then type a name or invoice ID
\`/sendlink inv_12345\`
\`/extend 123456789 7\`
`;

    await safeSend(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// ==========================================
// ADMIN COMMAND: /sendlink - Manually send a payment link to a student
// ==========================================
bot.onText(/\/sendlink (.+)/, async (msg, match) => {
    const adminChatId = msg.chat.id;
    if (!isAuthorized(adminChatId)) return;

    try {
        const invoiceId = match[1].trim();
        const db        = await readDB();
        const student   = db.find(s => s.invoiceId === invoiceId);

        if (!student) {
            return safeSend(adminChatId, `❌ *Student not found* with invoice ID: \`${invoiceId}\``, { parse_mode: 'Markdown' });
        }

        if (!student.chatId) {
            return safeSend(adminChatId, `⚠️ *${student.firstName} ${student.lastName}* has not linked their Telegram account yet — cannot send the link.`, { parse_mode: 'Markdown' });
        }

        await safeSend(adminChatId, `⏳ Generating payment link for *${student.firstName} ${student.lastName}*…`, { parse_mode: 'Markdown' });

        const checkoutUrl = await createRenewalLink(student);
        await safeSend(student.chatId, `💰 *Payment Link*\n\nHere is your payment link to renew your subscription:\n\n${checkoutUrl}${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        await safeSend(adminChatId, `✅ Payment link sent to *${student.firstName} ${student.lastName}*.`, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error('❌ [/sendlink] Error:', error.message);
        await safeSend(adminChatId, `⚠️ Failed to send payment link: ${error.message}`);
    }
});

// ==========================================
// FEATURE 2: ADMIN COMMAND - EXTEND SUBSCRIPTION
// ==========================================
bot.onText(/\/extend (.+) (.+)/, async (msg, match) => {
    const adminChatId = msg.chat.id;
    if (!isAuthorized(adminChatId)) return;

    try {
        const targetChatId = match[1].trim();
        const daysToAdd    = parseInt(match[2]);

        if (isNaN(daysToAdd) || daysToAdd <= 0) {
            return safeSend(adminChatId, '❌ Invalid number of days. Use a positive integer.');
        }

        let result = null;
        await withDB(db => {
            const student = db.find(s => s.chatId && s.chatId.toString() === targetChatId);
            if (student && student.subscriptionEndDate) {
                const newDate = new Date(student.subscriptionEndDate);
                newDate.setDate(newDate.getDate() + daysToAdd);
                student.subscriptionEndDate = newDate.toISOString();
                student.status              = 'paid';
                student.warnedTimestamp     = null;
                student.linkSentTimestamp   = null;
                result = { name: student.firstName, studentChatId: student.chatId, newDate: newDate.toISOString().split('T')[0] };
            }
        });

        if (!result) {
            return safeSend(adminChatId, '❌ Student not found or has no active subscription.');
        }

        await safeSend(result.studentChatId, `📅 *Subscription Updated!*\n\nYour renewal date has been adjusted by the admin. Your new due date is: ${result.newDate}.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        await safeSend(adminChatId, `✅ Extended subscription for ${result.name} by ${daysToAdd} days.`);
    } catch (error) {
        console.error('❌ [/extend] Error:', error.message);
        await safeSend(adminChatId, `⚠️ Failed to extend subscription: ${error.message}`);
    }
});

// ==========================================
// HELPER: Format a student record as a Telegram card
// ==========================================
function formatStudentCard(student) {
    const nizamiText = student.isNizami ? 'نظامي' : 'حر';
    return `
👤 *Student Details*

*Name:* ${student.firstName} ${student.lastName}
*Invoice:* \`${student.invoiceId}\`
*Date of Birth:* ${student.dob}
*Wilaya:* ${student.wilaya}
*Specialty:* ${student.shaba}
*School Type:* ${nizamiText}
*School Name:* ${student.schoolName}

💳 *Payment Info*
*Status:* ${student.status}
*Renewals:* ${student.renewalCount || 0} month(s) paid
*Start Date:* ${student.subscriptionStartDate ? student.subscriptionStartDate.split('T')[0] : 'N/A'}
*Expires:* ${student.subscriptionEndDate ? student.subscriptionEndDate.split('T')[0] : 'N/A'}

📱 *Telegram*
*Chat ID:* ${student.chatId || 'Not linked'}
`;
}

// ==========================================
// FEATURE 3: DAILY 8:00 AM CRON JOB (Reminders & Due Links)
// ==========================================
cron.schedule('0 8 * * *', async () => {
    console.log('Running 8:00 AM subscription check...');

    let db;
    try {
        db = await readDB();
    } catch (error) {
        console.error('❌ [cron:daily] Cannot read database, skipping run:', error.message);
        return;
    }

    const now = new Date();

    // Collect expiring students to send the admin a single summary
    const expiringSoon = []; // paid students expiring in 1–6 days

    for (const student of db) {
        if (!student.subscriptionEndDate || !student.chatId) continue;
        if (student.status === 'kicked') continue;

        try {
            const endDate  = new Date(student.subscriptionEndDate);
            const diffTime = endDate - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 6 && diffDays >= 1 && student.status === 'paid') {
                // Remind the student
                await safeSend(student.chatId, `⏳ *Reminder!*\n\nYour subscription expires in ${diffDays} day(s). Please prepare for the next payment.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                // Collect for admin summary
                expiringSoon.push({ student, diffDays });
            }

            if (diffDays <= 0 && student.status === 'paid') {
                try {
                    const checkoutUrl = await createRenewalLink(student);
                    await safeSend(student.chatId, `💰 *Payment Due Today!*\n\nYour monthly subscription has ended. Please renew your access:\n\n${checkoutUrl}${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                } catch (err) {
                    console.error(`❌ [cron:daily] Failed to create renewal link for ${student.firstName}:`, err.message);
                }
            }
        } catch (error) {
            console.error(`❌ [cron:daily] Error processing ${student.firstName} ${student.lastName}:`, error.message);
        }
    }

    // Send admin a daily summary of expiring subscriptions
    if (expiringSoon.length > 0) {
        let adminMsg = `📅 *Daily Expiry Alert — ${expiringSoon.length} student(s) expiring soon:*\n\n`;
        expiringSoon.forEach(({ student: s, diffDays }) => {
            adminMsg += `• *${s.firstName} ${s.lastName}* — ${diffDays} day(s) left\n`;
            adminMsg += `  Invoice: \`${s.invoiceId}\`\n`;
            adminMsg += `  ➡️ Use /sendlink ${s.invoiceId} to send them a payment link\n\n`;
        });
        await safeSend(process.env.TELEGRAM_CHAT_ID, adminMsg, { parse_mode: 'Markdown' });
    }
}, { timezone: 'Africa/Algiers' });

// ==========================================
// FEATURE 4: NON-PAYMENT ENFORCEMENT (Runs every hour)
// ==========================================
cron.schedule('0 * * * *', async () => {
    console.log('Running hourly check for warnings and kicks...');

    let db;
    try {
        db = await readDB();
    } catch (error) {
        console.error('❌ [cron:hourly] Cannot read database, skipping run:', error.message);
        return;
    }

    const now = new Date();

    for (const student of db) {
        if (!student.chatId) continue;

        try {
            if (student.status === 'pending' && student.linkSentTimestamp) {
                const hoursPassedLink = (now - new Date(student.linkSentTimestamp)) / (1000 * 60 * 60);

                if (hoursPassedLink >= 20 && !student.warnedTimestamp) {
                    await withDB(db2 => {
                        const s = db2.find(x => x.invoiceId === student.invoiceId);
                        if (s && s.status === 'pending' && !s.warnedTimestamp) {
                            s.status          = 'warned';
                            s.warnedTimestamp = now.toISOString();
                        }
                    });
                    await safeSend(student.chatId, `🚨 *FINAL WARNING!*\n\nYour payment is severely overdue. You have exactly 4 hours to complete your payment before you are automatically removed from the group.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                }
            }

            if (student.status === 'warned' && student.warnedTimestamp) {
                const hoursPassedWarning = (now - new Date(student.warnedTimestamp)) / (1000 * 60 * 60);

                if (hoursPassedWarning >= 4) {
                    try {
                        await bot.banChatMember(process.env.TELEGRAM_GROUP_CHAT_ID, student.chatId);
                        await safeSend(student.chatId, `❌ *Access Removed*\n\nYou did not complete the payment within the allotted time. You have been removed from the group. Contact support if this is a mistake.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                        await withDB(db2 => {
                            const s = db2.find(x => x.invoiceId === student.invoiceId);
                            if (s) s.status = 'kicked';
                        });
                    } catch (err) {
                        console.error(`❌ [cron:hourly] Failed to kick ${student.chatId}. Is the bot an admin? Error:`, err.message);
                    }
                }
            }
        } catch (error) {
            console.error(`❌ [cron:hourly] Error processing ${student.firstName} ${student.lastName}:`, error.message);
        }
    }
}, { timezone: 'Africa/Algiers' });

console.log('🤖 Telegram Bot is running...');

// Notify admin that the bot process has (re)started.
// The admin will need to re-verify their session since sessions are in-memory.
(async () => {
    try {
        const adminId = (process.env.TELEGRAM_CHAT_ID || '').trim();
        if (adminId) {
            await safeSend(adminId, '🤖 *Bot is online and ready.*\n\nSend your Chat ID to begin your session.', { parse_mode: 'Markdown' });
        }
    } catch (e) {
        console.error('⚠️ Could not send startup notification:', e.message);
    }
})();
