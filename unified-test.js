/* =========================================================
   Unified Test Engine
   Loads ALL tests from tests.md
   ========================================================= */

let ALL_TESTS = {};
let currentTest = null;
let currentStep = 0;
let userAnswers = {};
let studentUsername = "";

const startScreen = document.getElementById("start-screen");
const quizScreen = document.getElementById("quiz-screen");
const resultScreen = document.getElementById("result-screen");
const textOverlay = document.getElementById("text-overlay");
const startBtn = document.getElementById("start-btn");
const usernameInput = document.getElementById("telegram-user");
const testSelect = document.getElementById("test-select");
const closeTextBtn = document.getElementById("close-text-btn");
const textBtn = document.getElementById("text-btn");
const nextBtn = document.getElementById("next-btn");
const prevBtn = document.getElementById("prev-btn");
const restartBtn = document.getElementById("restart-btn");
const dictOverlay = document.getElementById("dict-modal-overlay");
const dictCloseBtn = document.getElementById("dict-close-btn");
const dictModalText = document.getElementById("dict-modal-text");
const appContainer = document.querySelector('.app-container');

// ========== PARSE MARKDOWN ==========
function parseTestsMD(raw) {
  const blocks = raw.split("===TEST===").filter(b => b.trim());
  const tests = {};

  blocks.forEach(block => {
    const idMatch = block.match(/ID:\s*(.+)/);
    const titleMatch = block.match(/TITLE:\s*(.+)/);
    const textMatch = block.match(/TEXT:\s*([\s\S]*?)(?=DICT:)/);
    const dictMatch = block.match(/DICT:\s*([\s\S]*?)(?=QUESTIONS:)/);
    const questionsMatch = block.match(/QUESTIONS:\s*([\s\S]*?)(?=SOLUTIONS:)/);
    const solutionsMatch = block.match(/SOLUTIONS:\s*([\s\S]*)/);

    if (!idMatch || !titleMatch) return;

    const id = idMatch[1].trim();
    const title = titleMatch[1].trim();
    const text = textMatch ? textMatch[1].trim() : "";
    const dictRaw = dictMatch ? dictMatch[1].trim() : "";
    const questionsRaw = questionsMatch ? questionsMatch[1].trim() : "";
    const solutionsRaw = solutionsMatch ? solutionsMatch[1].trim() : "";

    const dictionary = {};
    dictRaw.split("\n").forEach(line => {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const word = line.slice(0, idx).trim();
        const def = line.slice(idx + 1).trim();
        if (word && def) dictionary[word] = def;
      }
    });

    const solutions = {};
    solutionsRaw.split("\n").forEach(line => {
        const idx = line.indexOf(":");
        if (idx > 0) {
            const qid = line.slice(0, idx).trim();
            const ans = line.slice(idx + 1).trim();
            if (qid && ans) solutions[qid] = ans;
        }
    });

    // Parse Questions
    const questions = [];
    const qLines = questionsRaw.split("\n");
    let currentQ = null;
    
    qLines.forEach(line => {
      line = line.trim();
      if (!line) return;
      
      const qMatch = line.match(/^(\d+)\.\s*\[(MCQ_SINGLE|MCQ_GROUP|TF_GROUP|TEXT_GROUP|ORDERING|PARA_MATCH)\]\s*(.*)/);
      if (qMatch) {
        if (currentQ) questions.push(currentQ);
        currentQ = {
          id: qMatch[1],
          type: qMatch[2],
          title: qMatch[3],
          items: [],
          options: []
        };
      } else if (line.startsWith("-")) {
        const content = line.replace(/^-\s*/, "").trim();
        if (currentQ) {
          if (currentQ.type === 'MCQ_SINGLE') {
             currentQ.options.push(content);
          } else if (currentQ.type === 'MCQ_GROUP') {
             if (content.includes("|")) {
                 const parts = content.split("|").map(p => p.trim());
                 currentQ.items.push({ text: parts[0], options: parts.slice(1) });
             } else {
                 currentQ.items.push({ text: content });
             }
          } else {
             currentQ.items.push({ text: content });
          }
        }
      }
    });
    if (currentQ) questions.push(currentQ);

    tests[id] = { id, title, text, dictionary, questions, solutions };
  });

  return tests;
}

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

