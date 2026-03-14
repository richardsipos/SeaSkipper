"use client";

import { useEffect, useMemo, useState } from "react";

const PASS_THRESHOLD = 22;
const TEST_SIZE = 26;
const STORAGE_KEY = "seaskipper-learning-progress-v2";

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function HomePage() {
  const [view, setView] = useState("home");
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [learning, setLearning] = useState({
    mode: "sequential",
    order: [],
    currentIndex: 0,
    selectedAnswerIndex: null,
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
        const response = await fetch("/api/questions");
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
      currentIndex: 0,
      selectedAnswerIndex: null
    }));
    setView("learning");
  }

  function submitLearningAnswer() {
    if (!learningQuestion || learning.selectedAnswerIndex == null) {
      return;
    }

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

      return {
        ...prev,
        order,
        currentIndex: index,
        selectedAnswerIndex: null
      };
    });
    setView("learning");
  }

  async function startTesting() {
    setLoadError("");
    setTesting((prev) => ({ ...prev, loading: true }));

    try {
      const response = await fetch(`/api/questions?mode=test&count=${TEST_SIZE}`);
      if (!response.ok) {
        throw new Error("Nu am putut genera testul");
      }

      const testQuestions = await response.json();
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
      const response = await fetch("/api/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          testIds: testing.order,
          selectedById: testing.selectedById
        })
      });

      const payload = await response.json();

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
    if (learningSubmittedIndex == null) {
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
            <span className="eyebrow">Sea Skipper Exam Prep</span>
            <h2>Pregătire clară, elegantă și ușor de folosit pe telefon</h2>
            <p className="muted hero-copy">
              Alege între învățare ghidată și testare reală. Vezi rapid unde greșești,
              revino doar pe întrebările dificile și urmărește progresul tău.
            </p>
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
            <span className="badge">Learning Journey</span>
            <h3>Învață în ritmul tău</h3>
            <p className="muted">
              Primești feedback imediat, iar răspunsul corect este evidențiat clar
              când greșești.
            </p>
            <ul className="feature-list">
              <li>start de la început sau random</li>
              <li>review rapid pe întrebările greșite</li>
              <li>resubmit până devin corecte</li>
            </ul>
            <button className="btn primary" onClick={openLearningSetup}>
              Deschide Learning
            </button>
          </article>

          <article className="card mode-card">
            <span className="badge">Testing Journey</span>
            <h3>Simulare reală de examen</h3>
            <p className="muted">
              Teste random cu 26 întrebări, promovare la minimum 22 răspunsuri corecte.
            </p>
            <ul className="feature-list">
              <li>scorare server-side</li>
              <li>review complet pentru răspunsurile greșite</li>
              <li>refacere instant cu un nou set</li>
            </ul>
            <button className="btn" onClick={startTesting}>
              Începe un test
            </button>
          </article>
        </section>
      </>
    );
  }

  function renderLearningSetup() {
    const hasMistakes = learning.progress.badIds.length > 0;

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
          Poți începe de la prima întrebare, în ordine random sau doar cu întrebările greșite.
        </p>

        <div className="grid two action-cards">
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
                    {learningSubmittedIndex != null && learningSaved === false && answer.correct ? (
                      <small className="answer-note answer-note-correct">Răspunsul corect</small>
                    ) : null}
                    {learningSubmittedIndex != null &&
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

          <p className={`feedback ${learningSaved == null ? "" : learningSaved ? "ok" : "bad"}`}>
            {learningSaved == null
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
                selectedAnswerIndex: null
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
                selectedAnswerIndex: null
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
        <h1>Sea Skipper Trainer</h1>
        <p>Învață inteligent. Testează sigur. Revino exact unde ai greșit.</p>
      </header>

      <div className="container">
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
