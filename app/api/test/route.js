import { NextResponse } from "next/server";
import { getAllQuestions, scoreAnswers } from "@/lib/questions";

const PASS_THRESHOLD = 22;
const TEST_SIZE = 26;

export async function POST(request) {
  const payload = await request.json();
  const testIds = Array.isArray(payload?.testIds) ? payload.testIds : [];
  const selectedById = payload?.selectedById && typeof payload.selectedById === "object" ? payload.selectedById : {};

  if (testIds.length !== TEST_SIZE) {
    return NextResponse.json(
      { error: `Test must contain exactly ${TEST_SIZE} questions.` },
      { status: 400 }
    );
  }

  const questions = await getAllQuestions();
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const answeredCount = Object.keys(selectedById).length;

  if (answeredCount < TEST_SIZE) {
    return NextResponse.json(
      {
        complete: false,
        missing: TEST_SIZE - answeredCount,
        correct: 0,
        passed: false,
        threshold: PASS_THRESHOLD,
        total: TEST_SIZE
      },
      { status: 200 }
    );
  }

  const correct = scoreAnswers(questions, selectedById, testIds);
  const wrongAnswers = testIds
    .map((id) => {
      const question = questionsById.get(id);
      const selectedIndex = selectedById[id];

      if (!question || selectedIndex == null) {
        return null;
      }

      const selectedAnswer = question.answers?.[selectedIndex];
      const correctAnswer = question.answers?.find((answer) => answer.correct);

      if (selectedAnswer?.correct) {
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

  return NextResponse.json({
    complete: true,
    correct,
    passed: correct >= PASS_THRESHOLD,
    threshold: PASS_THRESHOLD,
    total: TEST_SIZE,
    wrongAnswers
  });
}
