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
        if (message) await telegramNotify('\uD83D\uDEA8 *FRONTEND ERROR* \n' + message);
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
                const idx = db.findIndex(s => s.invoiceId === invoiceId);
                if (idx !== -1 && db[idx].status === 'pending') {
                    const now = new Date(), exp = new Date(now);
                    exp.setDate(exp.getDate() + 30);
                    db[idx].status = 'paid';
                    db[idx].subscriptionStartDate = now.toISOString();
                    db[idx].subscriptionEndDate = exp.toISOString();
                    db[idx].renewalCount = (db[idx].renewalCount || 0) + 1;
                    return { ...db[idx] };
                } else if (idx !== -1 && db[idx].status === 'paid') {
                    console.warn('Invoice already paid:', invoiceId);
                }
                return null;
            });
            if (snapshot) {
                const s = snapshot;
                const nizamiText = s.isNizami ? '\u0646\u0638\u0627\u0645\u064A' : '\u062D\u0631';
                const newExpiry = s.subscriptionEndDate ? s.subscriptionEndDate.split('T')[0] : 'N/A';
                const msg = '\uD83D\uDFE2 *\u062F\u0641\u0639\u0629 \u062C\u062F\u064A\u062F\u0629 \u0646\u0627\u062C\u062D\u0629!*\n\n' +
                    '\uD83E\uDD50 **\u0627\u0644\u0625\u0633\u0645:** ' + s.firstName + ' ' + s.lastName + '\n' +
                    '\uD83D\uDCE7 **\u0627\u0644\u0628\u0631\u064A\u062F:** ' + s.email + '\n' +
                    '\uD83D\uDCC5 **\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0645\u064A\u0644\u0627\u062F:** ' + s.dob + '\n' +
                    '\uD83C\uDFD9\uFE0F **\u0627\u0644\u0648\u0644\u0627\u064A\u0629:** ' + s.wilaya + '\n' +
                    '\uD83D\uDCDA **\u0627\u0644\u0634\u0639\u0628\u0629:** ' + s.shaba + '\n' +
                    '\uD83C\uDFEB **\u0646\u0648\u0639\u064A\u0629 \u0627\u0644\u062A\u0639\u0644\u064A\u0645:** ' + nizamiText + '\n' +
                    '\uD83C\uDFEB **\u0627\u0633\u0645 \u0627\u0644\u062B\u0627\u0646\u0648\u064A\u0629:** ' + s.schoolName + '\n\n' +
                    '\uD83D\uDC8E **\u0627\u0644\u062D\u0627\u0644\u0629:** \u0645\u062F\u0641\u0648\u0639 (2000 \u062F\u062C)\n' +
                    '\uD83D\uDCC6 **\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u062D\u062A\u0649:** ' + newExpiry + '\n' +
                    '\uD83D\uDCC1 **\u0639\u0627\u062F \u0627\u0644\u062A\u062C\u062F\u064A\u062F\u0627\u062A:** ' + s.renewalCount;
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
        await telegramNotify('\uD83C\uDD95 *New Registration*\nName: ' + firstName + ' ' + lastName + '\nEmail: ' + email + '\nWilaya: ' + wilaya + '\nShaba: ' + shaba + '\nInvoice: ' + chargilyResponse.data.id);

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
        await telegramNotify('\u274C *CHECKOUT FAILED*\nName: ' + firstName + ' ' + lastName + '\nEmail: ' + email + '\nError: ' + errorMsg + '\nStatus: ' + errorStatus);
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
