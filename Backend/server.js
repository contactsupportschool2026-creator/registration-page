const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const crypto  = require('crypto');
require('dotenv').config();

const { initializeDB, readDB, withDB } = require('./db');
const { withRetry }                    = require('./retry');

const app = express();
app.use(cors());

// Initialize database file on startup
initializeDB();

// DEBUG: check env vars are loaded
console.log('DEBUG: chargily key set=', Boolean(process.env.CHARGILY_SECRET_KEY));
console.log('DEBUG: chargily key len=', (process.env.CHARGILY_SECRET_KEY || '').length);

// ============================================
// RACE CONDITION PREVENTION: Processing Lock
// ============================================
const processingInvoices = new Set();

function lockInvoice(invoiceId) {
    if (processingInvoices.has(invoiceId)) return false;
    processingInvoices.add(invoiceId);
    return true;
}

function unlockInvoice(invoiceId) {
    processingInvoices.delete(invoiceId);
}

// ============================================
// WEBHOOK SIGNATURE VERIFICATION HELPER
// ============================================
function verifyChargilySignature(rawBody, signature) {
    const hash = crypto
        .createHmac('sha256', process.env.CHARGILY_SECRET_KEY)
        .update(rawBody)
        .digest('hex');
    return hash === signature;
}

// ============================================
// ENDPOINT 2: CHARGILY WEBHOOK
// ============================================
app.post(
    '/api/webhook/chargily',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        const rawBody   = req.body;
        const signature = req.headers['signature'];

        if (!signature) {
            console.warn('⚠️ Webhook received without signature - REJECTED');
            return res.status(401).json({ error: 'Missing signature' });
        }

        if (!verifyChargilySignature(rawBody, signature)) {
            console.warn('⚠️ Webhook signature mismatch - REJECTED (possible attack)');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        console.log('✅ Webhook signature verified - processing payment');

        let payload;
        try {
            payload = JSON.parse(rawBody.toString('utf-8'));
        } catch (e) {
            console.error('❌ Webhook body is not valid JSON:', e.message);
            return res.status(400).json({ error: 'Invalid JSON body' });
        }

        if (payload.status === 'paid') {
            const invoiceId = payload.id;

            if (!lockInvoice(invoiceId)) {
                console.warn(`⚠️ Invoice ${invoiceId} already being processed - DUPLICATE REJECTED`);
                return res.status(200).send('OK');
            }

            try {
                const studentSnapshot = await withDB(db => {
                    const studentIndex = db.findIndex(s => s.invoiceId === invoiceId);

                    if (studentIndex !== -1 && db[studentIndex].status === 'pending') {
                        const now        = new Date();
                        const expiration = new Date(now);
                        expiration.setDate(expiration.getDate() + 30);

                        db[studentIndex].status                = 'paid';
                        db[studentIndex].subscriptionStartDate = now.toISOString();
                        db[studentIndex].subscriptionEndDate   = expiration.toISOString();
                        db[studentIndex].renewalCount = (db[studentIndex].renewalCount || 0) + 1;
                        return { ...db[studentIndex] };
                    } else if (studentIndex !== -1 && db[studentIndex].status === 'paid') {
                        console.warn(`⚠️ Invoice ${invoiceId} already marked as paid - DUPLICATE CONFIRMED`);
                    } else {
                        console.warn(`❌ Invoice ${invoiceId} not found in database `);
                    }
                    return null;
                });

                if (studentSnapshot) {
                    const s          = studentSnapshot;
                    const nizamiText = s.isNizami ? 'نظامي' : 'حر';
                    const newExpiry  = s.subscriptionEndDate ? s.subscriptionEndDate.split('T')[0] : 'N/A';

                    const message = `
🟢 *دفعة جديدة ناججة!*

🥐 **الإسم:** ${s.firstName} ${s.lastName}
📧 **البريد:** ${s.email}
📅 **تاريخ الميلاد:** ${s.dob}
🏙️ **الولاى)*ت:* ${s.wilaya}
📚 **الشعبة:** ${s.shaba}
🏫 **نوعية التعليم:** ${nizamiText}
🏫 **اسم الثانوية:** ${s.schoolName}

💎 **الحالة:** مدفوع (2000 دج)
📆 **الاشتراك حتى:** ${newExpiry}
📁 **عاد التجديدات:** ${s.renewalCount}
                    `;
                    const supportMention = `\n\n_For any issues, contact support: @{abderraoufbenakki}_`;

                    const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
                    await withRetry(() => axios.post(TELEGRAM_API, { chat_id: process.env.TELEGRAM_CHAT_ID, text: message + supportMention, parse_mode: 'Markdown' }, { timeout: 10_000 }), { label: 'telegram:webhook-notify' });

                    console.log(`✅ Payment confirmed: ${s.firstName} ${s.lastName}`);
                }
            } catch (error) {
                console.error('ʣ  Webhook Error:', error.message);
            } finally {
                unlockInvoice(invoiceId);
            }
        }
        res.status(200).send('OK');
    }
);

