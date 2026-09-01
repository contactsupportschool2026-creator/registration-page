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
        title: '1- The text is a taken from',
        options: ['a: a web site.', 'b: a book extract.', 'c: a news paper article.']
    },
    {
        type: 'tf-group',
        title: '2- Say whether the statements are true or false. Write T or F next to the statements.',
        questions: [
            { id: '2a', text: 'a. Corruption affects the poor the most.' },
            { id: '2b', text: 'b. People can be asked for a bribe in order to have health care.' },
            { id: '2c', text: 'c. Governments can’t fight funds disappearance.' },
            { id: '2d', text: 'd. We don’t have to know about hospitals budget to ensure good health care.' }
        ]
    },
    {
        type: 'text-group',
        title: '3- Answer the following questions according to the text.',
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
            { id: '4a', text: 'a: health workers should be well paid in order to stop bribery.' },
            { id: '4b', text: 'b: some patient’s families give bribery to treat their relative.' }
        ],
        options: ['1', '2', '3', '4']
    },
    {
        type: 'text-group',
        title: '5. What or who do the underlined words refer to in the text?',
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
    if (userAnswers[2].b === 'True') { scoreBreakdown.p2++; bubbles
