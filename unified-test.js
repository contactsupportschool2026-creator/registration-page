/* =========================================================
   UNIFIED TEST & WRITING ENGINE
   ========================================================= */

const ALL_TESTS = {
  "1032": { id: "1032", title: "Ethics in the Workplace", text: `Ethical employees...`, dictionary: {}, quizData: [], answers: {} },
  "1033": { id: "1033", title: "Corruption in the Health Sector", text: `Corruption...`, dictionary: {}, quizData: [], answers: {} },
  "1034": { id: "1034", title: "Ethics in Business", text: `In today's...`, dictionary: {}, quizData: [], answers: {} },
  "1035": { id: "1035", title: "The Indus Civilization", text: `The valley...`, dictionary: {}, quizData: [], answers: {} },
  "1036": { id: "1036", title: "Algeria's UNESCO Heritage", text: `Algeria has...`, dictionary: {}, quizData: [], answers: {} },
  "1037": { id: "1037", title: "Ancient Civilizations", text: `The civilizations...`, dictionary: {}, quizData: [], answers: {} },
  "1038": { id: "1038", title: "Ordinary Unethical Behaviour", text: `Cheating, deception...`, dictionary: {}, quizData: [], answers: {} }
  // NOTE: I truncated the data here to save space in the AI response. 
  // JUST PASTE YOUR EXISTING ALL_TESTS DATA INSIDE THIS OBJECT.
};

const ALL_WRITING_TOPICS = {
  "WE1_LIT": {
    id: "WE1_LIT",
    title: "Writing Expression",
    topic: "Some people are more likely to feel above the law because they are rich. They lie, steal, cheat and engage in other unethical behaviours because their money makes them feel untouchable. Write an opinion article of about 80 to 120 words for the local newspaper to denounce those people and suggest what you can do to become a good citizen.",
    bullets: [
      "encourage whistleblowing.",
      "engage in anti-corruption associations.",
      "act ethically and legally.",
      "respect the rules of the community."
    ]
  }
};

// ========== STATE ==========
let currentTest = null;
let currentWriting = null;
let currentStep = 0;
let userAnswers = {};
let studentUsername = "";
let currentGroup = "";
let currentEssay = null;

// ========== DOM ==========
const startScreen = document.getElementById("start-screen");
const quizScreen = document.getElementById("quiz-screen");
const writingScreen = document.getElementById("writing-screen");
const resultScreen = document.getElementById("result-screen");
const teacherPanelScreen = document.getElementById("teacher-panel-screen");
const textOverlay = document.getElementById("text-overlay");
const startBtn = document.getElementById("start-btn");
const usernameInput = document.getElementById("telegram-user");
const closeTextBtn = document.getElementById("close-text-btn");
const textBtn = document.getElementById("text-btn");
const nextBtn = document.getElementById("next-btn");
const prevBtn = document.getElementById("prev-btn");
const restartBtn = document.getElementById("restart-btn");
const dictOverlay = document.getElementById("dict-modal-overlay");
const dictCloseBtn = document.getElementById("dict-close-btn");
const dictModalText = document.getElementById("dict-modal-text");
const questionContent = document.getElementById("question-content");
const progressMap = document.getElementById("progress-map");
const navFooter = document.getElementById("nav-footer");
const statusMessage = document.getElementById("status-message");
const appContainer = document.querySelector('.app-container');
const pdfBtn = document.getElementById("pdf-btn");
const startTitle = document.getElementById("start-title");
const startSubtitle = document.getElementById("start-subtitle");
const usernameLabel = document.getElementById("username-label");

// ========== INIT ==========
function init() {
  function checkReady() {
    startBtn.disabled = !usernameInput.value.trim();
  }
  usernameInput.addEventListener("input", checkReady);

  startBtn.addEventListener("click", handleStart);
  closeTextBtn.addEventListener("click", closeTextOverlay);
  textBtn.addEventListener("click", openTextOverlay);
  nextBtn.addEventListener("click", nextQuestion);
  prevBtn.addEventListener("click", prevQuestion);
  
  restartBtn.addEventListener("click", () => {
    resultScreen.classList.remove("active");
    quizScreen.classList.remove("active");
    writingScreen.classList.remove("active");
    teacherPanelScreen.classList.remove("active");
    navFooter.style.display = "none";
    startScreen.classList.add("active");
    usernameInput.value = "";
    startBtn.disabled = true;
    statusMessage.style.display = "none";
    startTitle.textContent = "Reading Comprehension";
    startSubtitle.textContent = "Enter your Telegram username to start the assigned test";
    usernameLabel.textContent = "Telegram Username";
    usernameInput.type = "text";
    usernameInput.placeholder = "@username";
  });
  
  dictCloseBtn.addEventListener("click", () => dictOverlay.classList.remove("active"));
  dictOverlay.addEventListener("click", e => {
    if (e.target === dictOverlay) dictOverlay.classList.remove("active");
  });
  
  if(pdfBtn) pdfBtn.addEventListener("click", generatePDF);
}