// Apply JSON parsing for all other routes
app.use(express.json());

// ============================================
// DEBUG ENDPOINT to check env vars
// ============================================
app.get('/api/debug/env', (req, res) => {
    res.json({
        has_chargily_key: Boolean(process.env.CHARGILY_SECRET_KEY),
        key_length: (process.env.CHARGILY_SECRET_KEY || '').length,
        key_prefix: (process.env.CHARGILY_SECRET_KEY || '').slice(0, 8),
        frontend_url: process.env.FRONTEND_URL,
        backend_url: process.env.BACKEND_URL,
        has_telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN)
    });
});

// ============================================
// ENDPOINT 1: CREATE CHARGILY CHECKOUT
// ============================================
app.post('/api/create-checkout', async (req, res) => {
    try {
        const { firstName, lastName, email, dob, wilaya, shaba, isNizami, schoolName } = req.body;

        const studentData = {
            firstName, lastName, email, dob, wilaya, shaba, isNizami, schoolName,
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
            description: `School Registration: ${firstName} ${lastName}`,
            client_name: `${firstName} ${lastName}`,
            client_email: email,
            back_url: `${process.env.FRONTEND_URL}/payment.html`,
            webhook_url: `${process.env.BACKEND_URL}/api/webhook/chargily`
        };

        console.log('DEBUG: Creating chargily checkout', JSON.stringify(chargilyPayload));

        const chargilyResponse = await withRetry(
            () => axios.post('https://pay.chargily.net/api/v2/checkouts', chargilyPayload, {
                headers: {
                    'Authorization': `Bearer ${process.env.CHARGILY_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }),
            { label: 'chargily:create-checkout' }
        );

        studentData.invoiceId = chargilyResponse.data.id;
        await withDB(db => { db.push(studentData); });

        res.json({ checkoutUrl: chargilyResponse.data.checkout_url });

    } catch (error) {
        console.error('�🔈 Checkout Error:');
        console.error('  Message:', error.message);
        if (error.response) {
            console.error('  Status:', error.response.status);
            console.error('  Data:', JSON.stringify(error.response.data));
            res.status(error.response.status).json({ error: error.response.data });
        } else if (error.request) {
            console.error('  No response received');
            if (error.code) console.error('  Code:', error.code);
            res.status(500).json({ error: 'No response from Chargily' });
        } else {
            res.status(500).json({ error: error.message });
        }
    }
});

// ============================================
// ENDPOINT 3: CHECK PAYMENT STATUS
// ============================================
app.get('/api/check-payment/:invoiceId', async (req, res) => {
    try {
        const db = await readDB();
        const student = db.find(s => s.invoiceId === req.params.invoiceId);
        if (student && student.status === 'paid') {
            res.json({ success: true, groupLink: process.env.TELEGRAM_GROUP_LINK, botLink: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${student.invoiceId}` });
        } else {
            res.json({ success: false });
        }
    } catch (error) {
        console.error('🔌 Check Payment Error:', error.message);
        res.status(500).json({ error: 'Failed to check payment status' });
    }
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));