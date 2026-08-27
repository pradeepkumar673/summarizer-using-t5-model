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
import SketchHeader from "../components/sketch/SketchHeader";
import BookmarkTabs from "../components/sketch/BookmarkTabs";
import SketchButton from "../components/sketch/SketchButton";

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

// Sketch-palette difficulty chip styles
const DIFF_STYLE: Record<Difficulty, string> = {
  easy:   "bg-tertiary-fixed/60 text-on-tertiary-fixed",
  medium: "bg-secondary-fixed text-on-secondary-fixed",
  hard:   "bg-error-container text-on-error-container",
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
  const barColor =
    score >= 4 ? "#498300" : score >= 3 ? "#835500" : "#ba1a1a";
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 font-mono text-source-code text-on-surface-variant">{label}</span>
      <div
        className="flex-1 h-3 bg-surface-container-lowest"
        style={{ border: "2px solid #1c1b1b", borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px" }}
      >
        <div
          className="h-full transition-all"
          style={{
            width: `${pct}%`,
            background: barColor,
            backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(255,255,255,0.25) 3px, rgba(255,255,255,0.25) 6px)`,
          }}
        />
      </div>
      <span className="w-10 text-right font-mono text-source-code font-bold text-on-surface">
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
    <div
      className="bg-white p-5"
      style={{
        border: "2px solid #1c1b1b",
        borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
        boxShadow: "3px 3px 0px #1c1b1b",
        transform: "rotate(-0.3deg)",
      }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-headline text-headline-sm" style={{ fontSize: "16px" }}>
          Round {round} Evaluation
        </h3>
        <span className={`font-display text-headline-md ${overallColour}`}>
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
      <p className="mb-3 font-body text-body-md text-on-surface leading-relaxed">
        {response.feedback}
      </p>

      {/* Missing keywords */}
      {response.missing_keywords.length > 0 && (
        <div className="mb-3 bg-secondary-fixed/40 p-3"
          style={{ border: "1px solid #835500", borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px" }}
        >
          <p className="mb-2 font-label-caps text-label-caps text-secondary uppercase tracking-widest">
            Missing keywords:
          </p>
          <div className="flex flex-wrap gap-2">
            {response.missing_keywords.map((kw) => (
              <span
                key={kw}
                className="bg-white font-mono text-source-code text-secondary px-2 py-0.5"
                style={{ border: "1px solid #835500", borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px" }}
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
          className="font-label-caps text-label-caps text-primary hover:underline"
          style={{ fontSize: "11px" }}
        >
          ↗ Review source (page {response.source_page})
        </button>
      )}

      {/* Difficulty badge */}
      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono text-source-code text-on-surface-variant">Next difficulty:</span>
        <span
          className={`font-label-caps text-label-caps px-2 py-0.5 ${DIFF_STYLE[response.next_difficulty]}`}
          style={{ border: "1px solid #1c1b1b", borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px" }}
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
      <div className="flex min-h-screen items-center justify-center bg-checkered">
        <div className="text-center">
          <span className="material-symbols-outlined text-5xl text-primary animate-spin" style={{ animationDuration: "2s" }}>autorenew</span>
          <p className="font-headline text-headline-sm mt-4 text-on-surface-variant">Loading viva simulator...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-checkered text-on-surface font-body">
      <SketchHeader />
      <BookmarkTabs documentId={id!} status={doc?.status} />

      <div className="mx-auto max-w-3xl px-4 pt-28 pb-16 pr-20 md:pr-28">

        {/* Back + title */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <Link to={`/documents/${id}`} className="font-label-caps text-label-caps text-primary hover:underline" style={{ fontSize: "11px" }}>
              ← Back to workspace
            </Link>
            <h1 className="font-display text-headline-md mt-1">🎓 Viva Simulator</h1>
            <p className="font-mono text-source-code text-on-surface-variant">{doc?.title ?? ""}</p>
          </div>
          {session && phase !== "select" && (
            <SketchButton onClick={handleRestart} variant="ghost" size="sm">
              New Session
            </SketchButton>
          )}
        </div>

        {error && (
          <div className="mb-5 hand-drawn-border-thin bg-error-container p-3 font-body text-body-md text-on-error-container">
            {error}
          </div>
        )}

        {/* ── TOPIC SELECTOR ──────────────────────────────────────────── */}
        {phase === "select" && (
          <div
            className="bg-white p-8"
            style={{
              border: "3px solid #1c1b1b",
              borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
              boxShadow: "4px 4px 0px #1c1b1b",
              transform: "rotate(-0.5deg)",
            }}
          >
            <h2 className="font-headline text-headline-sm mb-2">Start a Viva Session</h2>
            <p className="font-body text-body-md text-on-surface-variant mb-6">
              Select a topic, then answer the AI examiner's questions. You'll receive real-time rubric feedback and adaptive follow-up questions.
            </p>

            {topics.length === 0 ? (
              <p className="font-body text-body-md text-secondary">
                No topics found. Run "Segment Topics" in the workspace first.
              </p>
            ) : (
              <>
                <label className="block font-label-caps text-label-caps text-on-surface-variant mb-2 uppercase tracking-widest">
                  Choose topic
                </label>
                <select
                  value={selectedTopicId}
                  onChange={(e) => setSelectedTopicId(e.target.value)}
                  className="mb-6 w-full bg-surface-container-lowest border-2 border-on-surface px-3 py-2.5 font-body text-body-md text-on-surface focus:outline-none focus:border-primary"
                  style={{ borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} (p. {t.page_range[0]}–{t.page_range[1]})
                    </option>
                  ))}
                </select>

                <SketchButton
                  onClick={handleStart}
                  disabled={busy || !selectedTopicId}
                  variant="primary"
                  size="lg"
                  style={{ width: "100%" }}
                >
                  {busy ? "Starting..." : "Begin Viva →"}
                </SketchButton>
              </>
            )}
          </div>
        )}

        {/* ── QUESTION ────────────────────────────────────────────────── */}
        {(phase === "question" || phase === "evaluating") && session && (
          <div className="space-y-5">
            {/* Progress + difficulty */}
            <div className="flex items-center justify-between">
              <span className="font-mono text-source-code text-on-surface-variant">
                Round {session.roundIndex} / 10 · <span className="font-bold text-on-surface">{session.topicTitle}</span>
              </span>
              <span
                className={`font-label-caps text-label-caps px-3 py-1 ${DIFF_STYLE[session.currentDifficulty]}`}
                style={{ border: "2px solid #1c1b1b", borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
              >
                {session.currentDifficulty}
              </span>
            </div>

            {/* Question card */}
            <div
              className="bg-primary-fixed/30 p-6"
              style={{
                border: "3px solid #005da7",
                borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                transform: "rotate(0.5deg)",
              }}
            >
              <p className="font-label-caps text-label-caps text-primary uppercase tracking-widest mb-2">
                Examiner's Question
              </p>
              <p className="font-headline text-headline-sm leading-relaxed text-on-surface">
                {session.currentQuestion}
              </p>
            </div>

            {/* Answer input — notebook ruled style */}
            <div
              className="bg-white p-5"
              style={{ border: "2px solid #1c1b1b", borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px" }}
            >
              <label className="block font-label-caps text-label-caps text-on-surface-variant mb-3 uppercase tracking-widest">
                Your Answer
              </label>
              <textarea
                ref={answerRef}
                rows={6}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={phase === "evaluating"}
                placeholder="Write your answer here..."
                className="w-full resize-none bg-surface-container-lowest border-b-2 border-on-surface px-2 py-2 font-body text-body-md text-on-surface placeholder-on-surface-variant focus:outline-none disabled:opacity-60"
                style={{
                  backgroundImage: "repeating-linear-gradient(transparent, transparent 27px, #c1c7d3 27px, #c1c7d3 28px)",
                  backgroundAttachment: "local",
                  lineHeight: "28px",
                }}
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-source-code text-on-surface-variant">
                  {answer.trim().split(/\s+/).filter(Boolean).length} words
                </span>
                <SketchButton
                  onClick={handleSubmitAnswer}
                  disabled={phase === "evaluating" || !answer.trim()}
                  variant="primary"
                  size="md"
                >
                  {phase === "evaluating" ? "Evaluating..." : "Submit Answer →"}
                </SketchButton>
              </div>
            </div>
          </div>
        )}

        {/* ── FEEDBACK ────────────────────────────────────────────────── */}
        {phase === "feedback" && lastResponse && session && (
          <div className="space-y-5">
            <EvaluationCard
              response={lastResponse}
              round={session.roundIndex - 1}
              onReviewSource={handleReviewSource}
            />

            {lastResponse.next_question && (
              <div
                className="bg-surface-container-low p-5"
                style={{ border: "2px solid #1c1b1b", borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px", transform: "rotate(0.3deg)" }}
              >
                <p className="font-label-caps text-label-caps text-on-surface-variant uppercase tracking-widest mb-2">
                  Next Question
                </p>
                <p className="font-headline text-headline-sm text-on-surface">
                  {lastResponse.next_question}
                </p>
              </div>
            )}

            <SketchButton
              onClick={handleNextQuestion}
              disabled={!lastResponse.next_question}
              variant="primary"
              size="lg"
              style={{ width: "100%" }}
            >
              Continue →
            </SketchButton>
          </div>
        )}

        {/* ── COMPLETE ────────────────────────────────────────────────── */}
        {phase === "complete" && session && (
          <div className="space-y-5">
            {lastResponse && (
              <EvaluationCard
                response={lastResponse}
                round={session.roundIndex - 1}
                onReviewSource={handleReviewSource}
              />
            )}

            {/* Summary card */}
            <div
              className="bg-white p-6"
              style={{
                border: "3px solid #1c1b1b",
                borderRadius: "255px 15px 225px 15px / 15px 225px 15px 255px",
                boxShadow: "4px 4px 0px #1c1b1b",
                transform: "rotate(-0.5deg)",
              }}
            >
              <h2 className="font-headline text-headline-sm mb-4">Session Complete 🎓</h2>
              {session.rounds.length > 0 && (
                <>
                  <p className="font-body text-body-md text-on-surface-variant mb-4">
                    Average score:{" "}
                    <span className="font-bold text-on-surface">
                      {(session.rounds.reduce((s, r) => s + (r.overall_score ?? 0), 0) / session.rounds.length).toFixed(2)}/5.0
                    </span>{" "}
                    over {session.rounds.length} rounds.
                  </p>
                  <div className="space-y-3">
                    {session.rounds.map((r, i) => (
                      <div
                        key={i}
                        className="bg-surface-container-low p-3"
                        style={{ border: "1px solid #1c1b1b", borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px" }}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-mono text-source-code text-on-surface-variant">
                            Round {i + 1} ·{" "}
                            <span
                              className={`font-label-caps text-label-caps px-1.5 py-0.5 ${DIFF_STYLE[r.difficulty]}`}
                              style={{ borderRadius: "255px 5px 225px 5px / 5px 225px 5px 255px", border: "1px solid #1c1b1b" }}
                            >
                              {r.difficulty}
                            </span>
                          </span>
                          <span className="font-mono text-source-code font-bold text-on-surface">
                            {r.overall_score?.toFixed(1)}/5
                          </span>
                        </div>
                        <p className="font-body text-body-md text-on-surface-variant line-clamp-2">
                          Q: {r.question}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <SketchButton
                onClick={handleRestart}
                variant="primary"
                size="lg"
                style={{ marginTop: "20px", width: "100%" }}
              >
                Start a New Viva
              </SketchButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