// ========== INIT ==========
async function init() {
  try {
    const res = await fetch("tests.md");
    const raw = await res.text();
    ALL_TESTS = parseTestsMD(raw);

    testSelect.innerHTML = '<option value="" disabled selected>Choose a test...</option>';
    Object.values(ALL_TESTS).forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.title;
      testSelect.appendChild(opt);
    });
  } catch (err) {
    console.error("Failed to load tests.md", err);
    alert("Could not load tests.md. Make sure the file is in the same folder.");
  }

  function checkReady() {
    startBtn.disabled = !(usernameInput.value.trim() && testSelect.value);
  }
  usernameInput.addEventListener("input", checkReady);
  testSelect.addEventListener("change", checkReady);

  startBtn.addEventListener("click", startTest);
  closeTextBtn.addEventListener("click", closeTextOverlay);
  textBtn.addEventListener("click", openTextOverlay);
  nextBtn.addEventListener("click", () => {
    if (currentStep < currentTest.questions.length - 1) {
      currentStep++;
      renderQuestion();
    } else {
      showResults();
    }
  });
  prevBtn.addEventListener("click", () => {
    if (currentStep > 0) {
      currentStep--;
      renderQuestion();
    }
  });
  
  restartBtn.addEventListener("click", () => {
    resultScreen.classList.remove("active");
    startScreen.classList.add("active");
    usernameInput.value = "";
    testSelect.value = "";
    startBtn.disabled = true;
  });
  
  dictCloseBtn.addEventListener("click", () => dictOverlay.classList.remove("active"));
  dictOverlay.addEventListener("click", e => {
    if (e.target === dictOverlay) dictOverlay.classList.remove("active");
  });
}

async function startTest() {
  studentUsername = usernameInput.value.trim();
  if (!studentUsername.startsWith("@")) studentUsername = "@" + studentUsername;
  currentTest = ALL_TESTS[testSelect.value];

  if (!currentTest) {
    alert("Test not found");
    return;
  }

  startBtn.disabled = true;
  startBtn.textContent = "Checking...";

  try {
    const res = await fetch(`/api/check-username?username=${encodeURIComponent(studentUsername)}`);
    const data = await res.json();
    if (!data.valid) {
      alert("Username not found in the system.");
      startBtn.disabled = false;
      startBtn.textContent = "Continue";
      return;
    }
  } catch (e) {
    console.warn("Backend check skipped");
  }

  startBtn.disabled = false;
  startBtn.textContent = "Continue";
  startScreen.classList.remove("active");
  
  // Initialize state
  currentStep = 0;
  userAnswers = {};
  currentTest.questions.forEach((q, index) => {
      if (q.type === 'MCQ_SINGLE') {
          userAnswers[index] = null;
      } else {
          userAnswers[index] = {};
          q.items.forEach((item, i) => {
              const subId = String.fromCharCode(97 + i);
              if (q.type === 'TEXT_GROUP') userAnswers[index][subId] = "";
              else userAnswers[index][subId] = null;
          });
      }
  });

  openTextOverlay();
}

function openTextOverlay() {
  if (!currentTest) return;
  document.getElementById("overlay-title").textContent = currentTest.title;

  let html = currentTest.text
    .split(/\n\n+/)
    .map(p => `<p>${highlightWords(p, currentTest.dictionary)}</p>`)
    .join("");

  document.getElementById("overlay-text").innerHTML = html;
  textOverlay.classList.add("active");

  document.querySelectorAll(".dict-word").forEach(el => {
    el.addEventListener("click", () => openDictionary(el.dataset.word));
  });
}