async function handleStart() {
  studentUsername = usernameInput.value.trim();
  if (!studentUsername.startsWith("@")) studentUsername = "@" + studentUsername;

  // Teacher Login Check
  if (studentUsername.toLowerCase() === "@duatm") {
    startTitle.textContent = "Welcome Teacher";
    startSubtitle.textContent = "Enter your password to access the correction panel";
    usernameLabel.textContent = "Password";
    usernameInput.type = "password";
    usernameInput.value = "";
    startBtn.disabled = true;
    
    startBtn.onclick = async () => {
      const password = usernameInput.value;
      try {
        const res = await fetch('/api/teacher-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success) {
          startScreen.classList.remove("active");
          teacherPanelScreen.classList.add("active");
        } else {
          statusMessage.style.display = "block";
          statusMessage.textContent = "Incorrect password.";
        }
      } catch (err) {
        statusMessage.style.display = "block";
        statusMessage.textContent = "Network error.";
      }
    };
    return;
  }

  // Student Flow
  startBtn.disabled = true;
  startBtn.textContent = "Checking...";
  statusMessage.style.display = "none";

  try {
    const res = await fetch(`/api/get-assigned-test?username=${encodeURIComponent(studentUsername)}`);
    const data = await res.json();

    if (!data.valid) {
      statusMessage.style.display = "block";
      statusMessage.textContent = data.message || "Username not found.";
      startBtn.disabled = false;
      startBtn.textContent = "Continue";
      return;
    }

    if (!data.active && data.active !== undefined && !data.type) {
      statusMessage.style.display = "block";
      statusMessage.textContent = data.message || "There is no active test at the moment.";
      startBtn.disabled = false;
      startBtn.textContent = "Continue";
      return;
    }

    if (data.type === 'writing') {
      currentWriting = ALL_WRITING_TOPICS[data.topicId];
      currentGroup = data.group;
      if (!currentWriting) {
        statusMessage.style.display = "block";
        statusMessage.textContent = "Writing topic not found.";
        startBtn.disabled = false;
        startBtn.textContent = "Continue";
        return;
      }
      startBtn.disabled = false;
      startBtn.textContent = "Continue";
      startScreen.classList.remove("active");
      openWritingOverlay();
    } else {
      currentTest = ALL_TESTS[data.testId];
      if (!currentTest) {
        statusMessage.style.display = "block";
        statusMessage.textContent = "Test data not found.";
        startBtn.disabled = false;
        startBtn.textContent = "Continue";
        return;
      }
      startBtn.disabled = false;
      startBtn.textContent = "Continue";
      currentStep = 0;
      userAnswers = {};
      startScreen.classList.remove("active");
      openTextOverlay();
    }
  } catch (err) {
    statusMessage.style.display = "block";
    statusMessage.textContent = "Network error.";
    startBtn.disabled = false;
    startBtn.textContent = "Continue";
  }
}

// ... (Paste your existing functions: openTextOverlay, highlightWords, escapeRegExp, closeTextOverlay, buildProgress, renderQuestion, attachListeners, updateNav, nextQuestion, prevQuestion, openDictionary, normalizeText, containsKeywords, calculateScore, finishTest, createBubbles, sendToTelegram, generatePDF here ...)

function openWritingOverlay() {
  document.getElementById("overlay-title").textContent = currentWriting.title;
  let html = `<p>${currentWriting.topic}</p><ul style="margin-top:20px; padding-left:20px;">`;
  currentWriting.bullets.forEach(b => html += `<li style="margin-bottom:8px;">${b}</li>`);
  html += `</ul>`;
  document.getElementById("overlay-text").innerHTML = html;
  textOverlay.classList.add("active");
}

function closeWritingOverlay() {
  textOverlay.classList.remove("active");
  writingScreen.classList.add("active");
  navFooter.style.display = "flex";
  nextBtn.textContent = "Submit Essay";
  prevBtn.style.visibility = "hidden";
}

// Modify closeTextOverlay to handle writing
function closeTextOverlay() {
  textOverlay.classList.remove("active");
  if (currentWriting) {
    closeWritingOverlay();
  } else {
    quizScreen.classList.add("active");
    navFooter.style.display = "flex";
    buildProgress();
    renderQuestion();
  }
}

