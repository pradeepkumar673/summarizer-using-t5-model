/**
 * STEP 15 — Viva Simulator Page
 *
 * Adaptive oral examination powered by Groq.
 * Flow:
 *   1. User selects a topic → POST /api/viva/start → first question appears.
 *   2. User types answer → POST /api/viva/{id}/answer → rubric scores, feedback,
 *      missing keywords, "Review source" button (Step 7 highlight), next question.
 *   3. Continues up to 10 rounds or until Groq signals end.
 *   4. Session history panel shows all past rounds.
 */
import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { getDocument, getTopics, type DocumentDetail, type TopicPublic } from "../api/documents";
import {
  startViva,
  submitAnswer,
  type Difficulty,
  type RubricScore,
  type AnswerResponse,
  type QARound,
} from "../api/viva";
import { useWorkspaceStore } from "../store/workspaceStore";

// ── Types ────────────────────────────────────────────────────────────────────
type Phase = "select" | "question" | "evaluating" | "feedback" | "complete";

interface ActiveSession {
  sessionId: string;
  topicTitle: string;
  currentQuestion: string;
  currentDifficulty: Difficulty;
  roundIndex: number;       // 1-based
  rounds: QARound[];
}

// ── Sub-components ────────────────────────────────────────────────────────────

const DIFF_STYLE: Record<Difficulty, string> = {
  easy:   "border-green-300 bg-green-50 text-green-700",
  medium: "border-amber-300 bg-amber-50 text-amber-700",
  hard:   "border-red-300 bg-red-50 text-red-700",
};

const RUBRIC_LABELS: Record<keyof RubricScore, string> = {
  conceptual_accuracy: "Conceptual Accuracy",
  completeness:        "Completeness",
  clarity:             "Clarity",
  use_of_examples:     "Use of Examples",
  confidence:          "Confidence",
};

function ScoreBar({ label, score }: { label: string; score: number }) {
  const pct = (score / 5) * 100;
  const colour =
    score >= 4 ? "bg-green-500" : score >= 3 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 text-xs text-slate-600">{label}</span>
      <div className="flex-1 rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full transition-all ${colour}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-6 text-right text-xs font-semibold text-slate-700">
        {score}/5
      </span>
    </div>
  );
}

