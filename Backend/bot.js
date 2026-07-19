const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const DB_PATH = path.join(__dirname, 'database.json');
const SUPPORT_TEXT = `\n\n_For any issues, contact support: @${process.env.TELEGRAM_SUPPORT_USERNAME}_`;

// ==========================================
// DATABASE HELPERS (with proper error propagation)
// ==========================================

/**
 * Read and parse the database file.
 * Throws an error if the file cannot be read or parsed,
 * so callers can decide how to handle the failure.
 */
const getDB = () => {
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (error) {
        console.error("❌ [getDB] Failed to read database:", error.message);
        throw new Error(`Database read failed: ${error.message}`);
    }
};

/**
 * Write data to the database file.
 * Throws an error if the write fails so callers are not
 * left thinking the save succeeded.
 */
const saveDB = (data) => {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error("❌ [saveDB] Failed to write database:", error.message);
        throw new Error(`Database write failed: ${error.message}`);
    }
};

// ==========================================
// HELPER: Check if user is admin
// ==========================================
function isAdmin(chatId) {
    return chatId.toString() === process.env.TELEGRAM_CHAT_ID;
}

// ==========================================
// HELPER: Safe sendMessage (logs but never throws)
// ==========================================
async function safeSend(chatId, text, options = {}) {
    try {
        await bot.sendMessage(chatId, text, options);
    } catch (err) {
        console.error(`❌ [safeSend] Failed to send message to ${chatId}:`, err.message);
    }
}

// Helper to generate a new Chargily Pay link for monthly renewals
async function createRenewalLink(student) {
    const payload = {
        amount: 2000,
        currency: 'dzd',
        description: `Renouvellement: ${student.firstName} ${student.lastName}`,
        client_name: `${student.firstName} ${student.lastName}`,
        client_email: 'student@example.com',
        back_url: `${process.env.FRONTEND_URL}/payment.html`,
        webhook_url: `${process.env.BACKEND_URL}/api/webhook/chargily`
    };

    const res = await axios.post('https://pay.chargily.com/api/v2/checkouts', payload, {
        headers: { 'Authorization': `Bearer ${process.env.CHARGILY_SECRET_KEY}`, 'Content-Type': 'application/json' }
    });

    // Update DB with new invoice ID so webhook recognizes the new payment
    const db = getDB();
    const idx = db.findIndex(s => s.chatId === student.chatId);
    if (idx !== -1) {
        db[idx].invoiceId = res.data.id;
        db[idx].status = 'pending';
        db[idx].linkSentTimestamp = new Date().toISOString();
        saveDB(db);
    }
    return res.data.checkout_url;
}

