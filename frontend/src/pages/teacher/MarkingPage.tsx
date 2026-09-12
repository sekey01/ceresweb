import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { submissionsApi } from '../../api/submissions';
import { schemesApi } from '../../api/schemes';
import { sessionsApi } from '../../api/sessions';
import { markingApi } from '../../api/marking';
import type { Submission, SubmissionQuestion, Sheet, MarkingScheme, ScanSession } from '../../types';
import { useMarkingStore } from '../../store/markingStore';
import { useToastStore } from '../../store/toastStore';
import { downloadBlob, extractErrorMessage } from '../../utils/download';

import StudentList from '../../components/marking/StudentList';
import QuestionDisplay from '../../components/marking/QuestionDisplay';
import ScorePanel from '../../components/marking/ScorePanel';
import KeyboardHandler from '../../components/marking/KeyboardHandler';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';

export default function MarkingPage() {
  const { id: sessionId } = useParams<{ id: string }>();

  const {
    activeSubmissionId,
    activeQuestionIndex,
    showOriginalImage,
    initScores,
    setActiveSubmission,
    toggleOriginalImage,
  } = useMarkingStore();

  const [session, setSession] = useState<ScanSession | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [questions, setQuestions] = useState<SubmissionQuestion[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [scheme, setScheme] = useState<MarkingScheme | null>(null);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [completingMarking, setCompletingMarking] = useState(false);
  const { showToast } = useToastStore();

  // Load submissions + scheme on mount
  useEffect(() => {
    if (!sessionId) return;
    setLoadingSubmissions(true);
    Promise.all([
      submissionsApi.listForSession(sessionId),
      schemesApi.get(sessionId).catch(() => null),
      sessionsApi.get(sessionId).catch(() => null),
    ]).then(([subs, sch, sess]) => {
      setSession(sess);
      setSubmissions(subs);
      setScheme(sch);
      // Auto-select first submission
      if (subs.length > 0 && !activeSubmissionId) {
        loadSubmission(subs[0].id);
      }
    }).finally(() => setLoadingSubmissions(false));
  }, [sessionId]);

  const loadSubmission = async (submissionId: string) => {
    setActiveSubmission(submissionId);
    setLoadingQuestions(true);
    try {
      const [qs, sub] = await Promise.all([
        submissionsApi.getQuestions(submissionId),
        submissionsApi.get(submissionId),
      ]);
      setQuestions(qs);
      setSheets(sub.sheets ?? []);

      // Initialise scores from fetched questions (already includes awarded_marks + comment)
      initScores(
        qs.map((q) => ({
          question_number: q.question_number,
          max_marks: q.max_marks,
          awarded_marks: q.awarded_marks,
          comment: q.comment,
        }))
      );

      // Refresh submissions list to get updated statuses
      if (sessionId) {
        submissionsApi.listForSession(sessionId).then(setSubmissions);
      }
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleSelectStudent = (submissionId: string) => {
    loadSubmission(submissionId);
  };

  const handleGenerateReport = async () => {
    if (!sessionId) return;
    setGeneratingReport(true);
    try {
      const blob = await markingApi.downloadReport(sessionId);
      downloadBlob(blob, `${sessionId}_report.pdf`);
    } catch (error) {
      showToast(await extractErrorMessage(error, 'Could not generate the report. Please try again.'), 'error');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleCompleteMarking = async () => {
    if (!activeSubmissionId) return;
    setCompletingMarking(true);
    try {
      const result = await markingApi.completeSubmission(activeSubmissionId);
      setSubmissions((subs) =>
        subs.map((s) =>
          s.id === activeSubmissionId
            ? { ...s, status: result.status, total_score: result.total_score }
            : s
        )
      );
      showToast('Marked as complete for this student.', 'success');
    } catch (error) {
      showToast(await extractErrorMessage(error, 'Could not mark this submission complete. Please try again.'), 'error');
    } finally {
      setCompletingMarking(false);
    }
  };

  const activeQuestion = questions[activeQuestionIndex] ?? null;
  const activeSubmission = submissions.find((s) => s.id === activeSubmissionId) ?? null;
  const isApproved = session?.review_status === 'approved';
  const allMarked = submissions.length > 0 && submissions.every((s) => s.status === 'marked');

  if (loadingSubmissions) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!loadingSubmissions && submissions.length === 0) {
    return (
      <div className="flex flex-col h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-4 flex-shrink-0">
          <Link to="/teacher" className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-base font-semibold text-gray-900">Marking</h1>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <p className="text-gray-900 font-medium text-lg">No submissions in this session</p>
            <p className="text-sm text-gray-500 mt-2">
              The scanner operator hasn't uploaded any sheets to this session yet, or all sheets were flagged.
              Go back to the dashboard and select the session that has submissions.
            </p>
            <Link to="/teacher" className="mt-4 inline-block text-sm text-primary hover:underline">
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            to={`/teacher/sessions/${sessionId}`}
            className="text-gray-400 hover:text-gray-600 focus:outline-none"
            aria-label="Back to session"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Marking</h1>
            {scheme && (
              <p className="text-xs text-gray-400">
                {scheme.questions.length} questions in scheme
              </p>
            )}
          </div>
        </div>

        {!scheme && (
          <Link
            to={`/teacher/sessions/${sessionId}/scheme`}
            className="text-sm text-primary hover:underline"
          >
            Upload marking scheme →
          </Link>
        )}

        {allMarked && (
          <Button
            variant="secondary"
            size="sm"
            loading={generatingReport}
            onClick={handleGenerateReport}
          >
            Generate Report
          </Button>
        )}
      </header>

      {/* Review status banners */}
      {session?.review_status === 'approved' && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-2 flex items-center gap-2 text-green-800 text-sm flex-shrink-0">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Marking approved — results are locked. Scores are read-only.
        </div>
      )}
      {session?.review_status === 'rejected' && session.review_note && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-amber-800 text-sm flex-shrink-0">
          <span className="font-medium">Sent back for revision:</span> {session.review_note}
        </div>
      )}

      {/* Three-panel layout */}
      <div className="flex-1 overflow-hidden grid grid-cols-[240px_1fr_320px]">
        {/* Left — Student list */}
        <StudentList
          submissions={submissions}
          activeId={activeSubmissionId}
          totalQuestions={questions.length}
          onSelect={handleSelectStudent}
        />

        {/* Centre — Question display */}
        <div className="overflow-hidden bg-white">
          {loadingQuestions ? (
            <div className="flex items-center justify-center h-full">
              <Spinner size="lg" />
            </div>
          ) : (
            <QuestionDisplay
              question={activeQuestion}
              sheets={sheets}
              showImage={showOriginalImage}
              onToggleImage={toggleOriginalImage}
            />
          )}
        </div>

        {/* Right — Score panel */}
        <ScorePanel
          questions={questions}
          readOnly={isApproved}
          isComplete={activeSubmission?.status === 'marked'}
          onCompleteMarking={handleCompleteMarking}
          completingMarking={completingMarking}
        />
      </div>

      {/* Keyboard handler — disabled when marking is locked */}
      {questions.length > 0 && !loadingQuestions && !isApproved && (
        <KeyboardHandler
          questions={questions}
          submissions={submissions}
          onSelectStudent={handleSelectStudent}
        />
      )}
    </div>
  );
}
