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

function telegramNotify(text) {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) return;
    const TELEGRAM_API = 'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/sendMessage';
    return axios.post(TELEGRAM_API, {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: 'Markdown'
    }, { timeout: 10000 }).catch(e => console.error('Telegram notify failed:', e.message));
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
                    if (!db.students[idx].subscriptionStartDate) {
                        db.students[idx].subscriptionStartDate = now.toISOString();
                    }
                    db.students[idx].subscriptionEndDate = exp.toISOString();
                    db.students[idx].renewalCount = (db.students[idx].renewalCount || 0) + 1;
                    if (!db.students[idx].paymentHistory) db.students[idx].paymentHistory = [];
                    db.students[idx].paymentHistory.push({
                        date: now.toISOString(),
                        amount: 2000,
                        currency: 'DZD',
                        invoiceId: db.students[idx].invoiceId,
                        renewalNumber: db.students[idx].renewalCount
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

// ==========================================
// API: Check Username
// ==========================================
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

// ==========================================
// API: Get Assigned Test for a student
// ==========================================
app.get('/api/get-assigned-test', async (req, res) => {
    try {
        const requestedUsername = (req.query.username || '').toLowerCase().replace('@', '').trim();
        if (!requestedUsername) {
            return res.json({ valid: false, message: 'Username is required' });
        }

        const db = await readDB();
        const students = db.students || [];
        const activeTests = db.activeTests || {};

        const student = students.find(s => 
            s.username && s.username.toLowerCase().replace('@', '') === requestedUsername
        );

        if (!student) {
            return res.json({ valid: false, message: 'Username not found. Make sure your account is registered and you joined the bot.' });
        }

        // Determine group from shaba (Specialty)
        const scientificShabas = [
            'sciences expérimentales',
            'mathématiques',
            'technique mathématiques',
            'technique sciences expérimentales',
            'informatique',
            'maths',
            'math',
            'science',
            'sciences'
        ];

        const shaba = (student.shaba || '').toLowerCase();
        const group = scientificShabas.includes(shaba) ? 'scientific' : 'literature';

        const testId = activeTests[group] || null;

        if (!testId) {
            return res.json({ 
                valid: true, 
                active: false, 
                group,
                message: `There is no active test at the moment for the ${group} group.` 
            });
        }

        res.json({ 
            valid: true, 
            active: true, 
            testId, 
            group 
        });

    } catch (error) {
        console.error('Get Assigned Test Error:', error.message);
        res.status(500).json({ valid: false, message: 'Server error' });
    }
});

// ==========================================
// API: Send Quiz Result to Telegram
// ==========================================
app.post('/api/send-quiz-result', async (req, res) => {
    try {
        const { quizName, username, score } = req.body;
        if (!quizName || !username || score === undefined) {
            return res.status(400).json({ success: false, error: 'Missing fields' });
        }

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

app.get('/api/debug/env', (req, res) => {
    res.json({
        has_chargily_key: Boolean(process.env.CHARGILY_SECRET_KEY_2),
        frontend_url: process.env.FRONTEND_URL,
        backend_url: process.env.BACKEND_URL,
        has_telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN)
    });
});

app.post('/api/create-checkout', async (req, res) => {
    try {
        const { fullName, telegramUsername, dob, wilaya, shaba, isNizami, schoolName, email } = req.body;
        
        let formattedUsername = telegramUsername.trim();
        if (!formattedUsername.startsWith('@')) {
            formattedUsername = '@' + formattedUsername;
        }

        const studentData = { 
            fullName, 
            email: email || 'student@example.com',
            username: formattedUsername, 
            dob, 
            wilaya, 
            shaba, 
            isNizami, 
            schoolName, 
            status: 'pending', 
            subscriptionStartDate: null, 
            subscriptionEndDate: null, 
            chatId: null, 
            invoiceId: null, 
            warnedTimestamp: null, 
            linkSentTimestamp: null, 
            renewalCount: 0 
        };
        
        const chargilyPayload = { 
            amount: 2000, 
            currency: 'dzd', 
            payment_method: 'edahabia', 
            success_url: process.env.FRONTEND_URL + '/payment.html', 
            webhook_endpoint: process.env.BACKEND_URL + '/api/webhook/chargily', 
            description: 'School Registration: ' + fullName, 
            metadata: { full_name: fullName, telegram: formattedUsername, wilaya, shaba } 
        };

        const chargilyResponse = await withRetry(
            () => axios.post('https://pay.chargily.net/api/v2/checkouts', chargilyPayload, {
                headers: { 'Authorization': 'Bearer ' + process.env.CHARGILY_SECRET_KEY_2, 'Content-Type': 'application/json' }
            }),
            { label: 'chargily:create-checkout' }
        );

        studentData.invoiceId = chargilyResponse.data.id;
        
        await withDB(db => {
            if (!db.students) db.students = [];
            db.students.push(studentData);
        });
        
        await telegramNotify('*New Registration*\nName: ' + fullName + '\nTelegram: ' + formattedUsername + '\nWilaya: ' + wilaya + '\nShaba: ' + shaba + '\nInvoice: ' + chargilyResponse.data.id);

        res.json({ checkoutUrl: chargilyResponse.data.checkout_url });
            
    } catch (error) {
        console.error('Checkout Error:', error.message);
        let errorMsg = error.message, errorStatus = 500;
        if (error.response) {
            errorStatus = error.response.status;
            if (error.response.data) {
                errorMsg = typeof error.response.data === 'string' ? error.response.data : (error.response.data.message || JSON.stringify(error.response.data));
            }
        }
        await telegramNotify('❌ *CHECKOUT FAILED*\nError: ' + errorMsg + '\nStatus: ' + errorStatus);
        res.status(errorStatus).json({ error: errorMsg });
    }
});

app.get('/api/check-payment/:invoiceId', async (req, res) => {
    try {
        const db = await readDB();
        const students = db.students || [];
        const student = students.find(s => s.invoiceId === req.params.invoiceId);
        if (student && student.status === 'paid') {
            res.json({ success: true, groupLink: process.env.TELEGRAM_GROUP_LINK, botLink: 'https://t.me/' + process.env.TELEGRAM_BOT_USERNAME + '?start=' + student.invoiceId });
        } else {
            res.json({ success: false });
        }
    } catch (error) {
        console.error('Check Payment Error:', error.message);
        res.status(500).json({ error: 'Failed to check payment status' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
    try {
        require('./bot');
    } catch (error) {
        console.error('❌ Bot failed to start — server running without bot:', error.message);
    }
});
