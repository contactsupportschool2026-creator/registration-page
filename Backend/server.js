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

console.log('DEBUG: chargily key set=', Boolean(process.env.CHARGILY_SECRET_KEY_2));
console.log('DEBUG: chargily key len=', (process.env.CHARGILY_SECRET_KEY_2 || '').length);

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
    console.log('Webhook signature verified');

    let payload;
    try { payload = JSON.parse(rawBody.toString('utf-8')); } catch (e) { return res.status(400).json({ error: 'Invalid JSON' }); }

    if (payload.status === 'paid') {
        const invoiceId = payload.id;
        if (!lockInvoice(invoiceId)) return res.status(200).send('OK');
        try {
            const snapshot = await withDB(db => {
                const idx = db.findIndex(s => s.invoiceId === invoiceId || s.renewalInvoiceId === invoiceId || (s.paymentHistory && s.paymentHistory.some(p => p.invoiceId === invoiceId)));
                if (idx !== -1 && (db[idx].status === 'pending' || db[idx].status === 'paid')) {
                    const now = new Date(), exp = new Date(now);
                    exp.setDate(exp.getDate() + 30);
                    const isRenewal = db[idx].status === 'paid';
                    db[idx].status = 'paid';
                    // Only set start date on FIRST payment — preserve on renewals
                    if (!db[idx].subscriptionStartDate) {
                        db[idx].subscriptionStartDate = now.toISOString();
                    }
                    db[idx].subscriptionEndDate = exp.toISOString();
                    db[idx].renewalCount = (db[idx].renewalCount || 0) + 1;
                    // Track each payment in paymentHistory
                    if (!db[idx].paymentHistory) db[idx].paymentHistory = [];
                    db[idx].paymentHistory.push({
                        date: now.toISOString(),
                        amount: 2000,
                        currency: 'DZD',
                        invoiceId: db[idx].invoiceId,
                        renewalNumber: db[idx].renewalCount
                    });
                    return { ...db[idx] };
                }
                return null;
            });
            if (snapshot) {
                const s = snapshot;
                const nizamiText = s.isNizami ? 'نظامٍ' : 'حف';
                const newExpiry = s.subscriptionEndDate ? s.subscriptionEndDate.split('T')[0] : 'N/A';
                const msg = '🟢 *ُمُى اواماى نالماى!*\n\n' +
                    '🥭 **الإكٍ:** ' + s.firstName + ' ' + s.lastName + '\n' +
                    '📧 **البكيام**
 ' + s.email + '\n' +
                    '📅 **بواريب الامصلواد:** ' + s.dob + '\n' +
                    '🏙️ **الاولاياة:** ' + s.wilaya + '\n' +
                    '📚 **الاشقوة:** ' + s.shaba + '\n' +
                    '🏫 **نوكية الاتكلوم:** ' + nizamiText + '\n' +
                    '🏫 **اسم الرانوية:** ' + s.schoolName + '\n\n' +
                    '👎 **الحالة:** مُفوف (2000 ُق)\n' +
                    '📆 **الاستراأ حتف:** ' + newExpiry + '\n' +
                    '💁 **فول التٌامدًاة:** ' + s.renewalCount;
                const sup = '\n\n_For any issues, contact: @' + process.env.TELEGRAM_SUPPORT_USERNAME + '_';
                await telegramNotify(msg + sup);
                console.log('Payment confirmed:', s.firstName, s.lastName);
            }
        } catch (error) { console.error('Webhook Error:', error.message); }
        finally { unlockInvoice(invoiceId); }
    }
    res.status(200).send('OK');
});

app.use(express.json());

app.get('/api/debug/env', (req, res) => {
    res.json({
        has_chargily_key: Boolean(process.env.CHARGILY_SECRET_KEY_2),
        key_length: (process.env.CHARGILY_SECRET_KEY_2 || '').length,
        key_prefix: (process.env.CHARGILY_SECRET_KEY_2 || '').slice(0, 8),
        frontend_url: process.env.FRONTEND_URL,
        backend_url: process.env.BACKEND_URL,
        has_telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN)
    });
});

app.post('/api/create-checkout', async (req, res) => {
    try {
        const { firstName, lastName, email, dob, wilaya, shaba, isNizami, schoolName } = req.body;
        const studentData = { firstName, lastName, email, dob, wilaya, shaba, isNizami, schoolName, status: 'pending', subscriptionStartDate: null, subscriptionEndDate: null, chatId: null, invoiceId: null, warnedTimestamp: null, linkSentTimestamp: null, renewalCount: 0 };
        const chargilyPayload = { amount: 2000, currency: 'dzd', payment_method: 'edahabia', success_url: process.env.FRONTEND_URL + '/payment.html', webhook_endpoint: process.env.BACKEND_URL + '/api/webhook/chargily', description: 'School Registration: ' + firstName + ' ' + lastName, metadata: { first_name: firstName, last_name: lastName, email, wilaya, shaba } };

        console.log('DEBUG: Creating chargily checkout', JSON.stringify(chargilyPayload));

        const chargilyResponse = await withRetry(
            () => axios.post('https://pay.chargily.net/api/v2/checkouts', chargilyPayload, {
                headers: { 'Authorization': 'Bearer ' + process.env.CHARGILY_SECRET_KEY_2, 'Content-Type': 'application/json' }
            }),
            { label: 'chargily:create-checkout' }
        );

        studentData.invoiceId = chargilyResponse.data.id;
        await withDB(db => db.push(studentData));
        await telegramNotify('🎹 *New Registration*\nName: ' + firstName + ' ' + lastName + '\nEmail: ' + email + '\nWilaya: ' + wilaya + '\nShaba: ' + shaba + '\nInvoice: ' + chargilyResponse.data.id);

        res.json({ checkoutUrl: chargilyResponse.data.checkout_url });

    } catch (error) {
        console.error('Checkout Error:', error.message);
        let errorMsg = error.message, errorStatus = 500;
        if (error.response) {
            errorStatus = error.response.status;
            console.error('Status:', errorStatus, 'Data:', JSON.stringify(error.response.data));
            if (error.response.data) {
                if (typeof error.response.data === 'string') errorMsg = error.response.data;
                else errorMsg = error.response.data.message || error.response.data.error || JSON.stringify(error.response.data);
            }
        }
        await telegramNotify('✌ *CHECKOUT FAILED*\nName: ' + firstName + ' ' + lastName + '\nEmail: ' + email + '\nError: ' + errorMsg + '\nStatus: ' + errorStatus);
        res.status(errorStatus).json({ error: errorMsg });
    }
});

app.get('/api/check-payment/:invoiceId', async (req, res) => {
    try {
        const db = await readDB();
        const student = db.find(s => s.invoiceId === req.params.invoiceId);
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

// Start the Telegram bot (polling + cron jobs)
require('./bot');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