// Modify nextQuestion to handle writing submission
function nextQuestion() {
  if (currentWriting) {
    submitEssay();
    return;
  }
  if (currentStep < currentTest.quizData.length - 1) {
    currentStep++;
    renderQuestion();
  } else {
    finishTest();
  }
}

async function submitEssay() {
  const content = document.getElementById('writing-area').value;
  if (!content.trim()) return alert("Please write your essay first.");

  nextBtn.disabled = true;
  nextBtn.textContent = "Submitting...";

  try {
    const res = await fetch('/api/submit-essay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: studentUsername,
        group: currentGroup,
        topicId: currentWriting.id,
        content
      })
    });
    const data = await res.json();
    if (data.success) {
      writingScreen.classList.remove("active");
      navFooter.style.display = "none";
      resultScreen.classList.add("active");
      document.getElementById("final-score").textContent = "Submitted";
      document.getElementById("result-message").textContent = "Your essay has been submitted for correction.";
      document.getElementById("score-breakdown").innerHTML = "";
      document.getElementById("telegram-status").textContent = "";
    } else {
      alert("Failed to submit essay.");
      nextBtn.disabled = false;
      nextBtn.textContent = "Submit Essay";
    }
  } catch (err) {
    alert("Network error.");
    nextBtn.disabled = false;
    nextBtn.textContent = "Submit Essay";
  }
}

// ==========================================
// TEACHER CORRECTION PANEL LOGIC
// ==========================================
async function loadEssays(group) {
  currentGroup = group;
  document.getElementById('grp-sci-btn').classList.toggle('active', group === 'scientific');
  document.getElementById('grp-lit-btn').classList.toggle('active', group === 'literature');
  
  try {
    const res = await fetch(`/api/get-essays-for-correction?group=${group}`);
    const data = await res.json();
    window.essayQueue = data.essays;
    document.getElementById('essay-count').textContent = window.essayQueue.length;
    
    if (window.essayQueue.length > 0) {
      renderNextEssay();
    } else {
      document.getElementById('essay-content').innerHTML = "No essays left for this group.";
      document.getElementById('teacher-notes').value = "";
      document.getElementById('grade-input').value = "";
    }
  } catch (err) {
    console.error(err);
  }
}

function renderNextEssay() {
  if (window.essayQueue.length === 0) {
    document.getElementById('essay-content').innerHTML = "All essays corrected!";
    return;
  }
  
  // Pick random essay
  const randomIdx = Math.floor(Math.random() * window.essayQueue.length);
  currentEssay = window.essayQueue[randomIdx];
  
  document.getElementById('essay-content').innerHTML = `<strong>Student: ${currentEssay.username}</strong><br><br>${currentEssay.content}`;
  document.getElementById('teacher-notes').value = "";
  document.getElementById('grade-input').value = "";
}

function applyAnnotation(className) {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  
  const range = selection.getRangeAt(0);
  const span = document.createElement('span');
  span.className = className;
  
  try {
    range.surroundContents(span);
  } catch (e) {
    span.appendChild(range.extractContents());
    range.insertNode(span);
  }
  selection.removeAllRanges();
}

function clearAnnotation() {
  const selection = window.getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return;
  document.execCommand('removeFormat');
}

async function submitGrade() {
  if (!currentEssay) return;
  
  const grade = document.getElementById('grade-input').value;
  const notes = document.getElementById('teacher-notes').value;
  const correctedContent = document.getElementById('essay-content').innerHTML;
  
  if (!grade || isNaN(grade) || grade < 0 || grade > 100) {
    return alert("Please enter a valid grade between 0 and 100.");
  }

  try {
    const res = await fetch('/api/submit-essay-grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        essayId: currentEssay.id,
        group: currentGroup,
        grade: parseInt(grade),
        notes,
        correctedContent
      })
    });
    const data = await res.json();
    
    if (data.success) {
      // Remove from queue
      window.essayQueue = window.essayQueue.filter(e => e.id !== currentEssay.id);
      document.getElementById('essay-count').textContent = window.essayQueue.length;
      
      if (window.essayQueue.length > 0) {
        renderNextEssay();
      } else {
        document.getElementById('essay-content').innerHTML = "All essays corrected for this group!";
        document.getElementById('teacher-notes').value = "";
        document.getElementById('grade-input').value = "";
      }
    } else {
      alert("Failed to submit grade.");
    }
  } catch (err) {
    alert("Network error.");
  }
}

init();
