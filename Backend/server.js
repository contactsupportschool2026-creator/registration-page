const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const crypto  = require('crypto');
const path    = require('path');
require('dotenv').config();

const { initializeDB, readDB, withDB } = require('./db');
const { withRetry }                    = require('./retry');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '..')));
initializeDB();

function telegramNotify(text, chatId = null, parseMode = 'HTML') {
    if (!process.env.TELEGRAM_BOT_TOKEN) return;
    const targetChatId = chatId || process.env.TELEGRAM_CHAT_ID;
    const TELEGRAM_API = 'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendMessage';
    return axios.post(TELEGRAM_API, {
        chat_id: targetChatId,
        text: text,
        parse_mode: parseMode
    }, { timeout: 10000 }).catch(e => console.error('Telegram notify failed:', e.response ? JSON.stringify(e.response.data) : e.message));
}

const processingInvoices = new Set();
function lockInvoice(id) { if (processingInvoices.has(id)) return false; processingInvoices.add(id); return true; }
function unlockInvoice(id) { processingInvoices.delete(id); }

function verifyChargilySignature(rawBody, signature) {
    return crypto.createHmac('sha256', process.env.CHARGILY_SECRET_KEY_2).update(rawBody).digest('hex') === signature;
}

app.post('/api/log-error', express.json(), async (req, res) => {
    try {
        const { message } = req.body;
        if (message) await telegramNotify('🚨 *FRONTEND ERROR* \n' + message);
    } catch (e) { console.error('Log error failed:', e.message); }
    res.status(200).send('OK');
});

app.post('/api/webhook/chargily', express.raw({ type: 'application/json' }), async (req, res) => {
    const rawBody = req.body;
    const signature = req.headers['signature'];
    if (!signature) return res.status(401).json({ error: 'Missing signature' });
    if (!verifyChargilySignature(rawBody, signature)) return res.status(401).json({ error: 'Invalid signature' });

    let payload;
    try { payload = JSON.parse(rawBody.toString('utf-8')); } catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }

    if (payload.status === 'paid') {
        const invoiceId = payload.id;
        if (!lockInvoice(invoiceId)) return res.status(200).send('OK');
        try {
            const snapshot = await withDB(db => {
                if (!db.students) db.students = [];
                const idx = db.students.findIndex(s => s.invoiceId === invoiceId || s.renewalInvoiceId === invoiceId || (s.paymentHistory && s.paymentHistory.some(p => p.invoiceId === invoiceId)));
                if (idx !== -1 && (db.students[idx].status === 'pending' || db.students[idx].status === 'paid')) {
                    const now = new Date(), exp = new Date(now);
                    exp.setDate(exp.getDate() + 30);
                    db.students[idx].status = 'paid';
                    if (!db.students[idx].subscriptionStartDate) db.students[idx].subscriptionStartDate = now.toISOString();
                    db.students[idx].subscriptionEndDate = exp.toISOString();
                    db.students[idx].renewalCount = (db.students[idx].renewalCount || 0) + 1;
                    if (!db.students[idx].paymentHistory) db.students[idx].paymentHistory = [];
                    db.students[idx].paymentHistory.push({
                        date: now.toISOString(), amount: 2000, currency: 'DZD', invoiceId: db.students[idx].invoiceId, renewalNumber: db.students[idx].renewalCount
                    });
                    return { ...db.students[idx] };
                }
                return null;
            });
            if (snapshot) {
                const s = snapshot;
                const newExpiry = s.subscriptionEndDate ? s.subscriptionEndDate.split('T')[0] : 'N/A';
                const msg = `🟢 *دفعة جديدة ناجحة!*\n\n🥇 **الإسم:** ${s.fullName}\n📧 **البريد:** ${s.email}\n📅 **تاريخ الميلاد:** ${s.dob}\n🏙️ **الولاية:** ${s.wilaya}\n📚 **الشعبة:** ${s.shaba}\n🏫 **نوعية التعليم:** ${s.isNizami ? 'نظامي' : 'حر'}\n🏫 **اسم الثانوية:** ${s.schoolName}\n\n💎 **الحالة:** مدفوع (2000 دج)\n⏳ **الاشتراك حتى:** ${newExpiry}\n🔁 **عدد التجديدات:** ${s.renewalCount}`;
                const sup = `\n\n_For any issues, contact: @${process.env.TELEGRAM_SUPPORT_USERNAME}_`;
                await telegramNotify(msg + sup);
            }
        } catch (error) { console.error('Webhook Error:', error.message); }
        finally { unlockInvoice(invoiceId); }
    }
    res.status(200).send('OK');
});

app.use(express.json());

app.get('/api/check-username', async (req, res) => {
    try {
        const requestedUsername = (req.query.username || '').toLowerCase().replace('@', '').trim();
        if (!requestedUsername) return res.json({ valid: false });
        const db = await readDB();
        const students = db.students || [];
        const studentExists = students.some(s => s.username && s.username.toLowerCase().replace('@', '') === requestedUsername);
        res.json({ valid: studentExists });
    } catch (error) {
        console.error('Check Username Error:', error.message);
        res.status(500).json({ valid: false, error: 'Failed to check username' });
    }
});

