let studentUsername = '';
let currentStep = 0;
let userAnswers = {
    1: null, 
    2: { a: null, b: null, c: null, d: null }, 
    3: { a: "", b: "", c: "", d: "" }, 
    4: null, 
    5: { a: "", b: "" } 
};

const quizData = [
    {
        type: 'mcq-single',
        title: '1. Identify the type of the text.',
        options: ['a) an extract from a book', 'b) a speech.', 'c) a web article.']
    },
    {
        type: 'tf-group',
        title: '2. Say whether the following sentences are true or false.',
        questions: [
            { id: '2a', text: 'a- Business ethics is only about obeying the law.' },
            { id: '2b', text: 'b- Ethical businesses always put people and the environment first.' },
            { id: '2c', text: 'c- Companies that act unethically can lose public trust.' },
            { id: '2d', text: 'd- All successful companies are ethical.' }
        ]
    },
    {
        type: 'text-group',
        title: '3. Answer the following questions according to the text.',
        questions: [
            { id: '3a', text: 'a- What is business ethics?' },
            { id: '3b', text: 'b- How do ethical businesses treat workers?' },
            { id: '3c', text: 'c- What are some examples of unethical practices?' },
            { id: '3d', text: 'd- Why is it important for businesses to act ethically?' }
        ]
    },
    {
        type: 'mcq-single',
        title: '4. Choose the general idea of the text.',
        options: ['a- How businesses increase profits', 'b- Why competition is necessary for business', 'c- The importance of ethics in business']
    },
    {
        type: 'text-group',
        title: '5. Find what or who the underlined words in the text refer to.',
        questions: [
            { id: '5a', text: 'a) it (§1) ………' },
            { id: '5b', text: 'b) their (§2) ………' }
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
                    <button class="option-btn ${userAnswers[currentStep + 1] === opt ? 'selected' : ''}" 
                            data-qid="${currentStep + 1}" data-value="${opt}">${opt}</button>
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
            
            if (qid === '1' || qid === '4') {
                userAnswers[qid] = value;
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

    // Part 1 (1 item)
    if (userAnswers[1] === 'a) an extract from a book') { scoreBreakdown.p1++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 2 (4 items)
    if (userAnswers[2].a === 'False') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].b === 'True') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].c === 'True') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].d === 'False') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 3 (4 items)
    if (containsKeywords(userAnswers[3].a, ['study', 'right', 'wrong', 'commerce', 'responsibly'])) { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[3].b, ['fair wages', 'safe working conditions', 'impact'])) { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[3].c, ['false advertising', 'bribery', 'cheap labor', 'unsafe conditions'])) { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[3].d, ['trust', 'long-term success', 'society', 'economy'])) { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 4 (1 item)
    if (userAnswers[4] === 'c- The importance of ethics in business') { scoreBreakdown.p4++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 5 (2 items)
    if (containsKeywords(userAnswers[5].a, ['study', 'business ethics'])) { scoreBreakdown.p5++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[5].b, ['some companies', 'companies'])) { scoreBreakdown.p5++; bubbles.push(true); } else { bubbles.push(false); }

    // Total raw score is out of 12
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
    
    // Convert raw score (out of 12) to percentage out of 100
    const percentageScore = ((totalScore / 12) * 100).toFixed(2);
    document.getElementById('final-score').textContent = `${percentageScore}/100`;
    
    const breakdownHTML = `
        <div class="breakdown-row">
            <span class="breakdown-label">Part 1: Type of Text (out of 1)</span>
            <span class="breakdown-score">${scoreBreakdown.p1}/1</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 2: True/False (out of 4)</span>
            <span class="breakdown-score">${scoreBreakdown.p2}/4</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 3: Text Answers (out of 4)</span>
            <span class="breakdown-score">${scoreBreakdown.p3}/4</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 4: General Idea (out of 1)</span>
            <span class="breakdown-score">${scoreBreakdown.p4}/1</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 5: Reference Words (out of 2)</span>
            <span class="breakdown-score">${scoreBreakdown.p5}/2</span>
        </div>
    `;
    document.getElementById('score-breakdown').innerHTML = breakdownHTML;

    if(totalScore >= 8) {
        document.getElementById('result-message').textContent = 'Excellent work! You have a solid understanding of the text.';
    } else if(totalScore >= 5) {
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
                quizName: 'Business Ethics Test',
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
        3: { a: "", b: "", c: "", d: "" },
        4: null,
        5: { a: "", b: "" }
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
    doc.text("Test 1034 - Business Ethics Review", 105, 20, null, null, 'center');
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
        
        doc.setTextColor(0, 100, 0);
        const cLines = doc.splitTextToSize(`Correct Answer: ${correctAns}`, 180);
        doc.text(cLines, 20, y); y += (cLines.length * lineH);
        doc.setTextColor(0, 0, 0);
        y += 4;
    };

    addQ("1. Type of text:", userAnswers[1], "a) an extract from a book");
    addQ("2a. Ethics only about law.", userAnswers[2].a, "False");
    addQ("2b. Put people/environment first.", userAnswers[2].b, "True");
    addQ("2c. Unethical lose trust.", userAnswers[2].c, "True");
    addQ("2d. All successful are ethical.", userAnswers[2].d, "False");
    addQ("3a. What is business ethics?", userAnswers[3].a, "Study of right and wrong in commerce.");
    addQ("3b. Treat workers?", userAnswers[3].b, "Fair wages, safe working conditions.");
    addQ("3c. Unethical practices?", userAnswers[3].c, "False advertising, bribery, cheap labor.");
    addQ("3d. Why act ethically?", userAnswers[3].d, "Gain trust, build long-term success.");
    addQ("4. General idea", userAnswers[4], "c- The importance of ethics in business");
    addQ("5a. it (§1)", userAnswers[5].a, "the study of business ethics");
    addQ("5b. their (§2)", userAnswers[5].b, "some companies");

    doc.save("1034-Test-Review.pdf");
}