function highlightWords(text, dict) {
  const terms = Object.keys(dict).sort((a, b) => b.length - a.length);
  let result = text;
  terms.forEach(term => {
    const regex = new RegExp(`\\b(${escapeRegExp(term)})\\b`, "gi");
    result = result.replace(regex, `<span class="dict-word" data-word="$1">$1</span>`);
  });
  return result;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function closeTextOverlay() {
  textOverlay.classList.remove("active");
  quizScreen.classList.add("active");
  renderQuestion();
}

function renderQuestion() {
  const stepData = currentTest.questions[currentStep];
  const questionContent = document.getElementById("question-content");
  
  // Build Progress Map
  const progressMap = document.getElementById("progress-map");
  progressMap.innerHTML = '';
  for(let i = 0; i < currentTest.questions.length; i++) {
      const dot = document.createElement('div');
      dot.className = `progress-dot ${i === currentStep ? 'active' : ''}`;
      progressMap.appendChild(dot);
  }

  // Update Nav Buttons
  prevBtn.style.visibility = currentStep === 0 ? "hidden" : "visible";
  nextBtn.textContent = currentStep === currentTest.questions.length - 1 ? "Finish Test" : "Next";

  let html = `<div class="question-title">${stepData.title}</div>`;
  
  if (stepData.type === 'MCQ_SINGLE') {
    html += `<div class="options-grid">`;
    stepData.options.forEach(opt => {
      const selected = userAnswers[currentStep] === opt ? 'selected' : '';
      html += `<button class="option-btn ${selected}" data-qid="${currentStep}" data-value="${opt}">${opt}</button>`;
    });
    html += `</div>`;
  } 
  else if (stepData.type === 'MCQ_GROUP') {
    html += '<div style="display: flex; flex-direction: column; gap: 20px;">';
    stepData.items.forEach((item, i) => {
      const subId = String.fromCharCode(97 + i);
      html += `
        <div class="sub-question">
          <p>${item.text}</p>
          <div class="options-grid">
            ${item.options.map(opt => `
              <button class="option-btn ${userAnswers[currentStep][subId] === opt ? 'selected' : ''}" 
                      data-qid="${currentStep}" data-subid="${subId}" data-value="${opt}">${opt}</button>
            `).join('')}
          </div>
        </div>
      `;
    });
    html += '</div>';
  } 
  else if (stepData.type === 'TF_GROUP' || stepData.type === 'PARA_MATCH') {
    const opts = stepData.type === 'TF_GROUP' ? ['True', 'False'] : ['1', '2', '3', '4'];
    const prefix = stepData.type === 'PARA_MATCH' ? 'P' : '';
    html += '<div style="display: flex; flex-direction: column; gap: 20px;">';
    stepData.items.forEach((item, i) => {
      const subId = String.fromCharCode(97 + i);
      html += `
        <div class="sub-question">
          <p>${item.text}</p>
          <div class="options-row horizontal">
            ${opts.map(opt => `
              <button class="option-btn ${userAnswers[currentStep][subId] === opt ? 'selected' : ''}" 
                      data-qid="${currentStep}" data-subid="${subId}" data-value="${opt}">${prefix}${opt}</button>
            `).join('')}
          </div>
        </div>
      `;
    });
    html += '</div>';
  } 
  else if (stepData.type === 'TEXT_GROUP') {
    html += '<div style="display: flex; flex-direction: column; gap: 20px;">';
    stepData.items.forEach((item, i) => {
      const subId = String.fromCharCode(97 + i);
      html += `
        <div class="sub-question">
          <p>${item.text}</p>
          <textarea data-qid="${currentStep}" data-subid="${subId}" rows="3" placeholder="Type your answer here...">${userAnswers[currentStep][subId] || ''}</textarea>
        </div>
      `;
    });
    html += '</div>';
  }
  else if (stepData.type === 'ORDERING') {
    html += '<div style="display: flex; flex-direction: column; gap: 10px;">';
    stepData.items.forEach((item, i) => {
      const subId = String.fromCharCode(97 + i);
      const currentVal = userAnswers[currentStep][subId] || 0;
      html += `
        <div class="sub-question" style="display: flex; align-items: center; gap: 12px; border: 1px solid #eee; padding: 12px; border-radius: 10px; margin-bottom: 0;">
          <div class="order-circle" data-qid="${currentStep}" data-subid="${subId}" style="width: 35px; height: 35px; border-radius: 50%; background: #f3e9ff; color: #5e17a8; display: flex; align-items: center; justify-content: center; font-family: 'Poppins', sans-serif; font-weight: 800; font-size: 1rem; cursor: pointer; border: 2px solid #8a2be2; flex-shrink: 0;">${currentVal === 0 ? '–' : currentVal}</div>
          <div style="font-size: 0.9rem; font-weight: 500;">${item.text}</div>
        </div>
      `;
    });
    html += '</div>';
  }

  questionContent.innerHTML = html;
  attachEventListeners();
}

function attachEventListeners() {
  document.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const qid = e.target.getAttribute('data-qid');
      const value = e.target.getAttribute('data-value');
      const subid = e.target.getAttribute('data-subid');
      
      if (subid) {
        userAnswers[qid][subid] = value;
        const siblings = e.target.parentNode.querySelectorAll('.option-btn');
        siblings.forEach(s => s.classList.remove('selected'));
        e.target.classList.add('selected');
      } else {
        userAnswers[qid] = value;
        const siblings = e.target.parentNode.querySelectorAll('.option-btn');
        siblings.forEach(s => s.classList.remove('selected'));
        e.target.classList.add('selected');
      }
    });
  });

  document.querySelectorAll('textarea').forEach(input => {
    input.addEventListener('input', (e) => {
      const qid = e.target.getAttribute('data-qid');
      const subid = e.target.getAttribute('data-subid');
      userAnswers[qid][subid] = e.target.value;
    });
  });

  document.querySelectorAll('.order-circle').forEach(circle => {
    circle.addEventListener('click', (e) => {
      const qid = e.target.getAttribute('data-qid');
      const subid = e.target.getAttribute('data-subid');
      let currentVal = userAnswers[qid][subid] || 0;
      
      currentVal = (currentVal + 1) % 4;
      if (currentVal === 0) currentVal = 1;
      if(currentVal > 3) currentVal = 1;
      
      userAnswers[qid][subid] = currentVal;
      e.target.textContent = currentVal;
    });
  });
}