app.get('/api/get-assigned-test', async (req, res) => {
    try {
        const requestedUsername = (req.query.username || '').toLowerCase().replace('@', '').trim();
        if (!requestedUsername) return res.json({ valid: false, message: 'Username is required' });

        const db = await readDB();
        const students = db.students || [];
        const activeTests = db.activeTests || {};
        const activeWriting = db.activeWriting || {};
        const submittedEssays = db.submittedEssays || { scientific: [], literature: [] };

        const student = students.find(s => s.username && s.username.toLowerCase().replace('@', '') === requestedUsername);

        if (!student) return res.json({ valid: false, message: 'Username not found. Make sure your account is registered and you joined the bot.' });

        const scientificShabas = ['sciences expérimentales', 'mathématiques', 'technique mathématiques', 'technique sciences expérimentales', 'informatique', 'maths', 'math', 'science', 'sciences'];
        const shaba = (student.shaba || '').toLowerCase();
        const group = scientificShabas.includes(shaba) ? 'scientific' : 'literature';

        if (activeTests[group]) {
            return res.json({ valid: true, type: 'reading', testId: activeTests[group], group });
        }
        
        if (activeWriting[group]) {
            // Check if student already submitted
            const alreadySubmitted = submittedEssays[group].some(e => e.username === student.username);
            if (alreadySubmitted) {
                return res.json({ 
                    valid: true, 
                    type: 'already_submitted', 
                    message: 'Your essay has already been submitted. You have to wait until it\'s been corrected. You will be informed once the correction ends through the Telegram group.' 
                });
            }
            return res.json({ valid: true, type: 'writing', topicId: activeWriting[group].id, group });
        }

        res.json({ valid: true, active: false, group, message: `There is no active test at the moment for the ${group} group.` });

    } catch (error) {
        console.error('Get Assigned Test Error:', error.message);
        res.status(500).json({ valid: false, message: 'Server error' });
    }
});

app.post('/api/teacher-login', (req, res) => {
    const { password } = req.body;
    if (password === process.env.TEACHER_PASSWORD) return res.json({ success: true });
    res.json({ success: false });
});

app.post('/api/submit-essay', async (req, res) => {
    try {
        const { username, group, topicId, content } = req.body;
        if (!username || !group || !topicId || !content) return res.status(400).json({ success: false });

        await withDB(db => {
            if (!db.submittedEssays) db.submittedEssays = { scientific: [], literature: [] };
            db.submittedEssays[group].push({ id: Date.now().toString(), username, topicId, content });
        });
        res.json({ success: true });
    } catch (error) {
        console.error('Submit Essay Error:', error.message);
        res.status(500).json({ success: false });
    }
});

app.get('/api/get-essays-for-correction', async (req, res) => {
    try {
        const { group } = req.query;
        const db = await readDB();
        const essays = (db.submittedEssays && db.submittedEssays[group]) || [];
        res.json({ essays });
    } catch (error) {
        res.status(500).json({ essays: [] });
    }
});

