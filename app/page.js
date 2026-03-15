"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { Timestamp, doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db, firebaseReady } from "../lib/firebaseClient";

const PASS_THRESHOLD = 22;
const TEST_SIZE = 26;
const STORAGE_KEY = "seaskipper-learning-progress-v2";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function withBasePath(path) {
  return `${BASE_PATH}${path}`;
}

export default function HomePage() {
  const [view, setView] = useState("home");
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [authUser, setAuthUser] = useState(null);
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [profileUsername, setProfileUsername] = useState("");

  const [learning, setLearning] = useState({
    mode: "sequential",
    order: [],
    currentIndex: 0,
    selectedAnswerIndex: null,
    showFeedback: false,
    progress: {
      goodIds: [],
      badIds: [],
      answersById: {},
      submittedAnswerIndexById: {}
    }
  });

  const [testing, setTesting] = useState({
    order: [],
    currentIndex: 0,
    selectedById: {},
    result: null,
    loading: false
  });

  const questionsById = useMemo(
    () => new Map(questions.map((question) => [question.id, question])),
    [questions]
  );

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch(withBasePath("/intrebari_c.json"));
        if (!response.ok) {
          throw new Error("Nu am putut încărca întrebările");
        }

        const data = await response.json();
        if (mounted) {
          setQuestions(Array.isArray(data) ? data : []);
        }
      } catch {
        if (mounted) {
          setLoadError("Întrebările nu pot fi încărcate momentan.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  function normalizeUsername(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function isValidUsername(value) {
    const username = normalizeUsername(value);
    return /^[a-z0-9._-]{3,20}$/.test(username);
  }

  function usernameToEmail(value) {
    return `${normalizeUsername(value)}@seaskipper.local`;
  }

  async function ensureProgressDoc(uid) {
    if (!db) {
      return;
    }

    const now = Timestamp.now();
    const progressRef = doc(db, "users", uid, "progress", "main");
    const progressSnap = await getDoc(progressRef);
    if (!progressSnap.exists()) {
      await setDoc(progressRef, {
        schemaVersion: 1,
        goodIds: [],
        badIds: [],
        answersById: {},
        submittedAnswerIndexById: {},
        updatedAt: now
      });
    }
  }

  async function readProgressFromFirestore(uid) {
    if (!db) return null;
    try {
      const progressRef = doc(db, "users", uid, "progress", "main");
      const snap = await getDoc(progressRef);
      if (snap.exists()) {
        const data = snap.data();
        return {
          goodIds: Array.isArray(data?.goodIds) ? data.goodIds : [],
          badIds: Array.isArray(data?.badIds) ? data.badIds : [],
          answersById: typeof data?.answersById === "object" ? data.answersById : {},
          submittedAnswerIndexById: typeof data?.submittedAnswerIndexById === "object" ? data.submittedAnswerIndexById : {}
        };
      }
    } catch (error) {
      console.error("Error reading progress from Firestore:", error);
    }
    return null;
  }

  async function writeProgressToFirestore(uid, progress) {
    if (!db) return;
    try {
      const progressRef = doc(db, "users", uid, "progress", "main");
      await setDoc(progressRef, {
        schemaVersion: 1,
        goodIds: progress.goodIds,
        badIds: progress.badIds,
        answersById: progress.answersById,
        submittedAnswerIndexById: progress.submittedAnswerIndexById,
        updatedAt: Timestamp.now()
      });
    } catch (error) {
      console.error("Error writing progress to Firestore:", error);
    }
  }

  useEffect(() => {
    if (!firebaseReady || !auth) {
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      setAuthError("");

      if (!user) {
        setProfileUsername("");
        return;
      }

      setAuthPanelOpen(false);

      if (!db) {
        return;
      }

      try {
        const now = Timestamp.now();
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const data = userSnap.data();
          setProfileUsername(typeof data?.username === "string" ? data.username : "");
          await setDoc(userRef, { updatedAt: now }, { merge: true });
        }

        await ensureProgressDoc(user.uid);

        // Read progress from Firestore
        const firestoreProgress = await readProgressFromFirestore(user.uid);
        if (firestoreProgress) {
          setLearning((prev) => ({
            ...prev,
            progress: firestoreProgress
          }));
        }
      } catch {
        setAuthError(
          "Autentificarea a reușit, dar nu pot inițializa progresul în Firestore momentan."
        );
      }
    });

    return () => unsubscribe();
  }, []);

  function openAuthPanel(mode) {
    setAuthMode(mode);
    setAuthPanelOpen(true);
    setAuthError("");
  }

  async function registerWithEmailPassword() {
    if (!firebaseReady || !auth) {
      setAuthError("Firebase nu este configurat (verifică .env.local).");
      return;
    }

    const username = normalizeUsername(authUsername);
    const password = authPassword;

    if (!username || !password) {
      setAuthError("Introdu username și parolă.");
      return;
    }

    if (!isValidUsername(username)) {
      setAuthError("Username invalid (3-20, litere/cifre și . _ -). ");
      return;
    }

    if (password.length < 6) {
      setAuthError("Parola trebuie să aibă minim 6 caractere.");
      return;
    }

    const email = usernameToEmail(username);

    setAuthBusy(true);
    setAuthError("");

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await createProfileDocs(cred.user.uid, username);
      setProfileUsername(username);
      setAuthPassword("");
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Register error", error);
      const code = typeof error?.code === "string" ? error.code : "";
      if (code === "auth/email-already-in-use") {
        setAuthError("Username deja folosit. Alege alt username sau Login.");
      } else if (code === "auth/invalid-email") {
        setAuthError("Username invalid.");
      } else if (code === "auth/weak-password") {
        setAuthError("Parolă prea slabă (minim 6 caractere).");
      } else if (code === "auth/operation-not-allowed" || code === "auth/configuration-not-found") {
        setAuthError(
          "Autentificarea nu este activată în Firebase. Mergi la Firebase Console → Authentication → Sign-in method și activează Email/Password."
        );
      } else if (code === "auth/network-request-failed") {
        setAuthError("Eroare de rețea. Încearcă din nou.");
      } else if (code === "auth/too-many-requests") {
        setAuthError("Prea multe încercări. Așteaptă puțin și încearcă din nou.");
      } else {
        setAuthError("Nu pot crea contul momentan.");
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function loginWithEmailPassword() {
    if (!firebaseReady || !auth) {
      setAuthError("Firebase nu este configurat (verifică .env.local).");
      return;
    }

    const username = normalizeUsername(authUsername);
    const password = authPassword;

    if (!username || !password) {
      setAuthError("Introdu username și parolă.");
      return;
    }

    if (!isValidUsername(username)) {
      setAuthError("Username invalid.");
      return;
    }

    const email = usernameToEmail(username);

    setAuthBusy(true);
    setAuthError("");

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setProfileUsername(username);
      setAuthPassword("");
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Login error", error);
      const code = typeof error?.code === "string" ? error.code : "";
      if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
        setAuthError("Username sau parolă greșită.");
      } else if (code === "auth/user-not-found") {
        setAuthError("Cont inexistent. Folosește Register.");
      } else if (code === "auth/user-disabled") {
        setAuthError("Cont dezactivat.");
      } else if (code === "auth/network-request-failed") {
        setAuthError("Eroare de rețea. Încearcă din nou.");
      } else if (code === "auth/too-many-requests") {
        setAuthError("Prea multe încercări. Așteaptă puțin și încearcă din nou.");
      } else {
        setAuthError("Nu pot face login momentan.");
      }
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    if (!auth) {
      return;
    }

    setAuthBusy(true);
    setAuthError("");
    try {
      await signOut(auth);
    } finally {
      setAuthBusy(false);
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw);
      setLearning((prev) => ({
        ...prev,
        progress: {
          goodIds: Array.isArray(parsed?.goodIds) ? parsed.goodIds : [],
          badIds: Array.isArray(parsed?.badIds) ? parsed.badIds : [],
          answersById:
            parsed?.answersById && typeof parsed.answersById === "object"
              ? parsed.answersById
              : {},
          submittedAnswerIndexById:
            parsed?.submittedAnswerIndexById &&
            typeof parsed.submittedAnswerIndexById === "object"
              ? parsed.submittedAnswerIndexById
              : {}
        }
      }));
    } catch {
      // ignore invalid localStorage data
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(learning.progress));
  }, [learning.progress]);

  useEffect(() => {
    if (!authUser) {
      return;
    }

    const timeoutId = setTimeout(() => {
      writeProgressToFirestore(authUser.uid, learning.progress);
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [authUser, learning.progress]);

  useEffect(() => {
    if (!authPanelOpen) {
      return;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setAuthPanelOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [authPanelOpen]);

  const answeredLearningCount = Object.keys(learning.progress.answersById).length;
  const learningCompletion = questions.length
    ? Math.round((answeredLearningCount / questions.length) * 100)
    : 0;

  const learningQuestionId = learning.order[learning.currentIndex];
  const learningQuestion = questionsById.get(learningQuestionId);
  const learningSaved =
    learningQuestionId != null
      ? learning.progress.answersById[learningQuestionId]
      : null;
  const learningSubmittedIndex =
    learningQuestionId != null
      ? learning.progress.submittedAnswerIndexById[learningQuestionId]
      : null;

  const testingQuestionId = testing.order[testing.currentIndex];
  const testingQuestion = questionsById.get(testingQuestionId);
  const testingAnsweredCount = Object.keys(testing.selectedById).length;

  function openLearningSetup() {
    setView("learningSetup");
  }

  function startLearning(mode) {
    const allIds = questions.map((question) => question.id);
    const answeredIds = Object.keys(learning.progress.answersById)
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id));
    const lastAnsweredId = answeredIds.length ? Math.max(...answeredIds) : null;
    const continueFromIndex =
      lastAnsweredId == null
        ? 0
        : Math.min(Math.max(allIds.indexOf(lastAnsweredId) + 1, 0), Math.max(allIds.length - 1, 0));
    const order =
      mode === "mistakes"
        ? [...learning.progress.badIds]
        : mode === "random"
          ? shuffle(allIds)
          : allIds;

    if (!order.length) {
      return;
    }

    setLearning((prev) => ({
      ...prev,
      mode,
      order,
      currentIndex: mode === "continue" ? continueFromIndex : 0,
      selectedAnswerIndex: null,
      showFeedback: false
    }));
    setView("learning");
  }

  function submitLearningAnswer() {
    if (!learningQuestion || learning.selectedAnswerIndex == null) {
      return;
    }

    setLearning((prev) => ({
      ...prev,
      showFeedback: true
    }));

    const isCorrect = Boolean(
      learningQuestion.answers?.[learning.selectedAnswerIndex]?.correct
    );

    setLearning((prev) => {
      const id = prev.order[prev.currentIndex];
      const goodSet = new Set(prev.progress.goodIds);
      const badSet = new Set(prev.progress.badIds);

      if (isCorrect) {
        goodSet.add(id);
        badSet.delete(id);
      } else {
        badSet.add(id);
        goodSet.delete(id);
      }

      return {
        ...prev,
        progress: {
          answersById: {
            ...prev.progress.answersById,
            [id]: isCorrect
          },
          goodIds: [...goodSet].sort((a, b) => a - b),
          badIds: [...badSet].sort((a, b) => a - b),
          submittedAnswerIndexById: {
            ...prev.progress.submittedAnswerIndexById,
            [id]: prev.selectedAnswerIndex
          }
        }
      };
    });
  }

  function jumpToLearningId(id) {
    setLearning((prev) => {
      let order = prev.order;
      let index = order.indexOf(id);

      if (index === -1) {
        order = [id, ...order.filter((item) => item !== id)];
        index = 0;
      }

      const savedAnswerIndex = prev.progress.submittedAnswerIndexById[id];
      const hasAnswered =
        id in prev.progress.answersById && Number.isInteger(savedAnswerIndex);

      return {
        ...prev,
        order,
        currentIndex: index,
        selectedAnswerIndex: hasAnswered ? savedAnswerIndex : null,
        showFeedback: hasAnswered
      };
    });
    setView("learning");
  }

  async function startTesting() {
    setLoadError("");
    setTesting((prev) => ({ ...prev, loading: true }));

    try {
      const testQuestions = shuffle(questions).slice(0, Math.min(TEST_SIZE, questions.length));
      const order = testQuestions.map((question) => question.id);

      setTesting({
        order,
        currentIndex: 0,
        selectedById: {},
        result: null,
        loading: false
      });
      setView("testing");
    } catch {
      setTesting((prev) => ({ ...prev, loading: false }));
      setLoadError("Testul nu poate fi generat momentan.");
    }
  }

  async function finishTesting() {
    setTesting((prev) => ({ ...prev, loading: true }));

    try {
      const answeredCount = Object.keys(testing.selectedById).length;

      if (answeredCount < TEST_SIZE) {
        setTesting((prev) => ({
          ...prev,
          loading: false,
          result: {
            complete: false,
            missing: TEST_SIZE - answeredCount,
            correct: 0,
            passed: false,
            threshold: PASS_THRESHOLD,
            total: TEST_SIZE,
            wrongAnswers: []
          }
        }));
        return;
      }

      let correct = 0;
      const wrongAnswers = testing.order
        .map((id) => {
          const question = questionsById.get(id);
          const selectedIndex = testing.selectedById[id];

          if (!question || selectedIndex == null) {
            return null;
          }

          const selectedAnswer = question.answers?.[selectedIndex];
          const correctAnswer = question.answers?.find((answer) => answer.correct);

          if (selectedAnswer?.correct) {
            correct += 1;
            return null;
          }

          return {
            id: question.id,
            question: question.question,
            selectedAnswer: selectedAnswer?.text || "-",
            correctAnswer: correctAnswer?.text || "-"
          };
        })
        .filter(Boolean);

      const payload = {
        complete: true,
        correct,
        passed: correct >= PASS_THRESHOLD,
        threshold: PASS_THRESHOLD,
        total: TEST_SIZE,
        wrongAnswers
      };

      setTesting((prev) => ({
        ...prev,
        loading: false,
        result: payload
      }));
    } catch {
      setTesting((prev) => ({
        ...prev,
        loading: false,
        result: {
          complete: false,
          missing: TEST_SIZE,
          correct: 0,
          passed: false,
          threshold: PASS_THRESHOLD,
          total: TEST_SIZE,
          wrongAnswers: [],
          error: true
        }
      }));
    }
  }

  function getLearningAnswerTone(answer, answerIndex) {
    if (!learning.showFeedback || learningSubmittedIndex == null) {
      return "";
    }

    if (learningSaved === false) {
      if (answer.correct) {
        return " correct";
      }

      if (learningSubmittedIndex === answerIndex) {
        return " wrong";
      }
    }

    if (learningSaved === true && learningSubmittedIndex === answerIndex) {
      return " correct";
    }

    return "";
  }

  function renderHome() {
    return (
      <>
        <section className="hero-card">
          <div>
            <span className="eyebrow">Dashboard</span>
            <h2>Progresul tău</h2>
            <div className="actions-inline">
              <button className="btn primary" onClick={openLearningSetup}>
                Începe învățarea
              </button>
              <button className="btn" onClick={startTesting}>
                Generează un test
              </button>
            </div>
          </div>
          <div className="hero-panel">
            <div className="hero-stat">
              <span>Completare</span>
              <strong>{learningCompletion}%</strong>
            </div>
            <div className="hero-stat">
              <span>Corecte</span>
              <strong>{learning.progress.goodIds.length}</strong>
            </div>
            <div className="hero-stat">
              <span>Greșite</span>
              <strong>{learning.progress.badIds.length}</strong>
            </div>
          </div>
        </section>

        <section className="mode-grid">
          <article className="card mode-card">
            <span className="badge">Learning</span>
            <h3>Învățare</h3>
            <p className="muted">Feedback instant, cu evidențiere clară la greșeli.</p>
            <button className="btn primary" onClick={openLearningSetup}>
              Deschide Learning
            </button>
          </article>

          <article className="card mode-card">
            <span className="badge">Testing</span>
            <h3>Testare</h3>
            <p className="muted">26 întrebări random, prag {PASS_THRESHOLD} corecte.</p>
            <button className="btn" onClick={startTesting}>
              Începe un test
            </button>
          </article>
        </section>
      </>
    );
  }

  function renderAuthPanel() {
    if (!authPanelOpen) {
      return null;
    }

    const title = authMode === "register" ? "Creează cont" : "Autentificare";
    const primaryAction = authMode === "register" ? registerWithEmailPassword : loginWithEmailPassword;
    const primaryLabel = authMode === "register" ? "Register" : "Login";

    return (
      <div className="auth-overlay" onClick={() => setAuthPanelOpen(false)}>
        <section className="card auth-panel" onClick={(event) => event.stopPropagation()}>
          <div className="row-between wrap-gap">
            <div>
              <span className="eyebrow">Cont</span>
              <h2>{title}</h2>
            </div>
            <button className="btn ghost" onClick={() => setAuthPanelOpen(false)}>
              Inchide
            </button>
          </div>

          {!firebaseReady ? (
            <p className="muted">Firebase nu este configurat. Completează valorile din .env.local.</p>
          ) : (
            <div className="auth-form">
              <label className="field">
                <span className="field-label">Username</span>
                <input
                  className="input"
                  type="text"
                  value={authUsername}
                  onChange={(event) => setAuthUsername(event.target.value)}
                  placeholder="ex: Panseluță_01"
                  autoComplete="username"
                />
              </label>

              <label className="field">
                <span className="field-label">Parolă</span>
                <input
                  className="input"
                  type="password"
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                  placeholder="minim 6 caractere"
                  autoComplete={authMode === "register" ? "new-password" : "current-password"}
                />
              </label>

              <div className="actions-inline">
                <button className="btn primary" onClick={primaryAction} disabled={authBusy}>
                  {authBusy ? "Se lucrează..." : primaryLabel}
                </button>
                <button
                  className="btn"
                  onClick={() => openAuthPanel(authMode === "register" ? "login" : "register")}
                  disabled={authBusy}
                >
                  {authMode === "register" ? "Am deja cont" : "Creează cont"}
                </button>
              </div>
            </div>
          )}

          {authError ? <p className="result fail compact-text">{authError}</p> : null}
        </section>
      </div>
    );
  }

  function renderLearningSetup() {
    const hasMistakes = learning.progress.badIds.length > 0;
    const allIds = questions.map((question) => question.id);
    const answeredIds = Object.keys(learning.progress.answersById)
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id));
    const lastAnsweredId = answeredIds.length ? Math.max(...answeredIds) : null;
    const continueFromId =
      lastAnsweredId == null
        ? allIds[0]
        : allIds[Math.min(Math.max(allIds.indexOf(lastAnsweredId) + 1, 0), Math.max(allIds.length - 1, 0))];

    return (
      <section className="card">
        <div className="row-between wrap-gap">
          <div>
            <span className="eyebrow">Learning Journey</span>
            <h2>Alege cum vrei să studiezi</h2>
          </div>
          <button className="btn ghost" onClick={() => setView("home")}>
            Înapoi
          </button>
        </div>

        <p className="muted">
          Poți continua de unde ai rămas, începe de la prima întrebare, în ordine random sau doar cu întrebările greșite.
        </p>

        <div className="grid two action-cards">
          <button className="action-card" onClick={() => startLearning("continue")}>
            <strong>Continuă de unde ai rămas</strong>
            <span>
              {continueFromId != null
                ? `Reiei în ordine de la întrebarea ID ${continueFromId}.`
                : "Nu există întrebări disponibile încă."}
            </span>
          </button>

          <button
            className="action-card action-card-primary"
            onClick={() => startLearning("sequential")}
          >
            <strong>Start de la început</strong>
            <span>Parcurgi toată baza în ordine.</span>
          </button>

          <button className="action-card" onClick={() => startLearning("random")}>
            <strong>Start random</strong>
            <span>Întrebări amestecate pentru retenție mai bună.</span>
          </button>

          <button
            className="action-card"
            onClick={() => startLearning("mistakes")}
            disabled={!hasMistakes}
          >
            <strong>Parcurge greșelile</strong>
            <span>
              {hasMistakes
                ? `${learning.progress.badIds.length} întrebări de revizuit.`
                : "Nu ai greșeli salvate momentan."}
            </span>
          </button>
        </div>

        <div className="stats-grid">
          <div className="stat">
            <span>Total întrebări</span>
            <strong>{questions.length}</strong>
          </div>
          <div className="stat">
            <span>Corecte</span>
            <strong>{learning.progress.goodIds.length}</strong>
          </div>
          <div className="stat">
            <span>Greșite</span>
            <strong>{learning.progress.badIds.length}</strong>
          </div>
          <div className="stat">
            <span>Completare</span>
            <strong>{learningCompletion}%</strong>
          </div>
        </div>
      </section>
    );
  }

  function renderLearning() {
    if (!learningQuestion) {
      return (
        <section className="card empty-state">
          <h2>Nu există întrebări în această sesiune</h2>
          <p className="muted">Încearcă un alt mod de învățare sau revino la setări.</p>
          <div className="actions-inline">
            <button className="btn primary" onClick={openLearningSetup}>
              Înapoi la Learning
            </button>
            <button className="btn" onClick={() => setView("home")}>
              Acasă
            </button>
          </div>
        </section>
      );
    }

    const modeLabel =
      learning.mode === "mistakes"
        ? "Review greșeli"
        : learning.mode === "continue"
          ? "Continuare"
        : learning.mode === "random"
          ? "Random"
          : "De la început";

    return (
      <section className="card">
        <div className="row-between wrap-gap">
          <div>
            <span className="eyebrow">Learning Journey</span>
            <h2>{modeLabel}</h2>
          </div>
          <div className="actions-inline">
            {learning.mode === "mistakes" ? (
              <button className="btn ghost" onClick={() => setView("learningSetup")}>
                Inapoi la Learning
              </button>
            ) : (
              <>
                <button className="btn ghost" onClick={openLearningSetup}>
                  Setări
                </button>
                <button
                  className="btn ghost"
                  onClick={() => startLearning("mistakes")}
                  disabled={!learning.progress.badIds.length}
                >
                  Parcurge greșelile
                </button>
              </>
            )}
            <button className="btn ghost" onClick={() => setView("home")}>
              Acasă
            </button>
          </div>
        </div>

        <div className="progress-wrap">
          <div className="progress-head">
            <span>
              Întrebarea {learning.currentIndex + 1} / {learning.order.length || 1}
            </span>
            <span className="badge">{modeLabel}</span>
          </div>
          <div className="progress-bar">
            <div style={{ width: `${learningCompletion}%` }} />
          </div>
        </div>

        <div className="summary-strip">
          <div className="summary-pill">
            <span>Corecte</span>
            <strong>{learning.progress.goodIds.length}</strong>
          </div>
          <div className="summary-pill summary-pill-danger">
            <span>Greșite</span>
            <strong>{learning.progress.badIds.length}</strong>
          </div>
          <div className="summary-pill">
            <span>Completare</span>
            <strong>{learningCompletion}%</strong>
          </div>
        </div>

        <article className="question-block question-block-featured">
          <p className="qid">ID #{learningQuestion.id}</p>
          <h3>{learningQuestion.question}</h3>
          <div className="answers">
            {learningQuestion.answers.map((answer, answerIndex) => {
              const selected = learning.selectedAnswerIndex === answerIndex;
              const tone = getLearningAnswerTone(answer, answerIndex);

              return (
                <label
                  key={answerIndex}
                  className={`answer-option${selected ? " selected" : ""}${tone}`}
                >
                  <input
                    type="radio"
                    name="learning-answer"
                    checked={selected}
                    onChange={() =>
                      setLearning((prev) => ({
                        ...prev,
                        selectedAnswerIndex: answerIndex
                      }))
                    }
                  />
                  <span className="answer-content">
                    <span>{answer.text}</span>
                    {learning.showFeedback && learningSubmittedIndex != null && learningSaved === false && answer.correct ? (
                      <small className="answer-note answer-note-correct">Răspunsul corect</small>
                    ) : null}
                    {learning.showFeedback &&
                    learningSubmittedIndex != null &&
                    learningSaved === false &&
                    learningSubmittedIndex === answerIndex &&
                    !answer.correct ? (
                      <small className="answer-note answer-note-wrong">Răspunsul tău</small>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>

          <p className={`feedback ${!learning.showFeedback ? "" : learningSaved == null ? "" : learningSaved ? "ok" : "bad"}`}>
            {!learning.showFeedback
              ? "Alege un răspuns și verifică-l."
              : learningSaved == null
                ? "Alege un răspuns și verifică-l."
                : learningSaved
                  ? "Perfect. Întrebarea este marcată corect."
                  : "Ai greșit. Răspunsul corect este evidențiat cu verde, iar alegerea ta cu roșu."}
          </p>
        </article>

        <div className="grid three">
          <button
            className="btn"
            disabled={learning.currentIndex === 0}
            onClick={() =>
              setLearning((prev) => ({
                ...prev,
                currentIndex: Math.max(0, prev.currentIndex - 1),
                selectedAnswerIndex: null,
                showFeedback: false
              }))
            }
          >
            Întrebarea anterioară
          </button>
          <button className="btn primary" onClick={submitLearningAnswer}>
            Verifică răspuns
          </button>
          <button
            className="btn"
            disabled={learning.currentIndex >= learning.order.length - 1}
            onClick={() =>
              setLearning((prev) => ({
                ...prev,
                currentIndex: Math.min(prev.order.length - 1, prev.currentIndex + 1),
                selectedAnswerIndex: null,
                showFeedback: false
              }))
            }
          >
            Întrebarea următoare
          </button>
        </div>

        <section className="review-grid">
          <div className="review-card">
            <div className="row-between wrap-gap">
              <h3>Corecte</h3>
              <span className="badge">{learning.progress.goodIds.length}</span>
            </div>
            <div className="chip-list">
              {learning.progress.goodIds.length ? (
                learning.progress.goodIds.map((id) => (
                  <button key={id} className="chip good" onClick={() => jumpToLearningId(id)}>
                    ID {id}
                  </button>
                ))
              ) : (
                <p className="muted compact-text">Încă nu ai întrebări rezolvate corect.</p>
              )}
            </div>
          </div>

          <div className="review-card review-card-emphasis">
            <div className="row-between wrap-gap">
              <h3>Greșite</h3>
              <div className="actions-inline">
                <span className="badge danger">{learning.progress.badIds.length}</span>
                <button
                  className="btn btn-small"
                  onClick={() => startLearning("mistakes")}
                  disabled={!learning.progress.badIds.length}
                >
                  Parcurge-le
                </button>
              </div>
            </div>
            <div className="chip-list">
              {learning.progress.badIds.length ? (
                learning.progress.badIds.map((id) => (
                  <button key={id} className="chip bad" onClick={() => jumpToLearningId(id)}>
                    ID {id}
                  </button>
                ))
              ) : (
                <p className="muted compact-text">Nu mai ai întrebări greșite salvate.</p>
              )}
            </div>
          </div>
        </section>
      </section>
    );
  }

  function renderTesting() {
    const result = testing.result;

    return (
      <section className="card">
        <div className="row-between wrap-gap">
          <div>
            <span className="eyebrow">Testing Journey</span>
            <h2>Simulare examen</h2>
          </div>
          <div className="actions-inline">
            <button className="btn ghost" onClick={startTesting}>
              Test nou random (26)
            </button>
            <button className="btn ghost" onClick={() => setView("home")}>
              Acasă
            </button>
          </div>
        </div>

        <div className="info-banner">
          <strong>Regulă de promovare:</strong> ai nevoie de minimum {PASS_THRESHOLD} răspunsuri corecte din {TEST_SIZE}.
        </div>

        <div className="progress-wrap">
          <div className="progress-head">
            <span>
              Întrebarea {testing.currentIndex + 1} / {TEST_SIZE}
            </span>
            <span>Răspunsuri date: {testingAnsweredCount} / {TEST_SIZE}</span>
          </div>
          <div className="progress-bar">
            <div style={{ width: `${Math.round((testingAnsweredCount / TEST_SIZE) * 100)}%` }} />
          </div>
        </div>

        {testingQuestion ? (
          <article className="question-block question-block-featured">
            <p className="qid">ID #{testingQuestion.id}</p>
            <h3>{testingQuestion.question}</h3>
            <div className="answers">
              {testingQuestion.answers.map((answer, answerIndex) => {
                const selected = testing.selectedById[testingQuestion.id] === answerIndex;
                return (
                  <label
                    key={answerIndex}
                    className={`answer-option${selected ? " selected" : ""}`}
                  >
                    <input
                      type="radio"
                      name="testing-answer"
                      checked={selected}
                      onChange={() =>
                        setTesting((prev) => ({
                          ...prev,
                          selectedById: {
                            ...prev.selectedById,
                            [testingQuestion.id]: answerIndex
                          }
                        }))
                      }
                    />
                    <span className="answer-content">
                      <span>{answer.text}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </article>
        ) : null}

        <div className="grid three">
          <button
            className="btn"
            disabled={testing.currentIndex === 0}
            onClick={() =>
              setTesting((prev) => ({
                ...prev,
                currentIndex: Math.max(0, prev.currentIndex - 1)
              }))
            }
          >
            Întrebarea anterioară
          </button>
          <button
            className="btn"
            disabled={testing.currentIndex >= TEST_SIZE - 1}
            onClick={() =>
              setTesting((prev) => ({
                ...prev,
                currentIndex: Math.min(TEST_SIZE - 1, prev.currentIndex + 1)
              }))
            }
          >
            Întrebarea următoare
          </button>
          <button className="btn primary" onClick={finishTesting} disabled={testing.loading}>
            {testing.loading ? "Se calculează..." : "Finalizează testul"}
          </button>
        </div>

        {result ? (
          <section className={`result ${result.complete && result.passed ? "pass" : "fail"}`}>
            {result.error ? (
              <>
                <h3>Eroare</h3>
                <p>Scorul nu poate fi calculat momentan.</p>
              </>
            ) : result.complete ? (
              <>
                <h3>{result.passed ? "Promovat" : "Nepromovat"}</h3>
                <p>
                  Scor: <strong>{result.correct}</strong> din {result.total}
                </p>
                <p>
                  Prag promovare: {result.threshold} / {result.total}
                </p>

                {!result.passed && Array.isArray(result.wrongAnswers) && result.wrongAnswers.length ? (
                  <div className="mistake-review">
                    <h4>Răspunsurile greșite și varianta corectă</h4>
                    <div className="mistake-list">
                      {result.wrongAnswers.map((item) => (
                        <article key={item.id} className="mistake-card">
                          <p className="qid">ID #{item.id}</p>
                          <h5>{item.question}</h5>
                          <p className="answer-line answer-line-wrong">
                            <strong>Răspunsul tău:</strong> {item.selectedAnswer}
                          </p>
                          <p className="answer-line answer-line-correct">
                            <strong>Corect:</strong> {item.correctAnswer}
                          </p>
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <h3>Test incomplet</h3>
                <p>
                  Mai ai <strong>{result.missing}</strong> întrebări fără răspuns.
                </p>
                <p>Completează toate cele {TEST_SIZE} întrebări pentru evaluare.</p>
              </>
            )}
          </section>
        ) : null}
      </section>
    );
  }

  return (
    <main>
      <header className="topbar topbar-rich">
        <div className="topbar-inner">
          <div className="brand">
            <h1>Sea Skipper Trainer</h1>
          </div>

          <nav className="nav-actions" aria-label="Cont">
            {authUser ? (
              <>
                <span className="nav-user">{profileUsername || "Cont"}</span>
                <button className="btn" onClick={logout} disabled={authBusy}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <button className="btn" onClick={() => openAuthPanel("login")}>
                  Login
                </button>
                <button className="btn primary" onClick={() => openAuthPanel("register")}>
                  Register
                </button>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="container">
        {!loading && !loadError ? renderAuthPanel() : null}
        {loading ? <section className="card">Se încarcă întrebările...</section> : null}
        {loadError ? <section className="card result fail">{loadError}</section> : null}

        {!loading && !loadError && view === "home" ? renderHome() : null}
        {!loading && !loadError && view === "learningSetup" ? renderLearningSetup() : null}
        {!loading && !loadError && view === "learning" ? renderLearning() : null}
        {!loading && !loadError && view === "testing" ? renderTesting() : null}
      </div>
    </main>
  );
}
