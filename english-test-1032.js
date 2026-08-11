
let studentUsername = '';
let currentStep = 0;
let userAnswers = {
    1: { a: null, b: null, c: null }, 
    2: { a: null, b: null, c: null }, 
    3: { a: "", b: "", c: "" },       
    4: null                            
};

const quizData = [
    {
        type: 'mcq-group',
        title: '1. Choose the answer to complete each statement.',
        questions: [
            { id: '1a', text: 'a) Ethical workers are those who improve …….', options: ['their profits', 'human relationships', 'the number of stakeholders'] },
            { id: '1b', text: 'b) Workplace can be exposed to …………….', options: ['unethical practices', 'unfair competition', 'regular audits'] },
            { id: '1c', text: 'c) Lack of confidence between workers ……..', options: ['saves time and money', 'encourages human contact', 'affects work quality'] }
        ]
    },
    {
        type: 'ordering',
        title: '2. Put the following ideas in the order they appear in the text.',
        items: [
            { id: '2a', text: 'a) Mutual trust is important for cooperation at work.' },
            { id: '2b', text: 'b) Workplace code of conduct is concerned with unethical behaviours.' },
            { id: '2c', text: 'c) Ethical employees contribute more to their employers’ wealth.' }
        ]
    },
    {
        type: 'text-group',
        title: '3. Answer the following questions according to the text.',
        questions: [
            { id: '3a', text: 'a) What unethical practices do workplace ethics focus on?' },
            { id: '3b', text: 'b) Why is it important to trust your workmates?' },
            { id: '3c', text: 'c) Is confidence between employees and employers fruitful? Justify your answer.' }
        ]
    },
    {
        type: 'mcq-single',
        title: '4. Choose the most appropriate title',
        options: ['a) Decision making in companies.', 'b) Productivity factors in business.', 'c) Ethics at the workplace.']
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

    if (stepData.type === 'mcq-group') {
        html += '<div style="display: flex; flex-direction: column; gap: 20px;">';
        stepData.questions.forEach(q => {
            html += `
                <div class="sub-question">
                    <p>${q.text}</p>
                    <div class="options-grid">
                        ${q.options.map(opt => `
                            <button class="option-btn ${userAnswers[1][q.id.slice(1)] === opt ? 'selected' : ''}" 
                                    data-qid="${q.id}" data-value="${opt}">${opt}</button>
                        `).join('')}
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
                    <textarea data-qid="${q.id}" rows="3" placeholder="Type your answer here...">${userAnswers[3][q.id.slice(1)] || ''}</textarea>
                </div>
            `;
        });
        html += '</div>';
    } 
    else if (stepData.type === 'mcq-single') {
        html += `
            <div class="options-grid">
                ${stepData.options.map(opt => `
                    <button class="option-btn ${userAnswers[4] === opt ? 'selected' : ''}" 
                            data-qid="4" data-value="${opt}">${opt}</button>
                `).join('')}
            </div>
        `;
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
            else if (qid === '4') {
                userAnswers[4] = value;
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
            const subId = qid.slice(1);
            userAnswers[3][subId] = e.target.value;
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
    let scoreBreakdown = { p1: 0, p2: 0, p3: 0, p4: 0 };
    let bubbles = []; // true = green, false = red

    // Part 1 (3 pts)
    if (userAnswers[1].a === 'human relationships') { scoreBreakdown.p1++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[1].b === 'unethical practices') { scoreBreakdown.p1++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[1].c === 'affects work quality') { scoreBreakdown.p1++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 2 (3 pts) -> b=1, c=2, a=3
    if (userAnswers[2].b === 1) { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].c === 2) { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }
    if (userAnswers[2].a === 3) { scoreBreakdown.p2++; bubbles.push(true); } else { bubbles.push(false); }

    // Part 3 (6 pts) -> 2 pts per answer
    if (containsKeywords(userAnswers[3].a, ['discrimination', 'fraud', 'theft', 'harassment'])) { scoreBreakdown.p3 += 2; bubbles.push(true, true); } else { bubbles.push(false, false); }
    if (containsKeywords(userAnswers[3].b, ['productivity', 'communicate', 'easier'])) { scoreBreakdown.p3 += 2; bubbles.push(true, true); } else { bubbles.push(false, false); }
    if (containsKeywords(userAnswers[3].c, ['yes', 'promotions', 'pay raise', 'responsibilities'])) { scoreBreakdown.p3 += 2; bubbles.push(true, true); } else { bubbles.push(false, false); }

    // Part 4 (3 pts)
    if (userAnswers[4] === 'c) Ethics at the workplace.') { scoreBreakdown.p4 += 3; bubbles.push(true, true, true); } else { bubbles.push(false, false, false); }

    const totalScore = scoreBreakdown.p1 + scoreBreakdown.p2 + scoreBreakdown.p3 + scoreBreakdown.p4;
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
    
    // Calculate score out of 100
    const percentageScore = ((totalScore / 15) * 100).toFixed(2);
    document.getElementById('final-score').textContent = `${percentageScore}/100`;
    
    const breakdownHTML = `
        <div class="breakdown-row">
            <span class="breakdown-label">Part 1: MCQs (out of 3)</span>
            <span class="breakdown-score">${scoreBreakdown.p1}/3</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 2: Ordering (out of 3)</span>
            <span class="breakdown-score">${scoreBreakdown.p2}/3</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 3: Text Answers (out of 6)</span>
            <span class="breakdown-score">${scoreBreakdown.p3}/6</span>
        </div>
        <div class="breakdown-row">
            <span class="breakdown-label">Part 4: Title (out of 3)</span>
            <span class="breakdown-score">${scoreBreakdown.p4}/3</span>
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

// Telegram Integration Logic
async function sendToTelegram(percentageScore) {
    const telegramStatus = document.getElementById('telegram-status');
    
    if (TELEGRAM_BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE' || TELEGRAM_CHAT_ID === 'YOUR_CHAT_ID_HERE') {
        telegramStatus.textContent = 'Teacher needs to setup Telegram Bot credentials.';
        telegramStatus.style.color = 'red';
        return;
    }

    // Get Current Date and Time
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB'); // DD/MM/YYYY
    const timeStr = now.toLocaleTimeString('en-GB'); // HH:MM:SS

    const message = `📝 *New Quiz Result*\n\n` +
                    `Quiz: English Test 1032 | Username: ${studentUsername} | Date: ${dateStr} | Time: ${timeStr} | Score: ${percentageScore}`;
    
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });

        const data = await response.json();

        if (data.ok) {
            telegramStatus.textContent = '✅ Score sent to your teacher successfully!';
            telegramStatus.style.color = 'green';
        } else {
            telegramStatus.textContent = '⚠️ Error sending score. Please inform your teacher.';
            telegramStatus.style.color = 'red';
            console.error('Telegram API Error:', data);
        }
    } catch (error) {
        telegramStatus.textContent = '⚠️ Network error. Could not send score.';
        telegramStatus.style.color = 'red';
        console.error('Fetch Error:', error);
    }
}

// Restart Logic
restartBtn.addEventListener('click', () => {
    currentStep = 0;
    userAnswers = { 1: { a: null, b: null, c: null }, 2: { a: null, b: null, c: null }, 3: { a: "", b: "", c: "" }, 4: null };
    document.getElementById('telegram-status').textContent = 'Sending your score to your teacher...';
    document.getElementById('telegram-status').style.color = '#999';
    resultScreen.classList.remove('active');
    startScreen.classList.add('active');
});
