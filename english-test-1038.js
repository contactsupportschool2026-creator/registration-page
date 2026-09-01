let studentUsername = '';
let currentStep = 0;
let userAnswers = {
    1: { a: null, b: null, c: null }, // T/F
    2: { a: null, b: null, c: null }, // Ordering
    3: { a: "", b: "", c: "" }, // Text Answers
    4: { a: "", b: "" }, // References
    5: { a: "", b: "", c: "" } // Opposites
};

const quizData = [
    {
        type: 'tf-group',
        title: '1. Are the following statements true or false?',
        questions: [
            { id: '1a', text: 'a. Unethical behaviours are limited to one domain.' },
            { id: '1b', text: 'b. Unethical behaviours harm businesses only.' },
            { id: '1c', text: 'c. People do not cheat all the time.' }
        ]
    },
    {
        type: 'ordering',
        title: '2. Put the following ideas in the order they appear in the text:',
        items: [
            { id: '2a', text: 'A. Cheaters don’t feel they are dishonest.' },
            { id: '2b', text: 'B. Cheaters go beyond morals when cheating.' },
            { id: '2c', text: 'C. Ordinary people may have the desire to cheat.' }
        ]
    },
    {
        type: 'text-group',
        title: '3. Answer the following questions according to the text:',
        questions: [
            { id: '3a', text: 'a. Do the media today report all forms of cheating? Justify.' },
            { id: '3b', text: 'b. What dilemma do people face when confronting the opportunity to cheat?' },
            { id: '3c', text: 'c. How do cheaters justify their unethical behaviour?' }
        ]
    },
    {
        type: 'text-group',
        title: '4. WHAT or WHO do the underlined words in the text refer to?',
        questions: [
            { id: '4a', text: 'a. These behaviours (§2) ………' },
            { id: '4b', text: 'b. which (§3) ………' }
        ]
    },
    {
        type: 'text-group',
        title: '5. Find in the text words or phrases that are opposite in meaning to the following:',
        questions: [
            { id: '5a', text: 'a. more (§1) ≠ ………' },
            { id: '5b', text: 'b. cheap (§2) ≠ ………' },
            { id: '5c', text: 'c. abandon (§3) ≠ ………' }
        ]
    }
];

