const TelegramBot = require('node-telegram-bot-api');
const cron        = require('node-cron');
const axios       = require('axios');
require('dotenv').config();
const cronJobs = [];

const { initializeDB, readDB, withDB } = require('./db');
const { withRetry }                    = require('./retry');

const bot          = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

bot.on('polling_error', (error) => {
    console.log('[bot] Telegram polling error (may be network):', error.code);
});
const SUPPORT_TEXT = `\n\n_For any issues, contact support: @${process.env.TELEGRAM_SUPPORT_USERNAME}_`;

try {
    initializeDB();
} catch (err) {
    console.error('❌ Bot: Failed to initialize database:', err.message);
    return;    
}

function isAdmin(chatId) {
    const ids = (process.env.TELEGRAM_ADMIN_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (ids.length === 0) {
        return chatId.toString() === (process.env.TELEGRAM_CHAT_ID || '').trim();
    }
    return ids.includes(chatId.toString());
}

const verifiedSessions = new Set();
function isVerified(chatId) {
    return verifiedSessions.has(chatId.toString());
}
function isAuthorized(chatId) {
    return isAdmin(chatId) && isVerified(chatId);
}

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

async function createRenewalLink(student) {
    const payload = {
        amount:      2000,
        currency:    'dzd',
        description: `Renouvellement: ${student.fullName}`,
        client_name: student.fullName,
        client_email: student.email || 'student@example.com',
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

    await withDB(db => {
        const idx = db.findIndex(s => s.chatId && s.chatId.toString() === student.chatId.toString());
        if (idx !== -1) {
            db[idx].renewalInvoiceId   = res.data.id;
            db[idx].status            = 'pending';
            db[idx].linkSentTimestamp = new Date().toISOString();
        }
    });

    return res.data.checkout_url;
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id.toString();
    const text   = (msg.text || '').trim();

    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') return;
    if (/^\/start\s+\S+/.test(text)) return;

    if (pendingScoreQueries.has(chatId)) return handleScoreQuery(chatId, text);
    if (pendingExtendQueries.has(chatId)) return handleExtendQuery(chatId, text);
    if (pendingDeleteQueries.has(chatId)) {
        pendingDeleteQueries.delete(chatId);
        return handleDeleteQuery(chatId, text);
    }
    if (pendingStatusQueries.has(chatId)) {
        pendingStatusQueries.delete(chatId);
        return handleStatusQuery(chatId, text);
    }
    if (pendingSearches.has(chatId)) {
        pendingSearches.delete(chatId);
        return handleSearchQuery(chatId, text);
    }
    if (pendingExportQueries.has(chatId)) {
        pendingExportQueries.delete(chatId);
        return handleExportQuery(chatId, text);
    }

    if (isVerified(chatId)) return;
    if (isAdmin(chatId)) {
        verifiedSessions.add(chatId);
        return; 
    }
});

bot.on('new_chat_members', async (msg) => {
    const chatId = msg.chat.id.toString();
    const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;

    if (chatId !== groupChatId) return;

    for (const newMember of msg.new_chat_members) {
        if (newMember.is_bot) continue;
        const username = newMember.username ? `@${newMember.username}` : null;
        if (!username) continue;

        try {
            let studentName = null;
            await withDB(db => {
                const student = db.students.find(s => s.username && s.username.toLowerCase() === username.toLowerCase());
                if (student) {
                    if (!student.chatId) student.chatId = newMember.id.toString();
                    studentName = student.fullName;
                }
            });

            if (studentName) {
                console.log(`✅ Auto-linked ${username} (${studentName}) to the database via group join.`);
            } else {
                console.log(`⚠️ User ${username} joined the group but is not in the database.`);
            }
        } catch (err) {
            console.error('❌ [new_chat_members] Error:', err.message);
        }
    }
});

bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId    = msg.chat.id;
    const invoiceId = match[1];

    try {
        let studentName = null;
        await withDB(db => {
            const student = db.students.find(s => s.invoiceId === invoiceId);
            if (student) {
                student.chatId = chatId.toString();
                studentName    = student.fullName; 
            }
        });

        if (studentName) {
            await safeSend(chatId, `✅ Welcome ${studentName}! Your Telegram account is now linked to our system.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        } else {
            await safeSend(chatId, `❌ Invoice ID not recognized. Make sure you clicked the correct link after payment.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error('❌ [/start] Error:', error.message);
    }
});

const pendingSearches = new Set();

bot.onText(/^\/search$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    pendingSearches.add(chatId.toString());
    await safeSend(chatId, '🔍 *Search Students*\n\nType a name, invoice ID, or any keyword.', { parse_mode: 'Markdown' });
});

