const PASS_THRESHOLD = 22;
const TEST_SIZE = 26;
const STORAGE_KEY = "seaskipper-learning-progress-v1";

const appState = {
  questions: [],
  byId: new Map(),
  learning: {
    mode: "sequential",
    order: [],
    currentIndex: 0,
    selectedAnswerIndex: null,
    progress: {
      goodIds: [],
      badIds: [],
      answersById: {}
    }
  },
  testing: {
    order: [],
    currentIndex: 0,
    selectedById: {},
    finished: false
  }
};

const views = {
  home: document.getElementById("homeView"),
  learningSetup: document.getElementById("learningSetupView"),
  learning: document.getElementById("learningView"),
  testing: document.getElementById("testingView")
};

init();

async function init() {
  bindNavigation();
  bindLearningSetup();
  bindLearningActions();
  bindTestingActions();

  await loadQuestions();
  loadLearningProgress();
  refreshLearningStats();
  showView("home");
}

async function loadQuestions() {
  const response = await fetch("./intrebari_c.json");
  if (!response.ok) {
    throw new Error("Nu pot încărca intrebari_c.json");
  }

  appState.questions = await response.json();
  appState.byId = new Map(appState.questions.map((question) => [question.id, question]));
  document.getElementById("learningTotalCount").textContent = String(appState.questions.length);
}

function bindNavigation() {
  document.getElementById("goLearning").addEventListener("click", () => {
    refreshLearningStats();
    showView("learningSetup");
  });

  document.getElementById("goTesting").addEventListener("click", () => {
    startTesting();
    showView("testing");
  });

  document.querySelectorAll("[data-back-home]").forEach((button) => {
    button.addEventListener("click", () => {
      refreshLearningStats();
      showView("home");
    });
  });
}

function bindLearningSetup() {
  document.getElementById("learningSequential").addEventListener("click", () => {
    startLearning("sequential");
    showView("learning");
  });

  document.getElementById("learningRandom").addEventListener("click", () => {
    startLearning("random");
    showView("learning");
  });

  document.getElementById("learningBackSetup").addEventListener("click", () => {
    refreshLearningStats();
    showView("learningSetup");
  });
}

function bindLearningActions() {
  document.getElementById("learningPrev").addEventListener("click", () => {
    appState.learning.currentIndex = Math.max(0, appState.learning.currentIndex - 1);
    appState.learning.selectedAnswerIndex = null;
    renderLearningQuestion();
  });

  document.getElementById("learningNext").addEventListener("click", () => {
    appState.learning.currentIndex = Math.min(appState.learning.order.length - 1, appState.learning.currentIndex + 1);
    appState.learning.selectedAnswerIndex = null;
    renderLearningQuestion();
  });

  document.getElementById("learningSubmit").addEventListener("click", submitLearningAnswer);
}

function startLearning(mode) {
  appState.learning.mode = mode;
  const ids = appState.questions.map((question) => question.id);
  appState.learning.order = mode === "random" ? shuffled(ids) : ids;
  appState.learning.currentIndex = 0;
  appState.learning.selectedAnswerIndex = null;
  renderLearningQuestion();
  renderReviewLists();
}

function renderLearningQuestion() {
  const learning = appState.learning;
  const id = learning.order[learning.currentIndex];
  const question = appState.byId.get(id);

  if (!question) {
    return;
  }

  document.getElementById("learningQuestionId").textContent = `ID #${question.id}`;
  document.getElementById("learningQuestionText").textContent = question.question;
  document.getElementById("learningPosition").textContent = `Întrebarea ${learning.currentIndex + 1} / ${learning.order.length}`;
  document.getElementById("learningModeBadge").textContent = learning.mode === "random" ? "Random" : "De la început";

  const completed = Object.keys(learning.progress.answersById).length;
  const pct = learning.order.length ? Math.round((completed / learning.order.length) * 100) : 0;
  document.getElementById("learningProgressFill").style.width = `${pct}%`;

  const answersWrap = document.getElementById("learningAnswers");
  answersWrap.innerHTML = "";

  question.answers.forEach((answer, answerIndex) => {
    const label = document.createElement("label");
    label.className = "answer-option";
    if (learning.selectedAnswerIndex === answerIndex) {
      label.classList.add("selected");
    }

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "learning-answer";
    input.checked = learning.selectedAnswerIndex === answerIndex;
    input.addEventListener("change", () => {
      learning.selectedAnswerIndex = answerIndex;
      renderLearningQuestion();
    });

    const text = document.createElement("span");
    text.textContent = answer.text;

    label.append(input, text);
    answersWrap.appendChild(label);
  });

  const saved = learning.progress.answersById[id];
  const feedback = document.getElementById("learningFeedback");
  feedback.textContent = saved == null ? "" : saved ? "Ai răspuns corect la această întrebare." : "Încă este marcată greșit. Poți reîncerca.";
  feedback.className = `feedback ${saved == null ? "" : saved ? "ok" : "bad"}`;

  document.getElementById("learningPrev").disabled = learning.currentIndex === 0;
  document.getElementById("learningNext").disabled = learning.currentIndex === learning.order.length - 1;
}