// ==========================================
// FEATURE 1: STUDENT REGISTERS THEIR TELEGRAM ID
// ==========================================
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const invoiceId = match[1];

    try {
        const db = getDB();
        const student = db.find(s => s.invoiceId === invoiceId);

        if (student) {
            student.chatId = chatId;
            saveDB(db);
            await safeSend(chatId, `✅ Welcome ${student.firstName}! Your Telegram account is now linked to our system.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        } else {
            await safeSend(chatId, `❌ Invoice ID not recognized. Make sure you clicked the correct link after payment.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error("❌ [/start] Error:", error.message);
        await safeSend(chatId, `⚠️ A system error occurred while linking your account. Please try again or contact support.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// ADMIN COMMAND 1: /getall - Show All Students
// ==========================================
bot.onText(/\/getall/, async (msg) => {
    const chatId = msg.chat.id;

    if (!isAdmin(chatId)) {
        return safeSend(chatId, "⛔ *Unauthorized* - Admin only command", { parse_mode: 'Markdown' });
    }

    try {
        const db = getDB();
        if (db.length === 0) {
            return safeSend(chatId, "📭 *No students in database*", { parse_mode: 'Markdown' });
        }

        let message = `📊 *Total Students: ${db.length}*\n\n`;

        db.forEach((student, index) => {
            message += `*${index + 1}. ${student.firstName} ${student.lastName}*\n`;
            message += `   Invoice: \`${student.invoiceId}\`\n`;
            message += `   Status: ${student.status}\n`;
            message += `   Telegram: ${student.chatId || 'Not linked'}\n`;
            message += `   Expires: ${student.subscriptionEndDate ? student.subscriptionEndDate.split('T')[0] : 'N/A'}\n\n`;
        });

        // Split message if too long
        if (message.length > 4096) {
            const chunks = message.match(/[\s\S]{1,4096}/g);
            for (const chunk of chunks) {
                await safeSend(chatId, chunk, { parse_mode: 'Markdown' });
            }
        } else {
            await safeSend(chatId, message, { parse_mode: 'Markdown' });
        }
    } catch (error) {
        console.error("❌ [/getall] Error:", error.message);
        await safeSend(chatId, `⚠️ Failed to retrieve student list: ${error.message}`, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// ADMIN COMMAND 2: /getstudent - Get Single Student
// ==========================================
bot.onText(/\/getstudent (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    if (!isAdmin(chatId)) {
        return safeSend(chatId, "⛔ *Unauthorized* - Admin only command", { parse_mode: 'Markdown' });
    }

    try {
        const invoiceId = match[1];
        const db = getDB();
        const student = db.find(s => s.invoiceId === invoiceId);

        if (!student) {
            return safeSend(chatId, `❌ *Student not found* with invoice ID: \`${invoiceId}\``, { parse_mode: 'Markdown' });
        }

        const nizamiText = student.isNizami ? "نظامي" : "حر";
        const message = `
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
*Start Date:* ${student.subscriptionStartDate ? student.subscriptionStartDate.split('T')[0] : 'N/A'}
*Expires:* ${student.subscriptionEndDate ? student.subscriptionEndDate.split('T')[0] : 'N/A'}

📱 *Telegram*
*Chat ID:* ${student.chatId || 'Not linked'}
`;

        await safeSend(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error("❌ [/getstudent] Error:", error.message);
        await safeSend(chatId, `⚠️ Failed to retrieve student: ${error.message}`, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// ADMIN COMMAND 3: /updatestatus - Change Student Status
// ==========================================
bot.onText(/\/updatestatus (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    if (!isAdmin(chatId)) {
        return safeSend(chatId, "⛔ *Unauthorized* - Admin only command", { parse_mode: 'Markdown' });
    }

    try {
        const invoiceId = match[1];
        const newStatus = match[2].toLowerCase();
        const validStatuses = ['pending', 'paid', 'warned', 'kicked'];

        if (!validStatuses.includes(newStatus)) {
            return safeSend(chatId, `❌ *Invalid status* - Use: ${validStatuses.join(', ')}`, { parse_mode: 'Markdown' });
        }

        const db = getDB();
        const student = db.find(s => s.invoiceId === invoiceId);

        if (!student) {
            return safeSend(chatId, `❌ *Student not found* with invoice ID: \`${invoiceId}\``, { parse_mode: 'Markdown' });
        }

        const oldStatus = student.status;
        student.status = newStatus;
        saveDB(db);

        await safeSend(chatId, `✅ *Status Updated*\n\n*Student:* ${student.firstName} ${student.lastName}\n*Old Status:* ${oldStatus}\n*New Status:* ${newStatus}`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error("❌ [/updatestatus] Error:", error.message);
        await safeSend(chatId, `⚠️ Failed to update status: ${error.message}`, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// ADMIN COMMAND 4: /updatechat - Link Telegram Chat ID
// ==========================================
bot.onText(/\/updatechat (.+) (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    if (!isAdmin(chatId)) {
        return safeSend(chatId, "⛔ *Unauthorized* - Admin only command", { parse_mode: 'Markdown' });
    }

    try {
        const invoiceId = match[1];
        const newChatId = match[2];

        const db = getDB();
        const student = db.find(s => s.invoiceId === invoiceId);

        if (!student) {
            return safeSend(chatId, `❌ *Student not found* with invoice ID: \`${invoiceId}\``, { parse_mode: 'Markdown' });
        }

        const oldChatId = student.chatId;
        student.chatId = newChatId;
        saveDB(db);

        await safeSend(chatId, `✅ *Telegram ID Linked*\n\n*Student:* ${student.firstName} ${student.lastName}\n*Old Chat ID:* ${oldChatId || 'None'}\n*New Chat ID:* ${newChatId}`, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error("❌ [/updatechat] Error:", error.message);
        await safeSend(chatId, `⚠️ Failed to link chat ID: ${error.message}`, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// ADMIN COMMAND 5: /delete - Remove Student Record
// ==========================================
bot.onText(/\/delete (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;

    if (!isAdmin(chatId)) {
        return safeSend(chatId, "⛔ *Unauthorized* - Admin only command", { parse_mode: 'Markdown' });
    }

    try {
        const invoiceId = match[1];
        const db = getDB();
        const studentIndex = db.findIndex(s => s.invoiceId === invoiceId);

        if (studentIndex === -1) {
            return safeSend(chatId, `❌ *Student not found* with invoice ID: \`${invoiceId}\``, { parse_mode: 'Markdown' });
        }

        const student = db[studentIndex];
        db.splice(studentIndex, 1);
        saveDB(db);

        await safeSend(chatId, `✅ *Student Deleted*\n\n*Name:* ${student.firstName} ${student.lastName}\n*Invoice:* \`${invoiceId}\``, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error("❌ [/delete] Error:", error.message);
        await safeSend(chatId, `⚠️ Failed to delete student: ${error.message}`, { parse_mode: 'Markdown' });
    }
});

// ==========================================
// ADMIN COMMAND 6: /help - Show Available Commands
// ==========================================
bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;

    if (!isAdmin(chatId)) {
        return safeSend(chatId, "⛔ *Unauthorized* - Admin only command", { parse_mode: 'Markdown' });
    }

    const helpMessage = `
🤖 *Admin Database Commands*

\`/getall\` - Show all students in database
\`/getstudent <invoiceId>\` - Get details of one student
\`/updatestatus <invoiceId> <status>\` - Change status (pending/paid/warned/kicked)
\`/updatechat <invoiceId> <chatId>\` - Link Telegram chat to student
\`/delete <invoiceId>\` - Remove student from database
\`/extend <chatId> <days>\` - Extend a student's subscription
\`/help\` - Show this help message

📌 *Example:*
\`/updatestatus inv_12345 paid\`
\`/getstudent inv_12345\`
`;

    await safeSend(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// ==========================================
// FEATURE 2: ADMIN COMMAND - EXTEND SUBSCRIPTION
// ==========================================
bot.onText(/\/extend (.+) (.+)/, async (msg, match) => {
    const adminChatId = msg.chat.id;

    if (!isAdmin(adminChatId)) {
        return safeSend(adminChatId, "⛔ Unauthorized.");
    }

    try {
        const targetChatId = match[1];
        const daysToAdd = parseInt(match[2]);

        if (isNaN(daysToAdd) || daysToAdd <= 0) {
            return safeSend(adminChatId, "❌ Invalid number of days. Use a positive integer.");
        }

        const db = getDB();
        const student = db.find(s => s.chatId && s.chatId.toString() === targetChatId);

        if (!student || !student.subscriptionEndDate) {
            return safeSend(adminChatId, "❌ Student not found or has no active subscription.");
        }

        const newDate = new Date(student.subscriptionEndDate);
        newDate.setDate(newDate.getDate() + daysToAdd);
        student.subscriptionEndDate = newDate.toISOString();
        student.status = 'paid';
        student.warnedTimestamp = null;
        student.linkSentTimestamp = null;
        saveDB(db);

        const msgText = `📅 *Subscription Updated!*\n\nYour monthly renewal date has been adjusted by the admin. Your new due date is: ${newDate.toISOString().split('T')[0]}.${SUPPORT_TEXT}`;
        await safeSend(student.chatId, msgText, { parse_mode: 'Markdown' });
        await safeSend(adminChatId, `✅ Extended subscription for ${student.firstName} by ${daysToAdd} days.`);
    } catch (error) {
        console.error("❌ [/extend] Error:", error.message);
        await safeSend(adminChatId, `⚠️ Failed to extend subscription: ${error.message}`);
    }
});

// ==========================================
// FEATURE 3: DAILY 8:00 AM CRON JOB (Reminders & Due Links)
// ==========================================
cron.schedule('0 8 * * *', async () => {
    console.log("Running 8:00 AM subscription check...");

    let db;
    try {
        db = getDB();
    } catch (error) {
        console.error("❌ [cron:daily] Cannot read database, skipping run:", error.message);
        return;
    }

    const now = new Date();

    for (const student of db) {
        if (!student.subscriptionEndDate || !student.chatId) continue;
        if (student.status === 'kicked') continue;

        try {
            const endDate = new Date(student.subscriptionEndDate);
            const diffTime = endDate - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays <= 6 && diffDays >= 5 && student.status === 'paid') {
                await safeSend(student.chatId, `⏳ *Reminder!*\n\nYour subscription expires in ${diffDays} days. Please prepare for the next payment.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
            }

            if (diffDays <= 0 && student.status === 'paid') {
                try {
                    const checkoutUrl = await createRenewalLink(student);
                    await safeSend(student.chatId, `💰 *Payment Due Today!*\n\nYour monthly subscription has ended. Please click the link below to renew your access:\n\n${checkoutUrl}${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                } catch (err) {
                    console.error(`❌ [cron:daily] Failed to create renewal link for ${student.firstName}:`, err.message);
                }
            }
        } catch (error) {
            console.error(`❌ [cron:daily] Error processing student ${student.firstName} ${student.lastName}:`, error.message);
            // Continue to next student
        }
    }
}, {
    timezone: "Africa/Algiers"
});

// ==========================================
// FEATURE 4: NON-PAYMENT ENFORCEMENT (Runs every hour)
// ==========================================
cron.schedule('0 * * * *', async () => {
    console.log("Running hourly check for warnings and kicks...");

    let db;
    try {
        db = getDB();
    } catch (error) {
        console.error("❌ [cron:hourly] Cannot read database, skipping run:", error.message);
        return;
    }

    const now = new Date();

    for (const student of db) {
        if (!student.chatId) continue;

        try {
            if (student.status === 'pending' && student.linkSentTimestamp) {
                const linkSentTime = new Date(student.linkSentTimestamp);
                const hoursPassedLink = (now - linkSentTime) / (1000 * 60 * 60);

                if (hoursPassedLink >= 20 && !student.warnedTimestamp) {
                    student.status = 'warned';
                    student.warnedTimestamp = now.toISOString();
                    saveDB(db);
                    await safeSend(student.chatId, `🚨 *FINAL WARNING!*\n\nYour payment is severely overdue. You have exactly 4 hours to complete your payment before you are automatically removed from the group.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });
                }
            }

            if (student.status === 'warned' && student.warnedTimestamp) {
                const warnedTime = new Date(student.warnedTimestamp);
                const hoursPassedWarning = (now - warnedTime) / (1000 * 60 * 60);

                if (hoursPassedWarning >= 4) {
                    try {
                        await bot.banChatMember(process.env.TELEGRAM_GROUP_CHAT_ID, student.chatId);
                        await safeSend(student.chatId, `❌ *Access Removed*\n\nYou did not complete the payment within the allotted time. You have been removed from the group. Contact support if this is a mistake.${SUPPORT_TEXT}`, { parse_mode: 'Markdown' });

                        student.status = 'kicked';
                        saveDB(db);
                    } catch (err) {
                        console.error(`❌ [cron:hourly] Failed to kick ${student.chatId}. Is the bot an admin in the group? Error:`, err.message);
                    }
                }
            }
        } catch (error) {
            console.error(`❌ [cron:hourly] Error processing student ${student.firstName} ${student.lastName}:`, error.message);
            // Continue to next student
        }
    }
}, {
    timezone: "Africa/Algiers"
});

console.log("Telegram Bot is running...");