async function handleSearchQuery(chatId, query) {
    try {
        const db = await readDB();
        const students = db.students || [];
        if (students.length === 0) return safeSend(chatId, '📭 *No students in the database.*', { parse_mode: 'Markdown' });

        const q = query.toLowerCase();
        const results = students.filter(s => {
            return (s.fullName && s.fullName.toLowerCase().includes(q)) ||
                   (s.username && s.username.toLowerCase().includes(q)) ||
                   (s.invoiceId && s.invoiceId.toLowerCase().includes(q)) ||
                   (s.wilaya && s.wilaya.toLowerCase().includes(q)) ||
                   (s.shaba && s.shaba.toLowerCase().includes(q)) ||
                   (s.schoolName && s.schoolName.toLowerCase().includes(q));
        });

        if (results.length === 0) return safeSend(chatId, `🔍 No students found matching "*${query}*"`, { parse_mode: 'Markdown' });
        if (results.length === 1) return safeSend(chatId, formatStudentCard(results[0]), { parse_mode: 'Markdown' });

        let lines = [`🔍 *${results.length} students found for "${query}":*\n`];
        results.forEach((s, i) => lines.push(`*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\` — ${s.status}`));
        
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
        if (chunk.trim()) await safeSend(chatId, chunk, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('❌ [/search] Error:', error.message);
    }
}

// ==========================================
// ADMIN COMMAND: /settest
// ==========================================
const pendingSetTest = new Map();

bot.onText(/^\/settest$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    pendingSetTest.set(chatId.toString(), { step: 'group' });

    await bot.sendMessage(chatId, '📚 *Set Active Test*\n\nChoose the group:', {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '🔬 Scientific', callback_data: 'settest_group_scientific' },
                    { text: '📖 Literature', callback_data: 'settest_group_literature' }
                ],
                [{ text: '❌ Cancel', callback_data: 'settest_cancel' }]
            ]
        }
    });
});

// Handle the callback buttons for /settest
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = query.data;

    if (!data || !data.startsWith('settest_')) return; // ignore other callbacks

    if (!isAuthorized(query.message.chat.id)) {
        await bot.answerCallbackQuery(query.id, { text: 'Not authorized' });
        return;
    }

    if (data === 'settest_cancel') {
        pendingSetTest.delete(chatId);
        await bot.editMessageText('❌ Cancelled.', { chat_id: chatId, message_id: query.message.message_id });
        await bot.answerCallbackQuery(query.id);
        return;
    }

    if (data === 'settest_group_scientific' || data === 'settest_group_literature') {
        const group = data === 'settest_group_scientific' ? 'scientific' : 'literature';
        pendingSetTest.set(chatId, { step: 'test', group });

        const tests = [
            { id: '1032', title: 'Ethics in the Workplace' },
            { id: '1033', title: 'Corruption in the Health Sector' },
            { id: '1034', title: 'Ethics in Business' },
            { id: '1035', title: 'The Indus Civilization' },
            { id: '1036', title: "Algeria's UNESCO Heritage" },
            { id: '1037', title: 'Ancient Civilizations' },
            { id: '1038', title: 'Ordinary Unethical Behaviour' }
        ];

        const buttons = tests.map(t => ([{
            text: `${t.id} - ${t.title}`,
            callback_data: `settest_choose_${group}_${t.id}`
        }]));

        buttons.push([{ text: '🚫 Cancel Current Test', callback_data: `settest_clear_${group}` }]);
        buttons.push([{ text: '❌ Close', callback_data: 'settest_cancel' }]);

        await bot.editMessageText(`📚 *Set Active Test for ${group.toUpperCase()}*\n\nChoose a test:`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        });
        await bot.answerCallbackQuery(query.id);
        return;
    }

    if (data.startsWith('settest_clear_')) {
        const group = data.replace('settest_clear_', '');
        await withDB(db => {
            if (!db.activeTests) db.activeTests = { scientific: null, literature: null };
            db.activeTests[group] = null;
        });
        await bot.editMessageText(`✅ Active test for *${group}* has been cancelled.`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown'
        });
        await bot.answerCallbackQuery(query.id, { text: 'Test cancelled' });
        pendingSetTest.delete(chatId);
        return;
    }

    if (data.startsWith('settest_choose_')) {
        const parts = data.replace('settest_choose_', '').split('_');
        const group = parts[0];
        const testId = parts[1];

        await withDB(db => {
            if (!db.activeTests) db.activeTests = { scientific: null, literature: null };
            db.activeTests[group] = testId;
        });

        await bot.editMessageText(`✅ Test *${testId}* is now active for the *${group}* group.`, {
            chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown'
        });
        await bot.answerCallbackQuery(query.id, { text: 'Test assigned!' });
        pendingSetTest.delete(chatId);
        return;
    }
});

// ==========================================
// STATUS, DELETE, EXPORT CALLBACKS
// ==========================================
const pendingStatusQueries = new Set();

bot.onText(/^\/updatestatus$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    pendingStatusQueries.add(chatId.toString());
    await safeSend(chatId, '🔧 *Update Status*\n\nType the student\'s name or invoice ID.', { parse_mode: 'Markdown' });
});