function submitLearningAnswer() {
  const learning = appState.learning;
  const id = learning.order[learning.currentIndex];
  const question = appState.byId.get(id);

  if (learning.selectedAnswerIndex == null || !question) {
    return;
  }

  const isCorrect = Boolean(question.answers[learning.selectedAnswerIndex]?.correct);
  learning.progress.answersById[id] = isCorrect;

  const goodSet = new Set(learning.progress.goodIds);
  const badSet = new Set(learning.progress.badIds);

  if (isCorrect) {
    goodSet.add(id);
    badSet.delete(id);
  } else {
    badSet.add(id);
    goodSet.delete(id);
  }

  learning.progress.goodIds = [...goodSet].sort((a, b) => a - b);
  learning.progress.badIds = [...badSet].sort((a, b) => a - b);

  saveLearningProgress();
  refreshLearningStats();
  renderLearningQuestion();
  renderReviewLists();
}

function refreshLearningStats() {
  const total = appState.questions.length || 1;
  const good = appState.learning.progress.goodIds.length;
  const bad = appState.learning.progress.badIds.length;
  const answered = Object.keys(appState.learning.progress.answersById).length;
  const completedPct = Math.round((answered / total) * 100);

  document.getElementById("learningGoodCount").textContent = String(good);
  document.getElementById("learningBadCount").textContent = String(bad);
  document.getElementById("learningCompletedPct").textContent = `${completedPct}%`;

  const reviewGoodCount = document.getElementById("reviewGoodCount");
  const reviewBadCount = document.getElementById("reviewBadCount");
  if (reviewGoodCount) {
    reviewGoodCount.textContent = String(good);
  }
  if (reviewBadCount) {
    reviewBadCount.textContent = String(bad);
  }
}

function renderReviewLists() {
  const goodWrap = document.getElementById("reviewGoodList");
  const badWrap = document.getElementById("reviewBadList");

  goodWrap.innerHTML = "";
  badWrap.innerHTML = "";

  appState.learning.progress.goodIds.forEach((id) => {
    goodWrap.appendChild(makeJumpChip(id, "good"));
  });

  appState.learning.progress.badIds.forEach((id) => {
    badWrap.appendChild(makeJumpChip(id, "bad"));
  });

  refreshLearningStats();
}

function makeJumpChip(id, type) {
  const button = document.createElement("button");
  button.className = `chip ${type}`;
  button.textContent = `ID ${id}`;
  button.addEventListener("click", () => {
    const index = appState.learning.order.indexOf(id);
    if (index >= 0) {
      appState.learning.currentIndex = index;
      appState.learning.selectedAnswerIndex = null;
      renderLearningQuestion();
      return;
    }

    appState.learning.order = [id, ...appState.learning.order.filter((qId) => qId !== id)];
    appState.learning.currentIndex = 0;
    appState.learning.selectedAnswerIndex = null;
    renderLearningQuestion();
  });
  return button;
}

function saveLearningProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState.learning.progress));
}

function loadLearningProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return;
    }

    appState.learning.progress = {
      goodIds: Array.isArray(parsed.goodIds) ? parsed.goodIds : [],
      badIds: Array.isArray(parsed.badIds) ? parsed.badIds : [],
      answersById: parsed.answersById && typeof parsed.answersById === "object" ? parsed.answersById : {}
    };
  } catch {
    appState.learning.progress = { goodIds: [], badIds: [], answersById: {} };
  }
}

