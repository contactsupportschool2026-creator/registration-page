/**
 * pdf.js — Generate a student database export PDF as an in-memory Buffer.
 *
 * Downloads Noto Sans Arabic from Google Fonts at first use (cached in-memory
 * for the process lifetime), then embeds it into every PDF for full Unicode
 * support.  No system fonts required — works on any Railway / container env.
 *
 * Usage:
 *   const { generateStudentsPDF } = require('./pdf');
 *   const buf = await generateStudentsPDF(students);
 *   // buf is a Buffer — pass to bot.sendDocument()
 */

const PDFDocument = require('pdfkit');
const https       = require('https');
const http        = require('http');

// ── Font download with in-memory cache ────────────────────────────────────────

let _fontCache = null;   // { regular: Buffer, bold: Buffer }  or null

const FONT_URL_REGULAR = 'https://github.com/google/fonts/raw/main/ofl/notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf';
const FONT_URL_BOLD    = FONT_URL_REGULAR;  // pdfkit can fake-bold from the same font

/** Download a URL and return a Buffer (follows redirects). */
function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        const mod = url.startsWith('https') ? https : http;
        mod.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return downloadBuffer(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`Font download failed: HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', reject);
        }).on('error', reject);
    });
}

async function getFont() {
    if (_fontCache) return _fontCache;

    console.log('[pdf] Downloading Noto Sans Arabic font...');
    const buf = await downloadBuffer(FONT_URL_REGULAR);
    _fontCache = { regular: buf, bold: buf };
    console.log(`[pdf] Font downloaded — ${buf.length} bytes`);
    return _fontCache;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeText(value) {
    if (value === null || value === undefined) return 'N/A';
    return String(value);
}

function formatDate(iso) {
    if (!iso) return 'N/A';
    return iso.split('T')[0];
}

// ── Main export ───────────────────────────────────────────────────────────────

async function generateStudentsPDF(students) {
    const font = await getFont();

    return new Promise((resolve, reject) => {
        const doc    = new PDFDocument({ margin: 45, size: 'A4' });
        const chunks = [];

        doc.on('data',  chunk => chunks.push(chunk));
        doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
        doc.on('error', err   => reject(err));

        // Register and select the Arabic font
        doc.registerFont('NotoSans', font.regular);
        doc.registerFont('NotoSansBold', font.bold);
        const FONT_REG = 'NotoSans';
        const FONT_BLD = 'NotoSansBold';

        const MARGIN    = 45;
        const PAGE_W    = doc.page.width  - MARGIN * 2;
        const LABEL_W   = 115;
        const VALUE_X   = MARGIN + LABEL_W + 8;
        const VALUE_W   = PAGE_W - LABEL_W - 8;

        const now        = new Date();
        const exportDate = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

        const bold    = () => doc.font(FONT_BLD);
        const regular = () => doc.font(FONT_REG);

        const rule = (color = '#cccccc', width = 0.5) => {
            doc.moveTo(MARGIN, doc.y)
               .lineTo(MARGIN + PAGE_W, doc.y)
               .lineWidth(width)
               .strokeColor(color)
               .stroke()
               .strokeColor('#000000');
        };

        const row = (label, value) => {
            const y = doc.y;
            bold().fontSize(9).fillColor('#555555')
                  .text(label + ':', MARGIN, y, { width: LABEL_W, lineBreak: false });
            regular().fontSize(9).fillColor('#111111')
                     .text(safeText(value), VALUE_X, y, { width: VALUE_W });
            doc.moveDown(0.15);
        };

        // ── Page header ──────────────────────────────────────────────────────
        bold().fontSize(18).fillColor('#111111')
              .text('Student Database Export', MARGIN, MARGIN, { align: 'center', width: PAGE_W });
        doc.moveDown(0.4);

        regular().fontSize(10).fillColor('#666666')
                 .text(`Generated: ${exportDate}`, { align: 'center' });
        doc.text(`Total students: ${students.length}`, { align: 'center' });
        doc.fillColor('#111111').moveDown(0.8);

        rule('#333333', 1.5);
        doc.moveDown(0.8);

        // ── Student blocks ───────────────────────────────────────────────────
        students.forEach((s, i) => {
            const renewals = s.renewalCount || 0;
            const months   = renewals === 1 ? '1 month' : `${renewals} months`;
            const nizami   = s.isNizami ? 'Nizami / نظامي' : 'Free / حر';

            if (doc.y > doc.page.height - MARGIN - 180) {
                doc.addPage();
                doc.y = MARGIN;
            }

            bold().fontSize(12).fillColor('#000000')
                  .text(`${i + 1}. ${safeText(s.firstName)} ${safeText(s.lastName)}`, MARGIN, doc.y);
            doc.moveDown(0.35);

            row('Invoice ID',    s.invoiceId);
            row('Email',         s.email);
            row('Date of Birth', s.dob);
            row('Wilaya',        s.wilaya);
            row('Specialty',     s.shaba);
            row('School Type',   nizami);
            row('School Name',   s.schoolName);
            doc.moveDown(0.1);

            row('Status',        s.status);
            row('Months Paid',   months);
            row('Sub. Start',    formatDate(s.subscriptionStartDate));
            row('Sub. Expiry',   formatDate(s.subscriptionEndDate));
            doc.moveDown(0.1);

            row('Telegram ID',   s.chatId || 'Not linked');
            doc.moveDown(0.5);

            if (i < students.length - 1) {
                rule('#cccccc', 0.5);
                doc.moveDown(0.6);
            }
        });

        doc.end();
    });
}

module.exports = { generateStudentsPDF };
