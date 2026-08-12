let studentUsername = '';
let currentStep = 0;
let userAnswers = {
    1: null, 
    2: { a: null, b: null, c: null, d: null }, 
    3: { a: "", b: "", c: "" }, 
    4: { a: null, b: null }, 
    5: { a: "", b: "" } 
};

const quizData = [
    {
        type: 'mcq-single',
        title: '1- The text is a taken from : (0,5 pt)',
        options: ['a: a web site.', 'b: a book extract.', 'c: a news paper article.']
    },
    {
        type: 'tf-group',
        title: '2- Say whether the statements are true or false. Write T or F next to the statements. (2 pts)',
        questions: [
            { id: '2a', text: 'a. Corruption affects the poor the most.' },
            { id: '2b', text: 'b. People can be asked for a bribe in order to have health care.' },
            { id: '2c', text: 'c. Governments can’t fight funds disappearance.' },
            { id: '2d', text: 'd. We don’t have to know about hospitals budget to ensure good health care.' }
        ]
    },
    {
        type: 'text-group',
        title: '3- Answer the following questions according to the text. (3 points)',
        questions: [
            { id: '3a', text: 'a. What unethical behaviours are committed by the medical staff ?' },
            { id: '3b', text: 'b. How can governments fight funds disappearance ?' },
            { id: '3c', text: 'c. Is it possible for people to improve health services at the local level ?' }
        ]
    },
    {
        type: 'para-match-group',
        title: '4. In which paragraph are the following ideas mentioned',
        questions: [
            { id: '4a', text: 'a: health workers should be well paid in order to stop bribery . (1 point)' },
            { id: '4b', text: 'b: some patient’s families give bribery to treat their relative.' }
        ],
        options: ['1', '2', '3', '4']
    },
    {
        type: 'text-group',
        title: '5. What or who do the underlined words refer to in the text? (0,5 pt)',
        questions: [
            { id: '5a', text: 'a) who (§2) ………' },
            { id: '5b', text: 'b) we (§4) ………' }
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
    else if (stepData.type === 'para-match-group') {
        html += '<div style="display: flex; flex-direction: column; gap: 20px;">';
        stepData.questions.forEach(q => {
            html += `
                <div class="sub-question">
                    <p>${q.text}</p>
                    <div class="options-row">
                        ${stepData.options.map(opt => `
                            <button class="option-btn ${userAnswers[4][q.id.slice(1)] === opt ? 'selected' : ''}" 
                                    data-qid="${q.id}" data-value="${opt}">P${opt}</button>
                        `).join('')}
                    </div>
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
            else if (qid.startsWith('4')) {
                const subId = qid.slice(1);
                userAnswers[4][subId] = value;
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
    if (userAnswers[1] === 'a: a web site.') { scoreBreakdown.p1++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 2 (4 items)
    if (userAnswers[2].a === 'True') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].b === 'True') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].c === 'False') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].d === 'False') { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 3 (3 items)
    if (containsKeywords(userAnswers[3].a, ['unofficial fees', 'bribes', 'medication'])) { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[3].b, ['publish', 'budgets', 'financial information', 'truck funds', 'prevent'])) { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[3].c, ['yes', 'demand accountability', 'scrutinise', 'budgets'])) { scoreBreakdown.p3++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 4 (2 items)
    if (userAnswers[4].a === '3') { scoreBreakdown.p4++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[4].b === '1') { scoreBreakdown.p4++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 5 (2 items)
    if (containsKeywords(userAnswers[5].a, ['ministers', 'administrators'])) { scoreBreakdown.p5++; bubbles.push(true); } else { bubbles.push(false); }
    if (containsKeywords(userAnswers[5].b, ['people', 'readers', 'we'])) { scoreBreakdown.p5++; bubbles.push(true); } else { bubbles.push(false); }

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
            <span class="breakdown-label">Part 1: Source of Text (out of 1)</span>
            <span class="breakdown-score">${scoreBreakdown.p1}/1</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 2: True/False (out of 4)</span>
            <span class="breakdown-score">${scoreBreakdown.p2}/4</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 3: Text Answers (out of 3)</span>
            <span class="breakdown-score">${scoreBreakdown.p3}/3</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 4: Paragraph Match (out of 2)</span>
            <span class="breakdown-score">${scoreBreakdown.p4}/2</span>
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
                quizName: 'Health Sector Test',
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
        3: { a: "", b: "", c: "" },
        4: { a: null, b: null },
        5: { a: "", b: "" }
    };
    document.getElementById('telegram-status').textContent = 'Sending your score to your teacher...';
    document.getElementById('telegram-status').style.color = '#999';
    resultScreen.classList.remove('active');
    startScreen.classList.add('active');
});
