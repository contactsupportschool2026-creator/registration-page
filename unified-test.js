/* =========================================================
   Unified Test Engine – loads from tests.md
   ========================================================= */

let ALL_TESTS = {};
let currentTest = null;
let studentUsername = "";

const startScreen   = document.getElementById("start-screen");
const quizScreen    = document.getElementById("quiz-screen");
const resultScreen  = document.getElementById("result-screen");
const textOverlay   = document.getElementById("text-overlay");
const startBtn      = document.getElementById("start-btn");
const usernameInput = document.getElementById("telegram-user");
const testSelect    = document.getElementById("test-select");
const closeTextBtn  = document.getElementById("close-text-btn");
const textBtn       = document.getElementById("text-btn");
const nextBtn       = document.getElementById("next-btn");
const restartBtn    = document.getElementById("restart-btn");
const dictOverlay   = document.getElementById("dict-modal-overlay");
const dictCloseBtn  = document.getElementById("dict-close-btn");
const dictModalText = document.getElementById("dict-modal-text");

// ========== PARSE THE NEW MARKDOWN FORMAT ==========
function parseTestsMD(raw) {
  const tests = {};
  // Split by the big separator
  const blocks = raw.split(/={10,}/).filter(b => b.trim().length > 20);

  blocks.forEach(block => {
    const idMatch    = block.match(/TEST ID:\s*(\d+)/i);
    const titleMatch = block.match(/TITLE:\s*(.+)/i);
    if (!idMatch || !titleMatch) return;

    const id    = idMatch[1].trim();
    const title = titleMatch[1].trim();

    // Extract sections with generous whitespace tolerance
    const textMatch      = block.match(/TEXT:\s*([\s\S]*?)(?=\n\s*DICTIONARY:)/i);
    const dictMatch      = block.match(/DICTIONARY:\s*([\s\S]*?)(?=\n\s*QUESTIONS:)/i);
    const questionsMatch = block.match(/QUESTIONS:\s*([\s\S]*?)(?=\n\s*ANSWERS)/i);
    const answersMatch   = block.match(/ANSWERS[\s\S]*?:\s*([\s\S]*)/i);

    const text      = textMatch ? textMatch[1].trim() : "";
    const dictRaw   = dictMatch ? dictMatch[1].trim() : "";
    const questions = questionsMatch ? questionsMatch[1].trim() : "";
    const answers   = answersMatch ? answersMatch[1].trim() : "";

    // Build dictionary object
    const dictionary = {};
    dictRaw.split("\n").forEach(line => {
      const idx = line.indexOf(":");
      if (idx > 0) {
        const word = line.slice(0, idx).trim();
        const def  = line.slice(idx + 1).trim();
        if (word && def) dictionary[word] = def;
      }
    });

    tests[id] = { id, title, text, dictionary, questions, answers };
  });

  return tests;
}

// ========== INIT ==========
async function init() {
  try {
    const res = await fetch("tests.md");
    if (!res.ok) throw new Error("tests.md not found");
    const raw = await res.text();
    ALL_TESTS = parseTestsMD(raw);

    // Fill dropdown
    testSelect.innerHTML = '<option value="" disabled selected>Choose a test...</option>';
    Object.values(ALL_TESTS)
      .sort((a, b) => a.id.localeCompare(b.id))
      .forEach(t => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.title;
        testSelect.appendChild(opt);
      });

    console.log("Loaded tests:", Object.keys(ALL_TESTS));
  } catch (err) {
    console.error(err);
    testSelect.innerHTML = '<option value="">Error loading tests.md</option>';
    alert("Could not load tests.md. Make sure it is in the same folder as the HTML file.");
  }

  function checkReady() {
    startBtn.disabled = !(usernameInput.value.trim() && testSelect.value);
  }
  usernameInput.addEventListener("input", checkReady);
  testSelect.addEventListener("change", checkReady);

  startBtn.addEventListener("click", startTest);
  closeTextBtn.addEventListener("click", closeTextOverlay);
  textBtn.addEventListener("click", openTextOverlay);
  nextBtn.addEventListener("click", finishTest);
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
      alert("Username not found. Make sure your account is linked.");
      startBtn.disabled = false;
      startBtn.textContent = "Continue";
      return;
    }
  } catch (e) {
    console.warn("Backend check skipped (offline or CORS)");
  }

  startBtn.disabled = false;
  startBtn.textContent = "Continue";
  startScreen.classList.remove("active");
  openTextOverlay();
}

function openTextOverlay() {
  if (!currentTest) return;

  document.getElementById("overlay-title").textContent = currentTest.title;

  const paragraphs = currentTest.text.split(/\n\s*\n/).filter(p => p.trim());
  let html = paragraphs.map(p => `<p>${highlightWords(p.trim(), currentTest.dictionary)}</p>`).join("");

  document.getElementById("overlay-text").innerHTML = html;
  textOverlay.classList.add("active");

  // Clickable dictionary words
  document.querySelectorAll(".dict-word").forEach(el => {
    el.onclick = () => openDictionary(el.dataset.word);
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

  // SHOW THE QUESTIONS
  document.getElementById("q-title").textContent = currentTest.title;
  document.getElementById("questions-display").textContent = currentTest.questions || "No questions found for this test.";
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
    }, 60);
  }
}

function finishTest() {
  quizScreen.classList.remove("active");
  resultScreen.classList.add("active");
  document.getElementById("final-score").textContent = "Completed";
}

// Start everything
init();