async function handleStatusQuery(chatId, query) {
    try {
        const db = await readDB();
        const students = db.students || [];
        const q = query.toLowerCase();
        const results = students.filter(s => (s.fullName && s.fullName.toLowerCase().includes(q)) || (s.invoiceId && s.invoiceId.toLowerCase().includes(q)));

        if (results.length === 0) return safeSend(chatId, `🔍 No students found matching "*${query}*"`, { parse_mode: 'Markdown' });
        if (results.length === 1) return showStatusButtons(chatId, results[0]);

        let msg = `🔍 *${results.length} students found for "${query}":*\n\n`;
        results.forEach((s, i) => msg += `*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\` — ${s.status}\n`);
        msg += `\nType a more specific name.`;
        pendingStatusQueries.add(chatId.toString());
        await safeSend(chatId, msg, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('❌ [/updatestatus] Error:', error.message);
    }
}

async function showStatusButtons(chatId, student) {
    const buttons = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '🟢 Paid', callback_data: `setstatus|${student.invoiceId}|paid` }, { text: '🟡 Pending', callback_data: `setstatus|${student.invoiceId}|pending` }],
                [{ text: '🟠 Warned', callback_data: `setstatus|${student.invoiceId}|warned` }, { text: '🔴 Kicked', callback_data: `setstatus|${student.invoiceId}|kicked` }]
            ]
        }
    };
    await safeSend(chatId, `🔧 *Update Status*\n\n*Student:* ${student.fullName}\n*Invoice:* \`${student.invoiceId}\`\n*Current Status:* ${student.status}\n\nSelect new status:`, { parse_mode: 'Markdown', ...buttons });
}

const pendingDeleteQueries = new Set();

bot.onText(/^\/delete$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    pendingDeleteQueries.add(chatId.toString());
    await safeSend(chatId, '🗑 *Delete Student*\n\nType the student\'s name or invoice ID.', { parse_mode: 'Markdown' });
});

async function handleDeleteQuery(chatId, text) {
    try {
        const db = await readDB();
        const students = db.students || [];
        const q = text.toLowerCase();
        const results = students.filter(s => (s.fullName && s.fullName.toLowerCase().includes(q)) || (s.invoiceId && s.invoiceId.toLowerCase().includes(q)));

        if (results.length === 0) {
            pendingDeleteQueries.add(chatId.toString());
            return safeSend(chatId, `🔍 No students found matching "*${text}*". Try again.`, { parse_mode: 'Markdown' });
        }
        if (results.length > 1) {
            let msg = `🔍 *${results.length} students found for "${text}":*\n\n`;
            results.forEach((s, i) => msg += `*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\` — ${s.status}\n`);
            msg += `\nType a more specific name.`;
            pendingDeleteQueries.add(chatId.toString());
            return safeSend(chatId, msg, { parse_mode: 'Markdown' });
        }

        const student = results[0];
        const buttons = {
            reply_markup: {
                inline_keyboard: [[{ text: '🗑 Yes, Delete', callback_data: `deleteconfirm|${student.invoiceId}` }, { text: '❌ Cancel', callback_data: 'deletecancel' }]]
            }
        };
        await safeSend(chatId, `⚠️ *Confirm Delete*\n\n*Student:* ${student.fullName}\n*Invoice:* \`${student.invoiceId}\`\n*Status:* ${student.status}\n\nThis cannot be undone. Are you sure?`, { parse_mode: 'Markdown', ...buttons });
    } catch (err) {
        console.error('❌ [/delete] Error:', err.message);
    }
}

const pendingExportQueries = new Set();

bot.onText(/^\/exportpdf$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    const db = await readDB();
    const count = (db.students || []).length;
    const buttons = {
        reply_markup: {
            inline_keyboard: [
                [{ text: `📦 Export ALL (${count} students)`, callback_data: 'exportall' }],
                [{ text: `📊 Score Table (all students)`, callback_data: 'scoretable' }],
                [{ text: `🏆 Top Students (ranked)`, callback_data: 'leaderboard' }]
            ]
        }
    };
    await safeSend(chatId, `📄 *Export PDF*\n\nClick below to export the full database.\nDatabase has *${count}* student(s).`, { parse_mode: 'Markdown', ...buttons });
});

async function handleExportQuery(chatId, text) {
    try {
        const db = await readDB();
        const students = db.students || [];
        const q = text.toLowerCase();
        const results = students.filter(s => (s.fullName && s.fullName.toLowerCase().includes(q)) || (s.invoiceId && s.invoiceId.toLowerCase().includes(q)));

        if (results.length === 0) return safeSend(chatId, `🔍 No students found matching "*${text}*".`, { parse_mode: 'Markdown' });
        if (results.length > 1) {
            let msg = `🔍 *${results.length} students found for "${text}":*\n\n`;
            results.forEach((s, i) => msg += `*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\`\n`);
            return safeSend(chatId, msg, { parse_mode: 'Markdown' });
        }

        const student = results[0];
        await safeSend(chatId, `⏳ Generating PDF for *${student.fullName}*…`, { parse_mode: 'Markdown' });
        const { generateStudentPDF } = require('./pdf');
        const pdfBuffer = await generateStudentPDF(student);
        const filename = `${student.fullName.replace(/\s+/g, '_')}-${student.invoiceId}.pdf`;
        await bot.sendDocument(chatId, pdfBuffer, { caption: `📄 ${student.fullName} — ${student.invoiceId}` }, { filename, contentType: 'application/pdf' });
    } catch (err) {
        console.error('❌ [/exportpdf one] Error:', err.message);
    }
}

