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
        const doc    = new PDFDocument({ margin: 20, size: 'A4', layout: 'landscape' });
        const chunks = [];

        doc.on('data',  chunk => chunks.push(chunk));
        doc.on('end',   ()    => resolve(Buffer.concat(chunks)));
        doc.on('error', err   => reject(err));

        // Register and select the Arabic font
        doc.registerFont('NotoSans', font.regular);
        doc.registerFont('NotoSansBold', font.bold);
        const FONT_REG = 'NotoSans';
        const FONT_BLD = 'NotoSansBold';

        const MARGIN    = 20;
        const PAGE_W    = doc.page.width  - MARGIN * 2;
        const bold      = () => doc.font(FONT_BLD);
        const regular   = () => doc.font(FONT_REG);

        const now        = new Date();
        const exportDate = now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

        // ── Page header ──
        bold().fontSize(16).fillColor('#111')
              .text('Student Database Export', MARGIN, MARGIN, { align: 'center', width: PAGE_W });
        doc.moveDown(0.3);
        regular().fontSize(9).fillColor('#666')
                 .text(`Generated: ${exportDate}`, { align: 'center' });
        regular().text(`Total students: ${students.length}`, { align: 'center' });
        doc.fillColor('#111');
        doc.moveDown(1.2);

        // ── Column layout ──
        const cols = [
            { label: '#',        w: 24  },
            { label: 'Name',     w: 120 },
            { label: 'Invoice',  w: 100 },
            { label: 'Email',    w: 140 },
            { label: 'DOB',      w: 65  },
            { label: 'Wilaya',   w: 45  },
            { label: 'Specialty',w: 90  },
            { label: 'Sch. Type',w: 65  },
            { label: 'School',   w: 100 },
            { label: 'Status',   w: 55  },
            { label: 'Renewals', w: 55  },
            { label: 'Start',    w: 65  },
            { label: 'Expiry',   w: 65  },
            { label: 'Score',    w: 45  },
        ];

        const totalW = cols.reduce((s, c) => s + c.w, 0);
        // Scale if needed
        // Always scale to fit the page exactly
        const scale = PAGE_W / totalW;
        cols.forEach(c => c.w = Math.floor(c.w * scale));

        // Helper: draw header row
        const drawHeader = () => {
            const y = doc.y;
            let x = MARGIN;
            doc.rect(x, y, PAGE_W, 18).fill('#ddd');
            bold().fontSize(6.5).fillColor('#111');
            cols.forEach(col => {
                doc.text(col.label, x + 2, y + 3, { width: col.w - 4, align: 'center' });
                x += col.w;
            });
            doc.moveTo(MARGIN, y + 18).lineTo(MARGIN + PAGE_W, y + 18).lineWidth(1).strokeColor('#333').stroke().strokeColor('#000');
            doc.y = y + 20;
        };

        // Helper: draw one data row
        const drawRow = (data, rowNum) => {
            const rowH = 12;
            const y = doc.y;

            // Alternate row background
            if (rowNum % 2 === 0) {
                doc.rect(MARGIN, y, PAGE_W, rowH).fill('#f8f8f8');
            }

            let x = MARGIN;
            bold().fontSize(6.5).fillColor('#111');
            cols.forEach((col, ci) => {
                const text = safeText(data[ci]);
                // Truncate text to fit width
                let display = String(text);
                if (display.length > Math.floor(col.w / 5)) {
                    display = display.substring(0, Math.floor(col.w / 5) - 2) + '..';
                }
                doc.text(display, x + 2, y + 2, { width: col.w - 4, align: 'center' });
                x += col.w;
            });

            // Grid lines
            x = MARGIN;
            doc.lineWidth(0.3).strokeColor('#ccc');
            cols.forEach(col => {
                doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
                x += col.w;
            });
            doc.moveTo(x, y).lineTo(x, y + rowH).stroke();
            doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + PAGE_W, y + rowH).stroke();
            doc.strokeColor('#000');

            doc.y = y + rowH;
        };

        // ── Draw table ──
        drawHeader();

        students.forEach((s, i) => {
            // Page break if near bottom
            if (doc.y > doc.page.height - MARGIN - 40) {
                doc.addPage();
                drawHeader();
            }

            const nizamiText = s.isNizami ? 'Nizami / نظامي' : 'Free / حر';
            const renewals   = (s.renewalCount || 0);

            drawRow([
                i + 1,                                                // #
                `${safeText(s.firstName)} ${safeText(s.lastName)}`,   // Name
                s.invoiceId || 'N/A',                                 // Invoice
                s.email || 'N/A',                                     // Email
                s.dob || 'N/A',                                       // DOB
                s.wilaya || 'N/A',                                    // Wilaya
                s.shaba || 'N/A',                                     // Specialty
                nizamiText,                                           // School Type
                s.schoolName || 'N/A',                                // School
                s.status || 'N/A',                                    // Status
                renewals,                                             // Renewals
                formatDate(s.subscriptionStartDate),                  // Start
                formatDate(s.subscriptionEndDate),                    // Expiry
                s.score != null ? `${s.score}/100` : 'N/A',          // Score
            ], i);
        });

        doc.end();
    });
}

module.exports = { generateStudentsPDF };
