/* =========================================================
   Unified Test Engine
   Loads ALL tests from tests.md
   ========================================================= */

let ALL_TESTS = {};
let currentTest = null;
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

// ========== PARSE MARKDOWN ==========
function parseTestsMD(raw) {
  const blocks = raw.split("===TEST===").filter(b => b.trim());
  const tests = {};

  blocks.forEach(block => {
    const idMatch = block.match(/ID:\s*(.+)/);
    const titleMatch = block.match(/TITLE:\s*(.+)/);
    const textMatch = block.match(/TEXT:\s*([\s\S]*?)(?=DICT:)/);
    const dictMatch = block.match(/DICT:\s*([\s\S]*?)(?=QUESTIONS:)/);
    const questionsMatch = block.match(/QUESTIONS:\s*([\s\S]*)/);

    if (!idMatch || !titleMatch) return;

    const id = idMatch[1].trim();
    const title = titleMatch[1].trim();
    const text = textMatch ? textMatch[1].trim() : "";
    const dictRaw = dictMatch ? dictMatch[1].trim() : "";
    const questions = questionsMatch ? questionsMatch[1].trim() : "";

    const dictionary = {};
    dictRaw.split("\n").forEach(line => {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const word = line.slice(0, idx).trim();
        const def = line.slice(idx + 1).trim();
        if (word && def) dictionary[word] = def;
      }
    });

    tests[id] = { id, title, text, dictionary, questions };
  });

  return tests;
}

// ========== INIT ==========
async function init() {
  try {
    const res = await fetch("tests.md");
    const raw = await res.text();
    ALL_TESTS = parseTestsMD(raw);

    // Fill dropdown
    testSelect.innerHTML = '<option value="" disabled selected>Choose a test...</option>';
    Object.values(ALL_TESTS).forEach(t => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = t.title;
      testSelect.appendChild(opt);
    });

    console.log("Loaded tests:", Object.keys(ALL_TESTS));
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
  restartBtn.addEventListener("click", () => {
    resultScreen.classList.remove("active");
    quizScreen.classList.remove("active");
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
  // Show questions area
  document.getElementById("question-content").innerHTML = `
    <div class="question-title">${currentTest.title}</div>
    <pre style="white-space:pre-wrap;font-size:0.9rem;line-height:1.5;background:#f8f8f8;padding:14px;border-radius:10px;overflow:auto;max-height:50vh;">${currentTest.questions || "Questions will be rendered here."}</pre>
    <p style="margin-top:14px;font-size:0.85rem;color:#666;">Full interactive question types (MCQ / T-F / ordering / text) can be added next. The Text + Dictionary system is fully working.</p>
  `;
}

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