// --- GRADING LOGIC ---
function calculateScore() {
    let totalScore = 0;
    let bubbles = [];
    let breakdownHTML = '';
    
    currentTest.questions.forEach((q, index) => {
        let correctCount = 0;
        let totalItems = 0;
        
        if (q.type === 'MCQ_SINGLE') {
            totalItems = 1;
            if (userAnswers[index] === currentTest.solutions[q.id]) { totalScore++; correctCount++; bubbles.push(true); } else { bubbles.push(false); }
        } else if (q.type === 'TF_GROUP' || q.type === 'PARA_MATCH' || q.type === 'MCQ_GROUP') {
            q.items.forEach((item, i) => {
                totalItems++;
                const subId = String.fromCharCode(97 + i);
                const qid = `${q.id}${subId}`;
                const userAns = userAnswers[index][subId];
                const correctAns = currentTest.solutions[qid];
                if (userAns === correctAns) { totalScore++; correctCount++; bubbles.push(true); } else { bubbles.push(false); }
            });
        } else if (q.type === 'TEXT_GROUP') {
            q.items.forEach((item, i) => {
                totalItems++;
                const subId = String.fromCharCode(97 + i);
                const qid = `${q.id}${subId}`;
                const keywords = currentTest.solutions[qid].split(',').map(k => k.trim());
                if (containsKeywords(userAnswers[index][subId], keywords)) { totalScore++; correctCount++; bubbles.push(true); } else { bubbles.push(false); }
            });
        } else if (q.type === 'ORDERING') {
            q.items.forEach((item, i) => {
                totalItems++;
                const subId = String.fromCharCode(97 + i);
                const orderStr = currentTest.solutions[q.id];
                const orderMap = {};
                orderStr.split(',').forEach(pair => {
                    const [letter, num] = pair.split('=');
                    orderMap[letter.trim()] = parseInt(num.trim());
                });
                if (userAnswers[index][subId] === orderMap[subId]) { totalScore++; correctCount++; bubbles.push(true); } else { bubbles.push(false); }
            });
        }
        
        breakdownHTML += `
            <div class="breakdown-row">
                <span>Q${q.id}: ${q.title.substring(0, 30)}...</span>
                <span>${correctCount}/${totalItems}</span>
            </div>
        `;
    });

    return { totalScore, bubbles, breakdownHTML };
}