// ==========================================
// MAIN CALLBACK HANDLER (Delete, Export, Status)
// ==========================================
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id.toString();
    const data = query.data;
    if (!data) return;

    // Export All
    if (data === 'exportall') {
        try {
            await bot.answerCallbackQuery(query.id);
            const db = await readDB();
            const students = db.students || [];
            if (students.length === 0) return await bot.editMessageText('📭 *No students in database.*', { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
            
            await bot.editMessageText(`⏳ Generating PDF for *${students.length}* student(s)…`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
            const { generateStudentsPDF } = require('./pdf');
            const pdfBuffer = await generateStudentsPDF(students);
            const datePart = new Date().toISOString().split('T')[0];
            await bot.sendDocument(chatId, pdfBuffer, { caption: `📄 All students — ${students.length} student(s) — ${datePart}` }, { filename: `students-${datePart}.pdf`, contentType: 'application/pdf' });
        } catch (err) {
            console.error('❌ [/exportpdf all] Error:', err.message);
        }
        return;
    }

    // Score Table
    if (data === 'scoretable') {
        try {
            await bot.answerCallbackQuery(query.id);
            const db = await readDB();
            const ranked = buildLeaderboard(db.students || []);
            if (ranked.length === 0) return await bot.editMessageText('📭 *No students have scores yet.*', { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });

            let text = '📊 *Score Table* (all students)\n\n`#   Name                     Tests   Avg     Sum     Last`\n`────────────────────────────────────────────────────────`\n';
            ranked.forEach((entry, i) => {
                const s = entry.student, m = entry.summary;
                text += `\`${pad(String(i + 1), 3)} ${pad(s.fullName || 'N/A', 24)}${pad(m.count, 6)}${pad(m.avg + '/100', 7)}${pad(m.sum, 6)}${m.lastDate ? m.lastDate + ' ' + (m.lastTime || '') : 'N/A'}\`\n`;
            });
            await bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
        } catch (err) {
            console.error('❌ [/exportpdf scoretable] Error:', err.message);
        }
        return;
    }

    // Leaderboard
    if (data === 'leaderboard') {
        try {
            await bot.answerCallbackQuery(query.id);
            const db = await readDB();
            const ranked = buildLeaderboard(db.students || []);
            if (ranked.length === 0) return await bot.editMessageText('📭 *No students have scores yet.*', { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });

            let text = '🏆 *Top Students* (ranked by total score)\n\n';
            ranked.forEach((entry, i) => {
                const s = entry.student, m = entry.summary;
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
                text += `${medal} *${s.fullName}* — ${m.avg}/100 (${m.count} test${m.count === 1 ? '' : 's'})\n`;
            });
            await bot.editMessageText(text, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
        } catch (err) {
            console.error('❌ [/exportpdf leaderboard] Error:', err.message);
        }
        return;
    }

    // Delete Confirm
    if (data.startsWith('deleteconfirm|')) {
        const invoiceId = data.split('|')[1];
        try {
            let deleted = null;
            await withDB(db => {
                const idx = db.students.findIndex(s => s.invoiceId === invoiceId);
                if (idx !== -1) deleted = db.students.splice(idx, 1)[0];
            });

            if (!deleted) {
                await bot.answerCallbackQuery(query.id, { text: '❌ Student not found.' });
                return await bot.editMessageText(`⚠️ *Delete Failed*\n\nStudent not found.`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
            }
            await bot.answerCallbackQuery(query.id, { text: '✅ Student deleted.' });
            await bot.editMessageText(`✅ *Student Deleted*\n\n*Name:* ${deleted.fullName}\n*Invoice:* \`${invoiceId}\``, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
        } catch (err) {
            console.error('❌ [/delete confirm] Error:', err.message);
        }
        return;
    }

    if (data === 'deletecancel') {
        await bot.answerCallbackQuery(query.id, { text: '❌ Deletion cancelled.' });
        return await bot.editMessageText(`❌ *Deletion Cancelled*`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
    }

    // Set Status
    if (data.startsWith('setstatus|')) {
        const parts = data.split('|');
        if (parts.length === 3) {
            const [, invoiceId, newStatus] = parts;
            try {
                let updated = null;
                await withDB(db => {
                    const student = db.students.find(s => s.invoiceId === invoiceId);
                    if (student) {
                        updated = { name: student.fullName, old: student.status };
                        student.status = newStatus;
                        if (newStatus === 'paid') {
                            const now = new Date();
                            student.subscriptionStartDate = now.toISOString();
                            const exp = new Date(now); exp.setDate(exp.getDate() + 30);
                            student.subscriptionEndDate = exp.toISOString();
                            student.warnedTimestamp = null;
                            student.linkSentTimestamp = null;
                        }
                    }
                });

                if (!updated) return await bot.answerCallbackQuery(query.id, { text: '❌ Student not found.' });
                let extra = '';
                if (newStatus === 'paid') {
                    const db2 = await readDB();
                    const s = db2.students.find(x => x.invoiceId === invoiceId);
                    if (s && s.subscriptionEndDate) extra = `\n*Expires:* ${s.subscriptionEndDate.split('T')[0]} (+30 days)`;
                }
                await bot.editMessageText(`✅ *Status Updated*\n\n*Student:* ${updated.name}\n*Invoice:* \`${invoiceId}\`\n*From:* ${updated.old}\n*To:* ${newStatus}${extra}`, { chat_id: chatId, message_id: query.message.message_id, parse_mode: 'Markdown' });
            } catch (err) {
                console.error('❌ [/updatestatus callback] Error:', err.message);
            }
        }
        return;
    }
});

// ==========================================
// SCORE CALCULATION HELPERS
// ==========================================
function computeScoreSummary(student) {
    const quizzes = (student.quizScores && Array.isArray(student.quizScores)) ? student.quizScores : [];
    let sum = 0, latest = null;
    for (const q of quizzes) {
        const qScore = (typeof q.score === 'number') ? q.score : (parseFloat(q.score) || 0);
        sum += qScore;
        const d = (q.date || '').split('/').reverse().join('-');
        const stamp = d + ' ' + (q.time || '');
        if (stamp.trim().length > 1 && (!latest || stamp > latest.stamp)) latest = { date: q.date, time: q.time };
    }
    const count = quizzes.length;
    let avg = count > 0 ? sum / count : (typeof student.score === 'number' ? student.score : null);
    return { count, sum: Math.round(sum * 100) / 100, avg: avg != null ? Math.round(avg * 100) / 100 : null, lastDate: latest ? latest.date : null, lastTime: latest ? latest.time : null };
}

function buildLeaderboard(students) {
    return students
        .map(s => ({ student: s, summary: computeScoreSummary(s) }))
        .filter(x => x.summary.avg != null)
        .sort((a, b) => b.summary.avg - a.summary.avg);
}

function pad(str, len) {
    str = String(str);
    return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}

// ==========================================
// ADMIN COMMAND: /setscore
// ==========================================
const pendingScoreQueries = new Map();

bot.onText(/^\/setscore$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    pendingScoreQueries.set(chatId.toString(), { step: 'find', student: null });
    await safeSend(chatId, '📊 *Set Score*\n\nType the student\'s name or invoice ID.', { parse_mode: 'Markdown' });
});

async function handleScoreQuery(chatId, text) {
    const session = pendingScoreQueries.get(chatId.toString());
    if (!session) return;

    if (session.step === 'find') {
        try {
            const db = await readDB();
            const q = text.toLowerCase();
            const results = (db.students || []).filter(s => (s.fullName && s.fullName.toLowerCase().includes(q)) || (s.invoiceId && s.invoiceId.toLowerCase().includes(q)));

            if (results.length === 0) {
                pendingScoreQueries.set(chatId.toString(), { step: 'find', student: null });
                return safeSend(chatId, `🔍 No students found matching "*${text}*". Try again.`, { parse_mode: 'Markdown' });
            }
            if (results.length > 1) {
                let msg = `🔍 *${results.length} students found for "${text}":*\n\n`;
                results.forEach((s, i) => msg += `*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\` — Score: ${s.score != null ? s.score + '/100' : 'N/A'}\n`);
                pendingScoreQueries.set(chatId.toString(), { step: 'find', student: null });
                return safeSend(chatId, msg, { parse_mode: 'Markdown' });
            }

            const student = results[0];
            pendingScoreQueries.set(chatId.toString(), { step: 'score', student });
            await safeSend(chatId, `📊 *Set Score*\n\n*Student:* ${student.fullName}\n*Invoice:* \`${student.invoiceId}\`\n*Current Score:* ${student.score != null ? student.score + '/100' : 'N/A'}\n\nType the new score (0-100):`, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('❌ [/setscore] Error:', err.message);
            pendingScoreQueries.delete(chatId.toString());
        }
    } else if (session.step === 'score') {
        const score = parseInt(text.trim());
        if (isNaN(score) || score < 0 || score > 100) return await safeSend(chatId, '❌ Invalid score. Type a number between 0 and 100.', { parse_mode: 'Markdown' });

        const student = session.student;
        try {
            let result = null;
            await withDB(db => {
                const s = db.students.find(x => x.invoiceId === student.invoiceId);
                if (s) {
                    s.score = score;
                    result = { name: s.fullName, invoiceId: s.invoiceId, score: score };
                }
            });
            pendingScoreQueries.delete(chatId.toString());
            if (!result) return await safeSend(chatId, '❌ *Student not found*.', { parse_mode: 'Markdown' });
            await safeSend(chatId, `✅ *Score Updated*\n\n*Student:* ${result.name}\n*Invoice:* \`${result.invoiceId}\`\n*New Score:* ${result.score}/100`, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('❌ [/setscore] Error:', err.message);
            pendingScoreQueries.delete(chatId.toString());
        }
    }
}

// ==========================================
// ADMIN COMMAND: /addquiz
// ==========================================
bot.onText(/^\/addquiz$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;

    if (!msg.reply_to_message) return await safeSend(chatId, '❌ *Usage:* Reply to the quiz result message and type `/addquiz`.', { parse_mode: 'Markdown' });

    const originalText = msg.reply_to_message.text || '';
    const match = originalText.match(/Quiz:\s*(.+?)\s*\|\s*Username:\s*(@?\w+)\s*(?:\|\s*Date:\s*([\d\/]+))?\s*(?:\|\s*Time:\s*([\d:]+))?\s*\|\s*Score:\s*([\d.]+)/i);
    
    if (!match) return await safeSend(chatId, '❌ Could not parse the message. Format:\n`Quiz: <Name> | Username: <@username> | Score: <Score>`', { parse_mode: 'Markdown' });

    const quizName = match[1].trim();
    const rawUsername = match[2].trim();
    const usernameToFind = rawUsername.replace('@', '').toLowerCase();
    const msgDate = match[3] || null;
    const msgTime = match[4] || null;
    const quizScore = parseFloat(match[5]);

    try {
        const db = await readDB();
        const student = (db.students || []).find(s => s.username && s.username.replace('@', '').toLowerCase() === usernameToFind);

        if (!student) return await safeSend(chatId, `❌ No student found with username *${rawUsername}*.`, { parse_mode: 'Markdown' });

        await withDB(db2 => {
            const s = db2.students.find(x => x.invoiceId === student.invoiceId);
            if (s) {
                if (!Array.isArray(s.quizScores)) s.quizScores = [];
                const now = new Date();
                const dateStr = msgDate || now.toLocaleDateString('en-GB');
                const timeStr = msgTime || now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
                
                const existingIdx = s.quizScores.findIndex(q => q.name === quizName);
                if (existingIdx !== -1) s.quizScores[existingIdx] = { name: quizName, score: quizScore, date: dateStr, time: timeStr };
                else s.quizScores.push({ name: quizName, score: quizScore, date: dateStr, time: timeStr });
                
                const sum = s.quizScores.reduce((acc, q) => acc + q.score, 0);
                s.score = parseFloat((sum / s.quizScores.length).toFixed(2));
            }
        });
        await safeSend(chatId, `✅ *Quiz Score Recorded*\n\n*Student:* ${student.fullName}\n*Quiz:* ${quizName}\n*Score:* ${quizScore}\n\n📊 *Updated Total Score:* ${student.score}/100`, { parse_mode: 'Markdown' });
    } catch (err) {
        console.error('❌ [/addquiz] Error:', err.message);
    }
});

// ==========================================
// ADMIN COMMAND: /help
// ==========================================
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    const helpMessage = `🤖 *Admin Commands*\n\n*📋 View & Export*\n\`/search\` — Search students\n\`/exportpdf\` — Export to PDF\n\n*✏️ Manage Students*\n\`/updatestatus\` — Change status\n\`/delete\` — Delete student\n\`/addquiz\` — Record quiz score (reply to msg)\n\`/setscore\` — Set score (0-100)\n\`/settest\` — Set active test for Scientific/Literature\n\`/sendlink <id>\` — Send renewal link\n\`/extend\` — Add days to subscription`;
    await safeSend(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// ==========================================
// ADMIN COMMAND: /sendlink
// ==========================================
bot.onText(/\/sendlink (.+)/, async (msg, match) => {
    const adminChatId = msg.chat.id;
    if (!isAuthorized(adminChatId)) return;
    try {
        const invoiceId = match[1].trim();
        const db = await readDB();
        const student = (db.students || []).find(s => s.invoiceId === invoiceId);

        if (!student) return await safeSend(adminChatId, `❌ *Student not found* with invoice ID: \`${invoiceId}\``, { parse_mode: 'Markdown' });
        if (!student.chatId) return await safeSend(adminChatId, `⚠️ *${student.fullName}* has not linked their Telegram account.`, { parse_mode: 'Markdown' });

        await safeSend(adminChatId, `⏳ Generating payment link for *${student.fullName}*…`, { parse_mode: 'Markdown' });
        const checkoutUrl = await createRenewalLink(student);
        await safeSend(student.chatId, `💰 *Payment Link*\n\nHere is your payment link to renew:\n\n${checkoutUrl}${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        await safeSend(adminChatId, `✅ Payment link sent to *${student.fullName}*.`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error('❌ [/sendlink] Error:', error.message);
    }
});

// ==========================================
// ADMIN COMMAND: /extend
// ==========================================
const pendingExtendQueries = new Map();

bot.onText(/^\/extend$/, async (msg) => {
    const chatId = msg.chat.id;
    if (!isAuthorized(chatId)) return;
    pendingExtendQueries.set(chatId.toString(), { step: 'find', student: null });
    await safeSend(chatId, '📅 *Extend Subscription*\n\nType the student\'s name or invoice ID.', { parse_mode: 'Markdown' });
});

async function handleExtendQuery(chatId, text) {
    const session = pendingExtendQueries.get(chatId.toString());
    if (!session) return;

    if (session.step === 'find') {
        try {
            const db = await readDB();
            const q = text.toLowerCase();
            const results = (db.students || []).filter(s => (s.fullName && s.fullName.toLowerCase().includes(q)) || (s.invoiceId && s.invoiceId.toLowerCase().includes(q)));
            
            if (results.length === 0) {
                pendingExtendQueries.set(chatId.toString(), { step: 'find', student: null });
                return safeSend(chatId, `🔍 No students found matching "*${text}*". Try again.`, { parse_mode: 'Markdown' });
            }
            if (results.length > 1) {
                let msg = `🔍 *${results.length} students found for "${text}":*\n\n`;
                results.forEach((s, i) => msg += `*${i + 1}.* ${s.fullName} — \`${s.invoiceId}\` — ${s.status} — Ends: ${s.subscriptionEndDate ? s.subscriptionEndDate.split('T')[0] : 'N/A'}\n`);
                pendingExtendQueries.set(chatId.toString(), { step: 'find', student: null });
                return safeSend(chatId, msg, { parse_mode: 'Markdown' });
            }

            const student = results[0];
            pendingExtendQueries.set(chatId.toString(), { step: 'days', student });
            await safeSend(chatId, `📅 *Extend Subscription*\n\n*Student:* ${student.fullName}\n*Invoice:* \`${student.invoiceId}\`\n*Current End Date:* ${student.subscriptionEndDate ? student.subscriptionEndDate.split('T')[0] : 'N/A'}\n\nHow many days to add? (e.g. 7)`, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('❌ [/extend] Error:', err.message);
            pendingExtendQueries.delete(chatId.toString());
        }
    } else if (session.step === 'days') {
        const days = parseInt(text.trim());
        if (isNaN(days) || days <= 0) return await safeSend(chatId, `❌ Invalid number. Type a positive number (e.g. 7)`, { parse_mode: 'Markdown' });

        const student = session.student;
        try {
            let result = null;
            await withDB(db => {
                const s = db.students.find(x => x.invoiceId === student.invoiceId);
                if (s) {
                    const currentEnd = s.subscriptionEndDate ? new Date(s.subscriptionEndDate) : new Date();
                    const newEnd = new Date(currentEnd);
                    newEnd.setDate(newEnd.getDate() + days);
                    s.subscriptionEndDate = newEnd.toISOString();
                    s.status = 'paid';
                    s.warnedTimestamp = null;
                    s.linkSentTimestamp = null;
                    result = { name: s.fullName, invoiceId: s.invoiceId, oldEnd: currentEnd.toISOString().split('T')[0], newEnd: newEnd.toISOString().split('T')[0], days: days };
                }
            });

            pendingExtendQueries.delete(chatId.toString());
            if (!result) return await safeSend(chatId, `❌ *Student not found*.`, { parse_mode: 'Markdown' });
            await safeSend(chatId, `✅ *Subscription Extended*\n\n*Student:* ${result.name}\n*Invoice:* \`${result.invoiceId}\`\n*Added:* ${result.days} day(s)\n*Old End Date:* ${result.oldEnd}\n*New End Date:* ${result.newEnd}\n\n📋 *Copy this to forward to the student:*\n\n📅 *Subscription Updated!*\n\nYour renewal date has been adjusted. Your new due date is: *${result.newEnd}*.`, { parse_mode: 'Markdown' });
        } catch (err) {
            console.error('❌ [/extend] Error:', err.message);
            pendingExtendQueries.delete(chatId.toString());
        }
    }
}

// ==========================================
// HELPER: Format Student Card
// ==========================================
function formatStudentCard(student) {
    const nizamiText = student.isNizami ? 'نظامي' : 'حر';
    const scoreText = student.score != null ? `${student.score}/100` : 'N/A';
    let quizText = 'N/A';
    if (student.quizScores && student.quizScores.length > 0) {
        quizText = '\n' + student.quizScores.map(q => `  • *${q.name}*: ${q.score}/100 (${q.date} ${q.time})`).join('\n');
    }
    return `👤 *Student Details*\n\n*Name:* ${student.fullName}\n*Telegram:* ${student.username || 'N/A'}\n*Invoice:* \`${student.invoiceId}\`\n*Date of Birth:* ${student.dob}\n*Wilaya:* ${student.wilaya}\n*Specialty:* ${student.shaba}\n*School Type:* ${nizamiText}\n*School Name:* ${student.schoolName}\n\n📊 *Average Score:* ${scoreText}\n📝 *Quiz History:* ${quizText}\n\n💳 *Payment Info*\n*Status:* ${student.status}\n*Renewals:* ${student.renewalCount || 0}\n*Expires:* ${student.subscriptionEndDate ? student.subscriptionEndDate.split('T')[0] : 'N/A'}\n\n📱 *Telegram*\n*Chat ID:* ${student.chatId || 'Not linked'}`;
}

// ==========================================
// FEATURE 3: DAILY 8:00 AM CRON JOB
// ==========================================
cronJobs.push(cron.schedule('0 8 * * *', async () => {
    let db;
    try { db = await readDB(); } catch (e) { return console.error('❌ [cron:daily] DB read failed:', e.message); }
    const now = new Date();
    const expiringSoon = [];

    for (const student of (db.students || [])) {
        if (!student.subscriptionEndDate || !student.chatId || student.status === 'kicked') continue;
        try {
            const endDate = new Date(student.subscriptionEndDate);
            const diffDays = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

            if (diffDays <= 6 && diffDays >= 1 && student.status === 'paid') {
                await safeSend(student.chatId, `⏳ *Reminder!*\n\nYour subscription expires in ${diffDays} day(s).${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                expiringSoon.push({ student, diffDays });
            }
            if (diffDays <= 0 && student.status === 'paid') {
                try {
                    const checkoutUrl = await createRenewalLink(student);
                    await safeSend(student.chatId, `💰 *Payment Due Today!*\n\nYour subscription has ended. Please renew:\n\n${checkoutUrl}${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                } catch (err) { console.error(`❌ [cron:daily] Link failed for ${student.fullName}:`, err.message); }
            }
        } catch (e) { console.error(`❌ [cron:daily] Error ${student.fullName}:`, e.message); }
    }

    if (expiringSoon.length > 0) {
        let adminMsg = `📅 *Daily Expiry Alert — ${expiringSoon.length} student(s) expiring soon:*\n\n`;
        expiringSoon.forEach(({ student: s, diffDays }) => {
            adminMsg += `• *${s.fullName}* — ${diffDays} day(s) left\n  Invoice: \`${s.invoiceId}\`\n  ➡️ Use /sendlink ${s.invoiceId}\n\n`;
        });
        await safeSend(process.env.TELEGRAM_CHAT_ID, adminMsg, { parse_mode: 'Markdown' });
    }
}, { timezone: 'Africa/Algiers' }));

// ==========================================
// FEATURE 4: HOURLY CRON JOB
// ==========================================
cronJobs.push(cron.schedule('0 * * * *', async () => {
    let db;
    try { db = await readDB(); } catch (e) { return console.error('❌ [cron:hourly] DB read failed:', e.message); }
    const now = new Date();

    for (const student of (db.students || [])) {
        if (!student.chatId) continue;
        try {
            if (student.status === 'pending' && student.linkSentTimestamp) {
                if ((now - new Date(student.linkSentTimestamp)) / (1000 * 60 * 60) >= 20 && !student.warnedTimestamp) {
                    await withDB(db2 => {
                        const s = db2.students.find(x => x.invoiceId === student.invoiceId);
                        if (s && s.status === 'pending' && !s.warnedTimestamp) {
                            s.status = 'warned'; s.warnedTimestamp = now.toISOString();
                        }
                    });
                    await safeSend(student.chatId, `🚨 *FINAL WARNING!*\n\nYour payment is severely overdue. You have 4 hours before removal.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                }
            }
            if (student.status === 'warned' && student.warnedTimestamp) {
                if ((now - new Date(student.warnedTimestamp)) / (1000 * 60 * 60) >= 4) {
                    try {
                        await bot.banChatMember(process.env.TELEGRAM_GROUP_CHAT_ID, student.chatId);
                        await safeSend(student.chatId, `❌ *Access Removed*\n\nYou were removed for non-payment.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                        await withDB(db2 => {
                            const s = db2.students.find(x => x.invoiceId === student.invoiceId);
                            if (s) s.status = 'kicked';
                        });
                    } catch (err) { console.error(`❌ [cron:hourly] Kick failed ${student.chatId}:`, err.message); }
                }
            }
        } catch (e) { console.error(`❌ [cron:hourly] Error ${student.fullName}:`, e.message); }
    }
}, { timezone: 'Africa/Algiers' }));

console.log('🤖 Telegram Bot is running...');
(async () => {
    try {
        const adminIds = (process.env.TELEGRAM_ADMIN_CHAT_IDS || process.env.TELEGRAM_CHAT_ID || '').split(',').map(s => s.trim()).filter(Boolean);
        for (const id of adminIds) await safeSend(id, '🤖 *Bot is online and ready.*', { parse_mode: 'Markdown' });
    } catch (e) { console.error('⚠️ Startup notify failed:', e.message); }
})();

process.on('SIGTERM', async () => { cronJobs.forEach(job => job.stop()); try { await bot.stopPolling(); } catch (e) {} process.exit(0); });
process.on('SIGINT', async () => { cronJobs.forEach(job => job.stop()); try { await bot.stopPolling(); } catch (e) {} process.exit(0); });
