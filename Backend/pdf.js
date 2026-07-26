// pdf.js — PDF generation utilities for the student bot
// No external dependencies needed beyond pdfkit

let pdfkit;
try { pdfkit = require('pdfkit'); } catch (_) {
    try { pdfkit = require('pdfkit-table'); } catch (__) { pdfkit = null; }
}

/**
 * Generate a PDF for a SINGLE student
 * @param {Object} student — { firstName, lastName, invoiceId, status, ... }
 * @returns {Buffer}
 */
async function generateStudentPDF(student) {
    const PDFDocument = pdfkit;
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    const done = new Promise(resolve => doc.on('end', resolve));

    const name = `${student.firstName || ''} ${student.lastName || ''}`.trim();

    // ── Header ──
    doc.fontSize(22).font('Helvetica-Bold').text(name, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica').fillColor('#666666').text(`Invoice: ${student.invoiceId}`, { align: 'center' });
    doc.moveDown(0.5);

    // ── Status badge ──
    const statusColor = {
        paid:    '#22c55e',
        pending: '#f59e0b',
        warned:  '#ef4444',
        kicked:  '#6b7280',
    };
    doc.fontSize(14).font('Helvetica-Bold').fillColor(statusColor[student.status] || '#333')
       .text(student.status ? student.status.toUpperCase() : 'N/A', { align: 'center' });
    doc.moveDown(0.3);
    doc.fillColor('#333');

    // ── Separator ──
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.5);

    // ── Details table ──
    const subEnd = student.subscriptionEndDate ? student.subscriptionEndDate.split('T')[0] : '—';
    const scoreText = student.score != null ? `${student.score}/100` : '—';

    const fields = [
        ['First Name', student.firstName || '—'],
        ['Last Name',  student.lastName || '—'],
        ['Invoice ID', student.invoiceId || '—'],
        ['Status',     student.status || '—'],
        ['Score',      scoreText],
        ['Expires',    subEnd],
        ['Wilaya',     student.wilaya || '—'],
        ['Specialty',  student.specialty || '—'],
        ['School',     student.school || '—'],
        ['Phone',      student.phone || '—'],
        ['Telegram',   student.telegramUsername ? '@' + student.telegramUsername : '—'],
        ['Email',      student.email || '—'],
        ['Year',       student.year || '—'],
    ];

    const colX = [40, 180];
    const rowH = 22;

    fields.forEach(([label, value], i) => {
        if (i % 2 === 0) {
            doc.rect(colX[0], doc.y - 3, 515, rowH).fillColor('#f9fafb').fill();
        }
        doc.fillColor('#6b7280').font('Helvetica').fontSize(10)
           .text(label, colX[0], doc.y + 4);
        doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11)
           .text(String(value), colX[1], doc.y - 14, { width: 335 });
        doc.moveDown(0.3);
    });

    // ── Footer ──
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#9ca3af')
       .text(`Generated: ${new Date().toISOString().split('T')[0]}`, { align: 'center' });

    doc.end();
    await done;
    return Buffer.concat(chunks);
}

/**
 * Generate a PDF for ALL students (summary table)
 * @param {Array} db — array of student objects
 * @returns {Buffer}
 */
async function generateStudentsPDF(db) {
    const PDFDocument = pdfkit;
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    const done = new Promise(resolve => doc.on('end', resolve));

    // ── Title ──
    doc.fontSize(18).font('Helvetica-Bold').text('Student Database Export', { align: 'center' });
    doc.fontSize(10).font('Helvetica').fillColor('#6b7280')
       .text(`${db.length} student(s) — ${new Date().toISOString().split('T')[0]}`, { align: 'center' });
    doc.moveDown(0.8);

    // ── Table header ──
    const cols = [
        { label: '#',    x: 30,  w: 25 },
        { label: 'Name', x: 55,  w: 120 },
        { label: 'Invoice', x: 175, w: 90 },
        { label: 'Status',  x: 265, w: 55 },
        { label: 'Score',   x: 320, w: 45 },
        { label: 'Expires', x: 365, w: 70 },
        { label: 'Wilaya',  x: 435, w: 70 },
        { label: 'Specialty', x: 505, w: 100 },
        { label: 'School', x: 605, w: 100 },
        { label: 'Phone',  x: 705, w: 90 },
    ];
    const rowH = 20;
    const headerY = doc.y;

    // Header background
    doc.rect(30, headerY, 765, rowH).fillColor('#374151').fill();
    cols.forEach(col => {
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
           .text(col.label, col.x + 2, headerY + 6, { width: col.w - 4, align: 'left' });
    });

    let y = headerY + rowH;

    // ── Rows ──
    db.forEach((s, i) => {
        const name = `${s.firstName || ''} ${s.lastName || ''}`.trim();

        // Page break if near bottom
        if (y > 530) {
            doc.addPage();
            y = 30;
            // Reprint header
            doc.rect(30, y, 765, rowH).fillColor('#374151').fill();
            cols.forEach(col => {
                doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8)
                   .text(col.label, col.x + 2, y + 6, { width: col.w - 4, align: 'left' });
            });
            y += rowH;
        }

        // Row stripe
        if (i % 2 === 0) {
            doc.rect(30, y, 765, rowH).fillColor('#f9fafb').fill();
        }

        const statusColors = { paid: '#22c55e', pending: '#f59e0b', warned: '#ef4444', kicked: '#6b7280' };
        const rowData = [
            String(i + 1),
            name,
            s.invoiceId || '—',
            s.status || '—',
            s.score != null ? `${s.score}/100` : '—',
            s.subscriptionEndDate ? s.subscriptionEndDate.split('T')[0] : '—',
            s.wilaya || '—',
            s.specialty || '—',
            s.school || '—',
            s.phone || '—',
        ];

        cols.forEach((col, ci) => {
            const val = rowData[ci] || '—';
            const isStatus = ci === 3;
            doc.fillColor(isStatus ? (statusColors[s.status] || '#333') : '#111827')
               .font(isStatus ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
               .text(val, col.x + 2, y + 6, { width: col.w - 4, align: 'left' });
        });

        y += rowH;
    });

    // ── Footer ──
    if (y > 520) { doc.addPage(); y = 30; }
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#9ca3af').font('Helvetica')
       .text(`Generated: ${new Date().toISOString()} — ${db.length} students`, { align: 'center' });

    doc.end();
    await done;
    return Buffer.concat(chunks);
}

module.exports = { generateStudentPDF, generateStudentsPDF };