function bindTestingActions() {
  document.getElementById("testingPrev").addEventListener("click", () => {
    appState.testing.currentIndex = Math.max(0, appState.testing.currentIndex - 1);
    renderTestingQuestion();
  });

  document.getElementById("testingNext").addEventListener("click", () => {
    appState.testing.currentIndex = Math.min(TEST_SIZE - 1, appState.testing.currentIndex + 1);
    renderTestingQuestion();
  });

  document.getElementById("testingRestart").addEventListener("click", startTesting);
  document.getElementById("testingFinish").addEventListener("click", finishTesting);
}

function startTesting() {
  appState.testing.order = takeRandom(appState.questions.map((question) => question.id), TEST_SIZE);
  appState.testing.currentIndex = 0;
  appState.testing.selectedById = {};
  appState.testing.finished = false;

  const result = document.getElementById("testingResult");
  result.className = "result hidden";
  result.innerHTML = "";

  renderTestingQuestion();
}

function renderTestingQuestion() {
  const testing = appState.testing;
  const id = testing.order[testing.currentIndex];
  const question = appState.byId.get(id);
  if (!question) {
    return;
  }

  document.getElementById("testingQuestionId").textContent = `ID #${question.id}`;
  document.getElementById("testingQuestionText").textContent = question.question;
  document.getElementById("testingPosition").textContent = `Întrebarea ${testing.currentIndex + 1} / ${TEST_SIZE}`;

  const answeredCount = Object.keys(testing.selectedById).length;
  document.getElementById("testingAnswered").textContent = `Răspunsuri date: ${answeredCount} / ${TEST_SIZE}`;
  document.getElementById("testingProgressFill").style.width = `${Math.round((answeredCount / TEST_SIZE) * 100)}%`;

  const answersWrap = document.getElementById("testingAnswers");
  answersWrap.innerHTML = "";

  question.answers.forEach((answer, answerIndex) => {
    const label = document.createElement("label");
    label.className = "answer-option";

    const selected = testing.selectedById[id] === answerIndex;
    if (selected) {
      label.classList.add("selected");
    }

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "testing-answer";
    input.checked = selected;
    input.addEventListener("change", () => {
      testing.selectedById[id] = answerIndex;
      renderTestingQuestion();
    });

    const text = document.createElement("span");
    text.textContent = answer.text;

    label.append(input, text);
    answersWrap.append(label);
  });

  document.getElementById("testingPrev").disabled = testing.currentIndex === 0;
  document.getElementById("testingNext").disabled = testing.currentIndex === TEST_SIZE - 1;
}

function finishTesting() {
  const testing = appState.testing;
  const answeredCount = Object.keys(testing.selectedById).length;

  if (answeredCount < TEST_SIZE) {
    const missing = TEST_SIZE - answeredCount;
    const result = document.getElementById("testingResult");
    result.className = "result fail";
    result.innerHTML = `
      <h3>Test incomplet</h3>
      <p>Mai ai <strong>${missing}</strong> întrebări fără răspuns.</p>
      <p>Completează toate cele ${TEST_SIZE} întrebări pentru evaluare.</p>
    `;
    return;
  }

  let correct = 0;

  testing.order.forEach((id) => {
    const question = appState.byId.get(id);
    const selectedIndex = testing.selectedById[id];
    if (selectedIndex == null || !question) {
      return;
    }

    if (question.answers[selectedIndex]?.correct) {
      correct += 1;
    }
  });

  const passed = correct >= PASS_THRESHOLD;
  const result = document.getElementById("testingResult");
  result.className = `result ${passed ? "pass" : "fail"}`;
  result.innerHTML = `
    <h3>${passed ? "Promovat" : "Nepromovat"}</h3>
    <p>Scor: <strong>${correct}</strong> din ${TEST_SIZE}</p>
    <p>Prag promovare: ${PASS_THRESHOLD} / ${TEST_SIZE}</p>
  `;
}

function showView(next) {
  Object.entries(views).forEach(([name, section]) => {
    section.classList.toggle("hidden", name !== next);
  });
}

function shuffled(array) {
  const copy = [...array];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function takeRandom(array, count) {
  const shuffledItems = shuffled(array);
  return shuffledItems.slice(0, Math.min(count, shuffledItems.length));
}
