const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const DB_PATH = path.join(__dirname, 'database.json');
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

// Helpers to read/write the database
const getDB = () => JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
const saveDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

// ==========================================
// ENDPOINT 1: CREATE CHARGILY CHECKOUT
// ==========================================
app.post('/api/create-checkout', async (req, res) => {
    try {
        // 1. Capture ALL data from the HTML form
        const { firstName, lastName, dob, wilaya, shaba, isNizami, schoolName } = req.body;

        // 2. Prepare student data for our database
        const studentData = {
            firstName,
            lastName,
            dob,
            wilaya,
            shaba,
            isNizami,
            schoolName,
            status: 'pending', // Statuses: pending, paid, warned, kicked
            subscriptionStartDate: null,
            subscriptionEndDate: null,
            chatId: null, // Will be saved when they click /start in Telegram
            invoiceId: null,
            warnedTimestamp: null
        };

        // 3. Create Checkout with Chargily Pay API
        const chargilyPayload = {
            amount: 2000, // 2000 DA
            currency: 'dzd',
            description: `School Registration: ${firstName} ${lastName}`,
            client_name: `${firstName} ${lastName}`,
            client_email: 'student@example.com', // Chargily requires an email field
            back_url: `${process.env.FRONTEND_URL}/payment.html`, // We will append invoice ID below
            webhook_url: `${process.env.BACKEND_URL}/api/webhook/chargily`
        };

        const chargilyResponse = await axios.post(
            'https://pay.chargily.com/api/v2/checkouts',
            chargilyPayload,
            {
                headers: {
                    'Authorization': `Bearer ${process.env.CHARGILY_SECRET_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // 4. Save Invoice ID to database and write to file
        studentData.invoiceId = chargilyResponse.data.id;
        const db = getDB();
        db.push(studentData);
        saveDB(db);

        // 5. Redirect user to checkout URL, appending the invoice ID so payment.html knows who they are
        const checkoutUrl = `${chargilyResponse.data.checkout_url}?invoice=${studentData.invoiceId}`;
        
        res.json({ checkoutUrl });

    } catch (error) {
        console.error("Checkout Error:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to create payment link' });
    }
});

// ==========================================
// ENDPOINT 2: CHARGILY WEBHOOK (Listens for payment success)
// ==========================================
app.post('/api/webhook/chargily', async (req, res) => {
    const eventData = req.body;
    
    // Check if the payment is successful
    if (eventData.status === 'paid') {
        const invoiceId = eventData.id;
        const db = getDB();
        
        // Find the student in our database.json
        const studentIndex = db.findIndex(s => s.invoiceId === invoiceId);
        
        if (studentIndex !== -1 && db[studentIndex].status === 'pending') {
            
            // 1. Update Student Status & Subscription Dates
            const now = new Date();
            db[studentIndex].status = 'paid';
            db[studentIndex].subscriptionStartDate = now.toISOString();
            
            // Set expiration to exactly 30 days from now
            const expiration = new Date(now);
            expiration.setDate(expiration.getDate() + 30);
            db[studentIndex].subscriptionEndDate = expiration.toISOString();
            
            saveDB(db);
            const s = db[studentIndex]; // Shortcut variable

            // 2. Format Telegram message with ALL requested form data
            const nizamiText = s.isNizami ? "نظامي" : "حر";
            const message = `
🟢 *دفعة جديدة ناجحة!*

👤 *الإسم:* ${s.firstName} ${s.lastName}
📅 *تاريخ الميلاد:* ${s.dob}
🏙️ *الولاية:* ${s.wilaya}
📚 *الشعبة:* ${s.shaba}
🏫 *نوعية التعليم:* ${nizamiText}
🏫 *اسم الثانوية:* ${s.schoolName}

💎 *الحالة:* مدفوع (2000 دج)
            `;
            
            const supportMention = `\n\n_For any issues, contact support: @${process.env.TELEGRAM_SUPPORT_USERNAME}_`;

            // 3. Send to your personal Telegram
            await axios.post(TELEGRAM_API, {
                chat_id: process.env.TELEGRAM_CHAT_ID,
                text: message + supportMention,
                parse_mode: 'Markdown'
            });

            console.log(`Payment confirmed and Telegram notified for ${s.firstName} ${s.lastName}`);
        }
    }
    
    // Always respond with 200 OK to Chargily so they know we received it
    res.status(200).send('OK');
});

// ==========================================
// ENDPOINT 3: CHECK PAYMENT STATUS (Used by payment.html)
// ==========================================
app.get('/api/check-payment/:invoiceId', (req, res) => {
    const db = getDB();
    const student = db.find(s => s.invoiceId === req.params.invoiceId);
    
    if (student && student.status === 'paid') {
        // Return everything payment.html needs to show the 2-step buttons
        res.json({ 
            success: true, 
            groupLink: process.env.TELEGRAM_GROUP_LINK,
            botLink: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${student.invoiceId}`
        });
    } else {
        res.json({ success: false });
    }
});

// START SERVER
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
