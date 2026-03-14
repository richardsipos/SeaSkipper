import { NextResponse } from "next/server";
import { getAllQuestions, takeRandom } from "@/lib/questions";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "all";
  const countParam = Number(searchParams.get("count") || 26);

  const questions = await getAllQuestions();

  if (mode === "test") {
    const selection = takeRandom(questions, countParam > 0 ? countParam : 26);
    return NextResponse.json(selection);
  }

  return NextResponse.json(questions);
}