app.post('/api/submit-essay-grade', async (req, res) => {
    try {
        const { essayId, group, grade, notes, correctedContent } = req.body;
        let queueEmpty = false;
        let topicTitle = 'Writing Expression';

        await withDB(db => {
            if (!db.submittedEssays) db.submittedEssays = { scientific: [], literature: [] };
            if (!db.gradedEssays) db.gradedEssays = { scientific: [], literature: [] };
            
            const essayIdx = db.submittedEssays[group].findIndex(e => e.id === essayId);
            if (essayIdx !== -1) {
                const essay = db.submittedEssays[group][essayIdx];
                db.gradedEssays[group].push({ username: essay.username, grade: parseInt(grade), notes, originalContent: essay.content, correctedContent });
                db.submittedEssays[group].splice(essayIdx, 1);
                
                if (db.submittedEssays[group].length === 0) {
                    queueEmpty = true;
                    if (db.activeWriting && db.activeWriting[group] && db.activeWriting[group].title) {
                        topicTitle = db.activeWriting[group].title;
                    }
                }
            }
        });

        if (queueEmpty) {
            const db = await readDB();
            const graded = (db.gradedEssays && db.gradedEssays[group]) || [];
            graded.sort((a, b) => b.grade - a.grade);
            
            // Use HTML for safer Telegram formatting
            let leaderboardMsg = `📢 <b>The grades for ${topicTitle} are available for review (${group.toUpperCase()})</b>\n\n🏆 <b>Top Grades:</b>\n`;
            graded.slice(0, 5).forEach((e, i) => {
                leaderboardMsg += `${i + 1}. ${e.username} - ${e.grade}/100\n`;
            });

            const groupId = group === 'scientific' ? process.env.TELEGRAM_GROUP_CHAT_ID : process.env.TELEGRAM_LITERATURE_GROUP_CHAT_ID;
            console.log(`[Queue Empty] Attempting to send leaderboard to group: ${groupId}`);
            
            if (groupId) {
                await telegramNotify(leaderboardMsg, groupId, 'HTML');
            } else {
                console.error(`[Queue Empty] Group ID for ${group} is missing in environment variables!`);
            }
            
            // Clear active writing so students go back to normal
            await withDB(db => {
                db.activeWriting[group] = null;
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Submit Grade Error:', error.message);
        res.status(500).json({ success: false });
    }
});


app.post('/api/send-quiz-result', async (req, res) => {
    try {
        const { quizName, username, score } = req.body;
        if (!quizName || !username || score === undefined) return res.status(400).json({ success: false, error: 'Missing fields' });

        const datePart = req.body.date ? ` | Date: ${req.body.date}` : '';
        const timePart = req.body.time ? ` | Time: ${req.body.time}` : '';
        const message = `📝 *New Quiz Result*\n\nQuiz: ${quizName} | Username: ${username}${datePart}${timePart} | Score: ${score}`;
        await telegramNotify(message);
        res.json({ success: true });
    } catch (error) {
        console.error('Send Quiz Result Error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to send result' });
    }
});

app.post('/api/create-checkout', async (req, res) => {
    try {
        const { fullName, telegramUsername, dob, wilaya, shaba, isNizami, schoolName, email } = req.body;
        let formattedUsername = telegramUsername.trim();
        if (!formattedUsername.startsWith('@')) formattedUsername = '@' + formattedUsername;

        const studentData = { 
            fullName, email: email || 'student@example.com', username: formattedUsername, dob, wilaya, shaba, isNizami, schoolName, 
            status: 'pending', subscriptionStartDate: null, subscriptionEndDate: null, chatId: null, invoiceId: null, 
            warnedTimestamp: null, linkSentTimestamp: null, renewalCount: 0 
        };
        
        const chargilyPayload = { 
            amount: 2000, currency: 'dzd', payment_method: 'edahabia', 
            success_url: process.env.FRONTEND_URL + '/payment.html', webhook_endpoint: process.env.BACKEND_URL + '/api/webhook/chargily', 
            description: 'School Registration: ' + fullName, metadata: { full_name: fullName, telegram: formattedUsername, wilaya, shaba } 
        };

        const chargilyResponse = await withRetry(
            () => axios.post('https://pay.chargily.net/api/v2/checkouts', chargilyPayload, {
                headers: { 'Authorization': 'Bearer ' + process.env.CHARGILY_SECRET_KEY_2, 'Content-Type': 'application/json' }
            }),
            { label: 'chargily:create-checkout' }
        );

        studentData.invoiceId = chargilyResponse.data.id;
        await withDB(db => { if (!db.students) db.students = []; db.students.push(studentData); });
        await telegramNotify('*New Registration*\nName: ' + fullName + '\nTelegram: ' + formattedUsername + '\nWilaya: ' + wilaya + '\nShaba: ' + shaba + '\nInvoice: ' + chargilyResponse.data.id);
        res.json({ checkoutUrl: chargilyResponse.data.checkout_url });
    } catch (error) {
        console.error('Checkout Error:', error.message);
        let errorMsg = error.message, errorStatus = 500;
        if (error.response) {
            errorStatus = error.response.status;
            if (error.response.data) errorMsg = typeof error.response.data === 'string' ? error.response.data : (error.response.data.message || JSON.stringify(error.response.data));
        }
        await telegramNotify('❌ *CHECKOUT FAILED*\nError: ' + errorMsg + '\nStatus: ' + errorStatus);
        res.status(errorStatus).json({ error: errorMsg });
    }
});

app.get('/api/check-payment/:invoiceId', async (req, res) => {
    try {
        const db = await readDB();
        const student = (db.students || []).find(s => s.invoiceId === req.params.invoiceId);
        if (student && student.status === 'paid') {
            const scientificShabas = ['sciences expérimentales', 'mathématiques', 'technique mathématiques', 'technique sciences expérimentales', 'informatique', 'maths', 'math', 'science', 'sciences'];
            const shaba = (student.shaba || '').toLowerCase();
            const isScientific = scientificShabas.includes(shaba);
            const groupLink = isScientific ? process.env.TELEGRAM_GROUP_LINK : process.env.TELEGRAM_LITERATURE_GROUP_LINK;
            res.json({ success: true, groupLink: groupLink, botLink: 'https://t.me/' + process.env.TELEGRAM_BOT_USERNAME + '?start=' + student.invoiceId });
        } else {
            res.json({ success: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Failed to check payment status' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
    try { require('./bot'); } catch (error) { console.error('❌ Bot failed to start — server running without bot:', error.message); }
});