function EvaluationCard({
  response,
  round,
  onReviewSource,
}: {
  response: AnswerResponse;
  round: number;
  onReviewSource: (page: number) => void;
}) {
  const overallColour =
    response.overall_score >= 4.0
      ? "text-green-600"
      : response.overall_score >= 2.5
      ? "text-amber-600"
      : "text-red-600";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          Round {round} Evaluation
        </h3>
        <span className={`text-xl font-bold ${overallColour}`}>
          {response.overall_score.toFixed(1)}/5.0
        </span>
      </div>

      {/* Rubric bars */}
      <div className="mb-4 space-y-2">
        {(Object.keys(RUBRIC_LABELS) as (keyof RubricScore)[]).map((key) => (
          <ScoreBar
            key={key}
            label={RUBRIC_LABELS[key]}
            score={response.evaluation[key]}
          />
        ))}
      </div>

      {/* Feedback */}
      <p className="mb-3 text-sm leading-relaxed text-slate-700">
        {response.feedback}
      </p>

      {/* Missing keywords */}
      {response.missing_keywords.length > 0 && (
        <div className="mb-3 rounded-md bg-amber-50 p-3">
          <p className="mb-1 text-xs font-semibold text-amber-700">
            Missing keywords / concepts:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {response.missing_keywords.map((kw) => (
              <span
                key={kw}
                className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-700"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Review source */}
      {response.source_page != null && (
        <button
          onClick={() => onReviewSource(response.source_page!)}
          className="text-xs font-medium text-indigo-600 hover:underline"
        >
          ↗ Review source (page {response.source_page})
        </button>
      )}

      {/* Difficulty badge */}
      <div className="mt-3 text-[11px] text-slate-400">
        Next difficulty:{" "}
        <span
          className={`rounded-full border px-2 py-0.5 font-semibold ${DIFF_STYLE[response.next_difficulty]}`}
        >
          {response.next_difficulty}
        </span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VivaSimulator() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [topics, setTopics] = useState<TopicPublic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("select");
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [answer, setAnswer] = useState("");
  const [lastResponse, setLastResponse] = useState<AnswerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const answerRef = useRef<HTMLTextAreaElement>(null);
  const focusSearchResult = useWorkspaceStore((s) => s.focusSearchResult);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [docDetail, topicsList] = await Promise.all([
          getDocument(id!),
          getTopics(id!),
        ]);
        if (cancelled) return;
        setDoc(docDetail);
        setTopics(topicsList);
        if (topicsList.length > 0) setSelectedTopicId(topicsList[0].id);
      } catch {
        if (!cancelled) setError("Failed to load document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

  // Focus textarea when question appears
  useEffect(() => {
    if (phase === "question") {
      setTimeout(() => answerRef.current?.focus(), 100);
    }
  }, [phase, session?.currentQuestion]);

  async function handleStart() {
    if (!id || !selectedTopicId) return;
    setBusy(true);
    setError(null);
    setLastResponse(null);
    try {
      const res = await startViva(id, selectedTopicId);
      setSession({
        sessionId: res.session_id,
        topicTitle: res.topic_title,
        currentQuestion: res.question,
        currentDifficulty: res.difficulty,
        roundIndex: 1,
        rounds: [],
      });
      setPhase("question");
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.detail ?? "Failed to start viva."
          : "Failed to start viva."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitAnswer() {
    if (!session || !answer.trim() || busy) return;
    setBusy(true);
    setError(null);
    setPhase("evaluating");
    try {
      const res = await submitAnswer(session.sessionId, answer.trim());
      setLastResponse(res);

      // Build completed round for history
      const completedRound: QARound = {
        question: session.currentQuestion,
        difficulty: session.currentDifficulty,
        answer: answer.trim(),
        evaluation: res.evaluation,
        overall_score: res.overall_score,
        feedback: res.feedback,
        missing_keywords: res.missing_keywords,
        next_question: res.next_question,
        source_page: res.source_page,
        source_paragraph_id: res.source_paragraph_id,
      };

      setSession((prev) =>
        prev
          ? {
              ...prev,
              rounds: [...prev.rounds, completedRound],
              currentQuestion: res.next_question ?? prev.currentQuestion,
              currentDifficulty: res.next_difficulty,
              roundIndex: prev.roundIndex + 1,
            }
          : prev
      );
      setAnswer("");
      setPhase(res.session_complete ? "complete" : "feedback");
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? err.response?.data?.detail ?? "Evaluation failed."
          : "Evaluation failed."
      );
      setPhase("question");
    } finally {
      setBusy(false);
    }
  }

  function handleNextQuestion() {
    setLastResponse(null);
    setPhase("question");
  }

  function handleReviewSource(page: number) {
    focusSearchResult({ page, box: null });
  }

  function handleRestart() {
    setSession(null);
    setLastResponse(null);
    setAnswer("");
    setPhase("select");
    setError(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-900/80 px-6 py-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <Link
              to={`/documents/${id}`}
              className="text-sm text-indigo-400 hover:underline"
            >
              &larr; Back to workspace
            </Link>
            <h1 className="mt-0.5 text-lg font-bold text-white">
              🎓 Viva Simulator — {doc?.title ?? ""}
            </h1>
          </div>
          {session && phase !== "select" && (
            <button
              onClick={handleRestart}
              className="rounded-md border border-slate-600 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
            >
              New Session
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-8">
        {error && (
          <div className="mb-4 rounded-lg bg-red-900/50 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ── TOPIC SELECTOR ──────────────────────────────────────────── */}
        {phase === "select" && (
          <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-8 shadow-xl backdrop-blur">
            <h2 className="mb-2 text-xl font-bold text-white">Start a Viva</h2>
            <p className="mb-6 text-sm text-slate-400">
              Select a topic, then answer the AI examiner's questions. You'll
              receive real-time rubric feedback and adaptive follow-up questions.
            </p>

            {topics.length === 0 ? (
              <p className="text-sm text-amber-400">
                No topics found. Run "Segment Topics" in the workspace first.
              </p>
            ) : (
              <>
                <label className="mb-1 block text-sm font-medium text-slate-300">
                  Choose topic
                </label>
                <select
                  value={selectedTopicId}
                  onChange={(e) => setSelectedTopicId(e.target.value)}
                  className="mb-6 w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} (p. {t.page_range[0]}–{t.page_range[1]})
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleStart}
                  disabled={busy || !selectedTopicId}
                  className="w-full rounded-xl bg-indigo-600 py-3 text-base font-bold text-white shadow-lg hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Starting…" : "Begin Viva →"}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── QUESTION ────────────────────────────────────────────────── */}
        {(phase === "question" || phase === "evaluating") && session && (
          <div className="space-y-4">
            {/* Progress + difficulty */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Round {session.roundIndex} / 10 &bull; Topic:{" "}
                <span className="font-medium text-slate-200">
                  {session.topicTitle}
                </span>
              </span>
              <span
                className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${DIFF_STYLE[session.currentDifficulty]}`}
              >
                {session.currentDifficulty}
              </span>
            </div>

            {/* Question card */}
            <div className="rounded-2xl border border-indigo-700/50 bg-indigo-900/30 p-6 shadow-xl">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-indigo-400">
                Examiner's Question
              </p>
              <p className="text-lg font-medium leading-relaxed text-white">
                {session.currentQuestion}
              </p>
            </div>

            {/* Answer input */}
            <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4">
              <label className="mb-2 block text-sm font-medium text-slate-300">
                Your Answer
              </label>
              <textarea
                ref={answerRef}
                rows={6}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={phase === "evaluating"}
                placeholder="Type your answer here…"
                className="w-full resize-none rounded-lg border border-slate-600 bg-slate-700/60 p-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {answer.trim().split(/\s+/).filter(Boolean).length} words
                </span>
                <button
                  onClick={handleSubmitAnswer}
                  disabled={phase === "evaluating" || !answer.trim()}
                  className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {phase === "evaluating" ? "Evaluating…" : "Submit Answer →"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── FEEDBACK ────────────────────────────────────────────────── */}
        {phase === "feedback" && lastResponse && session && (
          <div className="space-y-4">
            <EvaluationCard
              response={lastResponse}
              round={session.roundIndex - 1}
              onReviewSource={handleReviewSource}
            />

            {lastResponse.next_question && (
              <div className="rounded-2xl border border-indigo-700/40 bg-indigo-900/20 p-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-400">
                  Next Question
                </p>
                <p className="text-base font-medium text-white">
                  {lastResponse.next_question}
                </p>
              </div>
            )}

            <button
              onClick={handleNextQuestion}
              disabled={!lastResponse.next_question}
              className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue →
            </button>
          </div>
        )}

        {/* ── COMPLETE ────────────────────────────────────────────────── */}
        {phase === "complete" && session && (
          <div className="space-y-4">
            {lastResponse && (
              <EvaluationCard
                response={lastResponse}
                round={session.roundIndex - 1}
                onReviewSource={handleReviewSource}
              />
            )}

            {/* Summary */}
            <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6">
              <h2 className="mb-4 text-lg font-bold text-white">
                Session Complete 🎓
              </h2>
              {session.rounds.length > 0 && (
                <>
                  <p className="mb-3 text-sm text-slate-400">
                    Average score:{" "}
                    <span className="font-bold text-white">
                      {(
                        session.rounds.reduce(
                          (s, r) => s + (r.overall_score ?? 0),
                          0
                        ) / session.rounds.length
                      ).toFixed(2)}
                      /5.0
                    </span>{" "}
                    over {session.rounds.length} rounds.
                  </p>
                  <div className="space-y-3">
                    {session.rounds.map((r, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-slate-700 bg-slate-900/50 p-3"
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-slate-400">
                            Round {i + 1} ·{" "}
                            <span
                              className={`font-medium ${DIFF_STYLE[r.difficulty].split(" ")[2]}`}
                            >
                              {r.difficulty}
                            </span>
                          </span>
                          <span className="text-xs font-bold text-white">
                            {r.overall_score?.toFixed(1)}/5
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 line-clamp-2">
                          Q: {r.question}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <button
                onClick={handleRestart}
                className="mt-5 w-full rounded-xl bg-indigo-600 py-3 text-sm font-bold text-white hover:bg-indigo-700"
              >
                Start a New Viva
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
