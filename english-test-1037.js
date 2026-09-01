let studentUsername = '';
let currentStep = 0;
let userAnswers = {
    1: null, // MCQ
    2: { a: null, b: null, c: null, d: null }, // T/F
    3: { a: null, b: null }, // Para Match
    4: { a: "", b: "", c: "" }, // Text Answers
    5: { a: "", b: "", c: "", d: "" }, // References
    6: { a: "", b: "", c: "" } // Opposites
};

const quizData = [
    {
        type: 'mcq-single',
        title: '1. Write the letter which correspond to the right answer.',
        options: ['a. The contributions of ancient civilizations to humanity', 'b. The common characteristics of ancient civilizations', 'c. The evolution of past civilizations']
    },
    {
        type: 'tf-group',
        title: '2. Are the following sentences “True” or “False”?',
        questions: [
            { id: '2a', text: 'a. Ancient civilizations had many similar properties although they were distant from each other.' },
            { id: '2b', text: 'b. Most of the past civilizations created great military forces.' },
            { id: '2c', text: 'c. Civilizations of the past didn’t give importance to external commercial exchanges.' },
            { id: '2d', text: 'd. Slavery was unacceptable in all ancient civilizations.' }
        ]
    },
    {
        type: 'para-match-group',
        title: '3. Identify the paragraph in which the following ideas are mentioned.',
        questions: [
            { id: '3a', text: 'a. People of ancient civilizations conducted wars against other countries to gain territories and power.' },
            { id: '3b', text: 'b. Most of the kings in ancient civilizations wanted stay eternally remembered.' }
        ],
        options: ['1', '2', '3', '4']
    },
    {
        type: 'text-group',
        title: '4. Answer the following questions according to the text.',
        questions: [
            { id: '4a', text: 'a. Was it important to establish discipline and rules to build a great nation in ancient time? Justify.' },
            { id: '4b', text: 'b. Why was social injustice practiced and admitted in the past civilizations?' },
            { id: '4c', text: 'c. What did the founders of ancient civilizations do to remain unforgettable?' }
        ]
    },
    {
        type: 'text-group',
        title: '5. Who/ what do the underlined words refer to in the text?',
        questions: [
            { id: '5a', text: 'a. them (§1) ………' },
            { id: '5b', text: 'b. they (§2) ………' },
            { id: '5c', text: 'c. which (§3) ………' },
            { id: '5d', text: 'd. their (§3) ………' }
        ]
    },
    {
        type: 'text-group',
        title: '6. Find in the text words that are opposite in meaning to the following.',
        questions: [
            { id: '6a', text: 'a. hides (§1) ≠ ………' },
            { id: '6b', text: 'b. weak (§2) ≠ ………' },
            { id: '6c', text: 'c. forbidden (§3) ≠ ………' }
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

    if (stepData.type === 'mcq-single') {
        html += `
            <div class="options-grid">
                ${stepData.options.map(opt => `
                    <button class="option-btn ${userAnswers[1] === opt ? 'selected' : ''}" 
                            data-qid="1" data-value="${opt}">${opt}</button>
                `).join('')}
            </div>
        `;
    } 
    else if (stepData.type === 'tf-group') {
        html += '<div style="display: flex; flex-direction: column; gap: 20px;">';
        stepData.questions.forEach(q => {
            html += `
                <div class="sub-question">
                    <p>${q.text}</p>
                    <div class="options-row">
                        <button class="option-btn ${userAnswers[2][q.id.slice(1)] === 'True' ? 'selected' : ''}" 
                                data-qid="${q.id}" data-value="True">True (T)</button>
                        <button class="option-btn ${userAnswers[2][q.id.slice(1)] === 'False' ? 'selected' : ''}" 
                                data-qid="${q.id}" data-value="False">False (F)</button>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    } 
    else if (stepData.type === 'para-match-group') {
        html += '<div style="display: flex; flex-direction: column; gap: 20px;">';
        stepData.questions.forEach(q => {
            html += `
                <div class="sub-question">
                    <p>${q.text}</p>
                    <div class="options-row">
                        ${stepData.options.map(opt => `
                            <button class="option-btn ${userAnswers[3][q.id.slice(1)] === opt ? 'selected' : ''}" 
                                    data-qid="${q.id}" data-value="${opt}">P${opt}</button>
                        `).join('')}
                    </div>
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
            
            if (qid === '1') {
                userAnswers[1] = value;
                const siblings = e.target.parentNode.querySelectorAll('.option-btn');
                siblings.forEach(s => s.classList.remove('selected'));
                e.target.classList.add('selected');
            } 
            else if (qid.startsWith('2')) {
                const subId = qid.slice(1);
                userAnswers[2][subId] = value;
                const siblings = e.target.parentNode.querySelectorAll('.option-btn');
                siblings.forEach(s => s.classList.remove('selected'));
                e.target.classList.add('selected');
            }
            else if (qid.startsWith('3')) {
                const subId = qid.slice(1);
                userAnswers[3][subId] = value;
                const siblings = e.target.parentNode.querySelectorAll('.option-btn');
                siblings.forEach(s => s.classList.remove('selected'));
                e.target.classList.add('selected');
            }
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
    let scoreBreakdown = { p1: 0, p2: 0, p3: 0, p4: 0, p5: 0, p6: 0 };
    let bubbles = []; // true = green, false = red

    // Part 1 (1 item)
    if (userAnswers[1] === 'b. The common characteristics of ancient civilizations') { scoreBreakdown.p1++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 2 (4 items)
    if (userAnswers[2].a === 'True') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].b === 'True') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].c === 'False') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].d === 'False') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 3 (2 items)
    if (userAnswers[3].a === '3') { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[3].b === '4') { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 4 (3 items)
    if (containsKeywords(userAnswers[4].a, ['yes', 'powerful state', 'order', 'law', 'prosperous'])) { scoreBreakdown.p4++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[4].b, ['natural order', 'no solution', 'possible', 'reality'])) { scoreBreakdown.p4++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[4].c, ['immense efforts', 'erection', 'gigantic constructions', 'perpetuate', 'immortalise'])) { scoreBreakdown.p4++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 5 (4 items)
    if (containsKeywords(userAnswers[5].a, ['civilizations', 'past', 'ancient'])) { scoreBreakdown.p5++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[5].b, ['egyptians', 'chinese', 'babylonians', 'incas', 'greeks'])) { scoreBreakdown.p5++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[5].c, ['erection', 'gigantic constructions'])) { scoreBreakdown.p5++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[5].d, ['rulers'])) { scoreBreakdown.p5++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 6 (3 items)
    if (containsKeywords(userAnswers[6].a, ['uncover', 'reveals'])) { scoreBreakdown.p6++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[6].b, ['powerful'])) { scoreBreakdown.p6++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[6].c, ['legalised', 'legalized'])) { scoreBreakdown.p6++; bubbles.push(true); } else { bubbles.push(false); }

    // Total raw score is out of 17
    const totalScore = scoreBreakdown.p1 + scoreBreakdown.p2 + scoreBreakdown.p3 + scoreBreakdown.p4 + scoreBreakdown.p5 + scoreBreakdown.p6;
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
    
    // Calculate score out of 100 (17 raw points)
    const percentageScore = ((totalScore / 17) * 100).toFixed(2);
    document.getElementById('final-score').textContent = `${percentageScore}/100`;
    
    const breakdownHTML = `
        <div class="breakdown-row">
            <span class="breakdown-label">Part 1: Main Idea (out of 1)</span>
            <span class="breakdown-score">${scoreBreakdown.p1}/1</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 2: True/False (out of 4)</span>
            <span class="breakdown-score">${scoreBreakdown.p2}/4</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 3: Paragraph Match (out of 2)</span>
            <span class="breakdown-score">${scoreBreakdown.p3}/2</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 4: Text Answers (out of 3)</span>
            <span class="breakdown-score">${scoreBreakdown.p4}/3</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 5: Reference Words (out of 4)</span>
            <span class="breakdown-score">${scoreBreakdown.p5}/4</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 6: Opposite Meanings (out of 3)</span>
            <span class="breakdown-score">${scoreBreakdown.p6}/3</span>
        </div>
    `;
    document.getElementById('score-breakdown').innerHTML = breakdownHTML;

    if(totalScore >= 12) {
        document.getElementById('result-message').textContent = 'Excellent work! You have a solid understanding of the text.';
    } else if(totalScore >= 8) {
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
                quizName: 'English Test 1037',
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
        1: null,
        2: { a: null, b: null, c: null, d: null },
        3: { a: null, b: null },
        4: { a: "", b: "", c: "" },
        5: { a: "", b: "", c: "", d: "" },
        6: { a: "", b: "", c: "" }
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
    doc.text("Test 1037 - Ancient Civilizations Review", 105, 20, null, null, 'center');
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

    addQ("1. Text is about", userAnswers[1], "b. The common characteristics of ancient civilizations");
    addQ("2a. Similar properties despite distance.", userAnswers[2].a, "True");
    addQ("2b. Created great military forces.", userAnswers[2].b, "True");
    addQ("2c. Didn't give importance to external exchanges.", userAnswers[2].c, "False. Correction: The other element... was the development of trade... involving foreign communities.");
    addQ("2d. Slavery was unacceptable.", userAnswers[2].d, "False. Correction: The civilizations of the past made slavery a practice that was not only tolerated but also legalised.");
    addQ("3a. Conducted wars for territories.", userAnswers[3].a, "Paragraph 3");
    addQ("3b. Kings wanted to stay remembered.", userAnswers[3].b, "Paragraph 4");
    addQ("4a. Important to establish discipline/rules? Justify.", userAnswers[4].a, "Yes. None of them succeeded to become prosperous until they had laid the basis for the existence of a powerful state that imposed order and law.");
    addQ("4b. Why was social injustice practiced?", userAnswers[4].b, "It was often considered as a reality belonging to the natural order of things against no solution was possible.");
    addQ("4c. What did founders do to remain unforgettable?", userAnswers[4].c, "Immense efforts were devoted for the erection of gigantic constructions to perpetuate the memory and the glory of the rulers.");
    addQ("5a. them (§1)", userAnswers[5].a, "the civilizations of the past / ancient civilizations");
    addQ("5b. they (§2)", userAnswers[5].b, "the Egyptians, the Chinese, the Babylonians, the Incas and the Greeks");
    addQ("5c. which (§3)", userAnswers[5].c, "the erection of gigantic constructions");
    addQ("5d. their (§3)", userAnswers[5].d, "the rulers");
    addQ("6a. hides ≠", userAnswers[6].a, "uncover / reveals");
    addQ("6b. weak ≠", userAnswers[6].b, "powerful");
    addQ("6c. forbidden ≠", userAnswers[6].c, "legalised");

    doc.save("1037-Test-Review.pdf");
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