function showResults() {
    quizScreen.classList.remove("active");
    resultScreen.classList.add("active");
    
    const { totalScore, bubbles, breakdownHTML } = calculateScore();
    const percentageScore = ((totalScore / bubbles.length) * 100).toFixed(2);
    
    document.getElementById("final-score").textContent = `${percentageScore}/100`;
    document.getElementById("score-breakdown").innerHTML = breakdownHTML;

    if(totalScore >= bubbles.length * 0.7) {
        document.getElementById("result-message").textContent = 'Excellent work! You have a solid understanding of the text.';
    } else if(totalScore >= bubbles.length * 0.5) {
        document.getElementById("result-message").textContent = 'Good effort! Keep practicing your reading skills.';
    } else {
        document.getElementById("result-message").textContent = 'Needs improvement. Review the text and try again!';
    }

    setTimeout(() => {
        createBubbles(bubbles);
    }, 300);

    sendToTelegram(percentageScore);
}

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
    setTimeout(() => { bubbleContainer.remove(); }, 2000);
}

async function sendToTelegram(percentageScore) {
    const telegramStatus = document.getElementById("telegram-status");
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB');
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

    try {
        const response = await fetch('/api/send-quiz-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quizName: currentTest.title,
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

// We need a PDF button dynamically
function generatePDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text(`Test Review: ${currentTest.title}`, 105, 20, null, null, 'center');
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

    currentTest.questions.forEach((q, index) => {
        if (q.type === 'MCQ_SINGLE') {
            addQ(`Q${q.id}: ${q.title}`, userAnswers[index], currentTest.solutions[q.id]);
        } else {
            q.items.forEach((item, i) => {
                const subId = String.fromCharCode(97 + i);
                const qid = `${q.id}${subId}`;
                let correctAns = currentTest.solutions[qid];
                
                if (q.type === 'ORDERING') {
                    const orderStr = currentTest.solutions[q.id];
                    const orderMap = {};
                    orderStr.split(',').forEach(pair => {
                        const [letter, num] = pair.split('=');
                        orderMap[letter.trim()] = num.trim();
                    });
                    correctAns = `${subId}) Order: ${orderMap[subId]}`;
                }
                
                addQ(`Q${qid}: ${item.text}`, userAnswers[index][subId], correctAns);
            });
        }
    });

    doc.save(`${currentTest.id}-Test-Review.pdf`);
}

// Inject PDF button dynamically since it wasn't in the original HTML
const pdfBtn = document.createElement('button');
pdfBtn.className = 'btn btn-primary';
pdfBtn.style.marginTop = '10px';
pdfBtn.style.background = '#111';
pdfBtn.textContent = '⬇ Download Answers & Review (PDF)';
pdfBtn.onclick = generatePDF;
document.querySelector('.action-buttons').appendChild(pdfBtn);

function openDictionary(focusWord = null) {
  if (!currentTest) return;
  let html = "";
  Object.entries(currentTest.dictionary).forEach(([word, def]) => {
    const isFocus = focusWord && word.toLowerCase() === focusWord.toLowerCase();
    html += `<p class="${isFocus ? "highlight-word" : ""}"><strong>${word}:</strong> ${def}</p>`;
  });
  dictModalText.innerHTML = html;
  dictOverlay.classList.add("active");
  if (focusWord) {
    setTimeout(() => {
      const el = dictModalText.querySelector(".highlight-word");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }
}

init();
