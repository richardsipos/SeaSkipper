import { readFile } from "fs/promises";
import path from "path";

const questionsPath = path.join(process.cwd(), "intrebari_c.json");

export async function getAllQuestions() {
  const raw = await readFile(questionsPath, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

export function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function takeRandom(items, count) {
  return shuffled(items).slice(0, Math.min(count, items.length));
}

export function scoreAnswers(questions, selectedById = {}, testIds = []) {
  let correct = 0;

  for (const id of testIds) {
    const question = questions.find((q) => q.id === id);
    const selectedIndex = selectedById[id];
    if (!question || selectedIndex == null) continue;
    if (question.answers?.[selectedIndex]?.correct) correct += 1;
  }

  return correct;
}