// DOM Elements
const startScreen = document.getElementById('start-screen');
const quizScreen = document.getElementById('quiz-screen');
const resultScreen = document.getElementById('result-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const usernameInput = document.getElementById('telegram-user');
const questionContent = document.getElementById('question-content');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const progressDots = document.querySelectorAll('.progress-dot');
const appContainer = document.querySelector('.app-container');

// Normalize text helper
function normalizeText(text) {
    if (!text) return "";
    return text.toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()@?\[\]]/g, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

// Keyword matcher for Text Answers
function containsKeywords(userText, keywords) {
    const normalizedUser = normalizeText(userText);
    let matches = 0;
    for (const kw of keywords) {
        if (normalizedUser.includes(normalizeText(kw))) {
            matches++;
        }
    }
    return matches >= Math.ceil(keywords.length / 2);
}

// Start Quiz Logic
startBtn.addEventListener('click', async () => {
    if(usernameInput.value.trim() === '') {
        alert('Please enter your Telegram username to start.');
        return;
    }
    
    studentUsername = usernameInput.value.trim();
    if (!studentUsername.startsWith('@')) {
        studentUsername = '@' + studentUsername;
    }

    startBtn.disabled = true;
    startBtn.textContent = 'Checking username...';

    try {
        const response = await fetch(`/api/check-username?username=${encodeURIComponent(studentUsername)}`);
        const data = await response.json();
        
        if (!data.valid) {
            alert('Username not found. Please make sure you clicked the bot link after payment to link your account.');
            startBtn.disabled = false;
            startBtn.textContent = 'Start Test';
            return;
        }
    } catch (error) {
        alert('Error connecting to the server. Please try again.');
        startBtn.disabled = false;
        startBtn.textContent = 'Start Test';
        return;
    }

    startBtn.disabled = false;
    startBtn.textContent = 'Start Test';
    startScreen.classList.remove('active');
    quizScreen.classList.add('active');
    renderQuestion();
});

// Render Question based on Step
function renderQuestion() {
    questionContent.style.animation = 'none';
    questionContent.offsetHeight; /* trigger reflow */
    questionContent.style.animation = 'slideIn 0.5s ease forwards';

    const stepData = quizData[currentStep];
    let html = `<div class="question-title">${stepData.title}</div>`;

    if (stepData.type === 'tf-group') {
        html += '<div style="display: flex; flex-direction: column; gap: 20px;">';
        stepData.questions.forEach(q => {
            html += `
                <div class="sub-question">
                    <p>${q.text}</p>
                    <div class="options-row">
                        <button class="option-btn ${userAnswers[1][q.id.slice(1)] === 'True' ? 'selected' : ''}" 
                                data-qid="${q.id}" data-value="True">True (T)</button>
                        <button class="option-btn ${userAnswers[1][q.id.slice(1)] === 'False' ? 'selected' : ''}" 
                                data-qid="${q.id}" data-value="False">False (F)</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    } 
    else if (stepData.type === 'ordering') {
        html += '<div style="display: flex; flex-direction: column; gap: 10px;">';
        stepData.items.forEach(item => {
            const currentOrder = userAnswers[2][item.id.slice(1)] || 0;
            html += `
                <div class="order-item">
                    <div class="order-circle" data-qid="${item.id}">${currentOrder === 0 ? '–' : currentOrder}</div>
                    <div class="order-text">${item.text}</div>
                </div>
            `;
        });
        html += '</div>';
    } 
    else if (stepData.type === 'text-group') {
        html += '<div style="display: flex; flex-direction: column; gap: 20px;">';
        stepData.questions.forEach(q => {
            html += `
                <div class="sub-question">
                    <p>${q.text}</p>
                    <textarea data-qid="${q.id}" rows="3" placeholder="Type your answer here...">${userAnswers[q.id.charAt(0)][q.id.slice(1)] || ''}</textarea>
                </div>
            `;
        });
        html += '</div>';
    } 

    questionContent.innerHTML = html;
    attachEventListeners();
    updateNavButtons();
}

// Attach listeners to newly rendered elements
function attachEventListeners() {
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const qid = e.target.getAttribute('data-qid');
            const value = e.target.getAttribute('data-value');
            
            if (qid.startsWith('1')) {
                const subId = qid.slice(1);
                userAnswers[1][subId] = value;
                const siblings = e.target.parentNode.querySelectorAll('.option-btn');
                siblings.forEach(s => s.classList.remove('selected'));
                e.target.classList.add('selected');
            }
        });
    });

    document.querySelectorAll('.order-circle').forEach(circle => {
        circle.addEventListener('click', (e) => {
            const qid = e.target.getAttribute('data-qid');
            const subId = qid.slice(1);
            let currentVal = userAnswers[2][subId] || 0;
            
            currentVal = (currentVal + 1) % 4;
            if (currentVal === 0) currentVal = 1;
            if(currentVal > 3) currentVal = 1;
            
            userAnswers[2][subId] = currentVal;
            e.target.textContent = currentVal;
        });
    });

    document.querySelectorAll('textarea').forEach(input => {
        input.addEventListener('input', (e) => {
            const qid = e.target.getAttribute('data-qid');
            const group = qid.charAt(0);
            const subId = qid.slice(1);
            userAnswers[group][subId] = e.target.value;
        });
    });
}

function updateNavButtons() {
    prevBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    
    if (currentStep === quizData.length - 1) {
        nextBtn.textContent = 'Finish Test';
    } else {
        nextBtn.textContent = 'Next';
    }

    progressDots.forEach((dot, index) => {
        dot.classList.toggle('active', index === currentStep);
    });
}

nextBtn.addEventListener('click', () => {
    if (currentStep < quizData.length - 1) {
        currentStep++;
        renderQuestion();
    } else {
        showResults();
    }
});

prevBtn.addEventListener('click', () => {
    if (currentStep > 0) {
        currentStep--;
        renderQuestion();
    }
});

// --- GRADING LOGIC ---
function calculateScore() {
    let scoreBreakdown = { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 };
    let bubbles = []; // true = green, false = red

    // Part 1 (3 items)
    if (userAnswers[1].a === 'False') { scoreBreakdown.p1++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[1].b === 'False') { scoreBreakdown.p1++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[1].c === 'True') { scoreBreakdown.p1++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 2 (3 items) -> C=1, B=2, A=3
    if (userAnswers[2].c === 1) { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].b === 2) { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].a === 3) { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 3 (3 items)
    if (containsKeywords(userAnswers[3].a, ['no', 'extreme cases', 'less attention', 'ordinary'])) { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[3].b, ['conflict', 'positive self-image', 'self-interest', 'crossing ethical boundaries'])) { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[3].c, ['cheat a little', 'reinterpreting', 'honest mistake'])) { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 4 (2 items)
    if (containsKeywords(userAnswers[4].a, ['stealing', 'employer', 'cheating on exams'])) { scoreBreakdown.p4++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[4].b, ['point'])) { scoreBreakdown.p4++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 5 (3 items)
    if (containsKeywords(userAnswers[5].a, ['less'])) { scoreBreakdown.p5++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[5].b, ['costly'])) { scoreBreakdown.p5++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[5].c, ['maintain'])) { scoreBreakdown.p5++; bubbles.push(true); } else { bubbles.push(false); }

    // Total raw score is out of 14
    const totalScore = scoreBreakdown.p1 + scoreBreakdown.p2 + scoreBreakdown.p3 + scoreBreakdown.p4 + scoreBreakdown.p5;
    return { totalScore, scoreBreakdown, bubbles };
}

// High-Quality Floating Bubbles Generator
function createBubbles(bubblesArray) {
    const bubbleContainer = document.createElement('div');
    bubbleContainer.className = 'bubble-container';
    
    bubblesArray.forEach(isCorrect => {
        const bubble = document.createElement('div');
        bubble.className = `floating-bubble ${isCorrect ? 'correct' : 'wrong'}`;
        bubble.style.marginLeft = `${Math.random() * 20 - 10}px`;
        bubbleContainer.appendChild(bubble);
    });

    appContainer.appendChild(bubbleContainer);
    
    setTimeout(() => {
        bubbleContainer.remove();
    }, 2000);
}

// Show Results Logic
function showResults() {
    quizScreen.classList.remove('active');
    resultScreen.classList.add('active');
    
    const { totalScore, scoreBreakdown, bubbles } = calculateScore();
    
    // Calculate score out of 100 (14 raw points)
    const percentageScore = ((totalScore / 14) * 100).toFixed(2);
    document.getElementById('final-score').textContent = `${percentageScore}/100`;
    
    const breakdownHTML = `
        <div class="breakdown-row">
            <span class="breakdown-label">Part 1: True/False (out of 3)</span>
            <span class="breakdown-score">${scoreBreakdown.p1}/3</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 2: Ordering (out of 3)</span>
            <span class="breakdown-score">${scoreBreakdown.p2}/3</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 3: Text Answers (out of 3)</span>
            <span class="breakdown-score">${scoreBreakdown.p3}/3</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 4: Reference Words (out of 2)</span>
            <span class="breakdown-score">${scoreBreakdown.p4}/2</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 5: Opposite Meanings (out of 3)</span>
            <span class="breakdown-score">${scoreBreakdown.p5}/3</span>
        </div>
    `;
    document.getElementById('score-breakdown').innerHTML = breakdownHTML;

    if(totalScore >= 10) {
        document.getElementById('result-message').textContent = 'Excellent work! You have a solid understanding of the text.';
    } else if(totalScore >= 6) {
        document.getElementById('result-message').textContent = 'Good effort! Keep practicing your reading skills.';
    } else {
        document.getElementById('result-message').textContent = 'Needs improvement. Review the text and try again!';
    }

    // Trigger animations
    setTimeout(() => {
        createBubbles(bubbles);
    }, 300);

    // Send to Telegram
    sendToTelegram(percentageScore);
}

// Telegram Integration Logic (uses backend API — no tokens exposed)
async function sendToTelegram(percentageScore) {
    const telegramStatus = document.getElementById('telegram-status');

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB');
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

    try {
        const response = await fetch('/api/send-quiz-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quizName: 'English Test 1038',
                username: studentUsername,
                score: percentageScore,
                date: dateStr,
                time: timeStr
            })
        });

        const data = await response.json();

        if (data.success) {
            telegramStatus.textContent = '✅ Score sent to your teacher successfully!';
            telegramStatus.style.color = 'green';
        } else {
            telegramStatus.textContent = '⚠️ Error sending score. Please inform your teacher.';
            telegramStatus.style.color = 'red';
        }
    } catch (error) {
        telegramStatus.textContent = '⚠️ Network error. Could not send score.';
        telegramStatus.style.color = 'red';
    }
}

// Restart Logic
restartBtn.addEventListener('click', () => {
    currentStep = 0;
    userAnswers = {
        1: { a: null, b: null, c: null },
        2: { a: null, b: null, c: null },
        3: { a: "", b: "", c: "" },
        4: { a: "", b: "" },
        5: { a: "", b: "", c: "" }
    };
    document.getElementById('telegram-status').textContent = 'Sending your score to your teacher...';
    document.getElementById('telegram-status').style.color = '#999';
    resultScreen.classList.remove('active');
    startScreen.classList.add('active');
});

// ==========================================
// DYNAMIC PDF GENERATION
// ==========================================
function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text("Test 1038 - Ordinary Unethical Behaviour Review", 105, 20, null, null, 'center');
    doc.setFontSize(12);
    doc.text(`Student: ${studentUsername}`, 14, 30);
    doc.text(`Score: ${document.getElementById('final-score').textContent} / 100`, 14, 40);
    
    let y = 50;
    const lineH = 7;
    
    const addQ = (qText, studentAns, correctAns) => {
        if(y > 270) { doc.addPage(); y = 20; }
        doc.setFont(undefined, 'bold');
        const qLines = doc.splitTextToSize(qText, 180);
        doc.text(qLines, 14, y); y += (qLines.length * lineH);
        
        doc.setFont(undefined, 'normal');
        const sLines = doc.splitTextToSize(`Your Answer: ${studentAns || 'N/A'}`, 180);
        doc.text(sLines, 20, y); y += (sLines.length * lineH);
        
        doc.setTextColor(0, 100, 0); // Dark green for correct answer
        const cLines = doc.splitTextToSize(`Correct Answer: ${correctAns}`, 180);
        doc.text(cLines, 20, y); y += (cLines.length * lineH);
        doc.setTextColor(0, 0, 0); // Reset color
        y += 4;
    };

    addQ("1a. Limited to one domain.", userAnswers[1].a, "False");
    addQ("1b. Harm businesses only.", userAnswers[1].b, "False");
    addQ("1c. People do not cheat all the time.", userAnswers[1].c, "True");
    addQ("2. Order of ideas (1, 2, 3)", `a:${userAnswers[2].a}, b:${userAnswers[2].b}, c:${userAnswers[2].c}`, "c:1, b:2, a:3 (C-B-A)");
    addQ("3a. Do media report all forms? Justify.", userAnswers[3].a, "No. The media focus on extreme cases, less attention is paid to ordinary unethical behaviour.");
    addQ("3b. What dilemma do people face?", userAnswers[3].b, "A conflict between their desire to maintain a positive self-image and to advance their self-interest crossing ethical boundaries.");
    addQ("3c. How do cheaters justify behaviour?", userAnswers[3].c, "They cheat a little, reinterpreting the unethical behaviour as an honest mistake.");
    addQ("4a. These behaviours (§2)", userAnswers[4].a, "Stealing from one's employer & cheating on exams");
    addQ("4b. which (§3)", userAnswers[4].b, "the point");
    addQ("5a. more ≠", userAnswers[5].a, "less");
    addQ("5b. cheap ≠", userAnswers[5].b, "costly");
    addQ("5c. abandon ≠", userAnswers[5].c, "maintain");

    doc.save("1038-Test-Review.pdf");
}

// ==========================================
// DICTIONARY MODAL LOGIC
// ==========================================
const dictBtn = document.getElementById('dict-btn');
const dictModalOverlay = document.getElementById('dict-modal-overlay');
const dictCloseBtn = document.getElementById('dict-close-btn');

// Open dictionary
if (dictBtn) {
    dictBtn.addEventListener('click', () => {
        dictModalOverlay.classList.add('active');
    });
}

// Close dictionary (clicking the X)
if (dictCloseBtn) {
    dictCloseBtn.addEventListener('click', () => {
        dictModalOverlay.classList.remove('active');
    });
}

// Close dictionary (clicking outside the box)
if (dictModalOverlay) {
    dictModalOverlay.addEventListener('click', (e) => {
        if (e.target === dictModalOverlay) {
            dictModalOverlay.classList.remove('active');
        }
    });
  }
