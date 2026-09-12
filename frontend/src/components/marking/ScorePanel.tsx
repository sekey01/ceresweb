import { useRef, useEffect } from 'react';
import { useMarkingStore } from '../../store/markingStore';
import { useCommentSave } from '../../hooks/useCommentSave';
import { formatMarks, computeTotal, computeMax } from '../../utils/markingHelpers';
import type { SubmissionQuestion } from '../../types';
import Spinner from '../ui/Spinner';
import Button from '../ui/Button';

interface ScorePanelProps {
  questions: SubmissionQuestion[];
  readOnly?: boolean;
  isComplete?: boolean;
  onCompleteMarking?: () => void;
  completingMarking?: boolean;
}

export default function ScorePanel({
  questions,
  readOnly = false,
  isComplete = false,
  onCompleteMarking,
  completingMarking = false,
}: ScorePanelProps) {
  const {
    scores,
    activeQuestionIndex,
    setActiveQuestion,
    composingNumber,
  } = useMarkingStore();

  const { saveComment, flushComment } = useCommentSave();
  const prevIndexRef = useRef(activeQuestionIndex);

  // Flush comment save when question changes
  useEffect(() => {
    const prevIdx = prevIndexRef.current;
    if (prevIdx !== activeQuestionIndex) {
      const prevQ = questions[prevIdx];
      if (prevQ) {
        const entry = scores[prevQ.question_number];
        if (entry?.comment !== null) {
          flushComment(prevQ.question_number, entry?.comment ?? null);
        }
      }
      prevIndexRef.current = activeQuestionIndex;
    }
  }, [activeQuestionIndex]);

  const total = computeTotal(scores);
  const max = computeMax(scores);

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 overflow-hidden">
      {/* Header — running total */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Total Score</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">
          {formatMarks(total)}
          <span className="text-base font-normal text-gray-400"> / {formatMarks(max)}</span>
        </p>
      </div>

      {/* Composing indicator */}
      {composingNumber && (
        <div className="px-4 py-1.5 bg-primary-light border-b border-primary/20 text-sm text-primary font-mono">
          Entering: <strong>{composingNumber}</strong>
        </div>
      )}

      {/* Question list */}
      <div className="flex-1 overflow-y-auto">
        {questions.map((q, idx) => {
          const entry = scores[q.question_number];
          const isActive = idx === activeQuestionIndex;
          const hasComment = !!(entry?.comment);

          return (
            <div
              key={q.question_number}
              onClick={() => !readOnly && setActiveQuestion(idx)}
              className={`
                px-4 py-3 border-b border-gray-100 transition-colors
                ${readOnly
                  ? 'cursor-default border-l-4 border-l-transparent'
                  : isActive
                    ? 'cursor-pointer bg-primary-light border-l-4 border-l-primary'
                    : 'cursor-pointer hover:bg-gray-50 border-l-4 border-l-transparent'}
              `}
            >
              {/* Question row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-mono font-medium ${isActive ? 'text-primary' : 'text-gray-800'}`}>
                    {q.label}
                  </span>
                  {/* Comment icon — shown when question has a comment and is not active */}
                  {hasComment && !isActive && (
                    <svg className="h-3.5 w-3.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>

                {/* Right side: max marks chip + score + save indicator */}
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-mono">
                    /{q.max_marks}
                  </span>

                  {entry ? (
                    <span className={`text-sm font-mono font-semibold min-w-[2rem] text-right
                      ${entry.awarded_marks !== null ? 'text-gray-900' : 'text-gray-300'}`}>
                      {entry.awarded_marks !== null ? formatMarks(entry.awarded_marks) : '—'}
                    </span>
                  ) : (
                    <span className="text-sm font-mono text-gray-300">—</span>
                  )}

                  {/* Save indicator */}
                  <div className="w-4 flex items-center justify-center">
                    {entry?.saving && <Spinner size="sm" />}
                    {!entry?.saving && entry?.saved && !entry?.error && (
                      <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {entry?.error && (
                      <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>

              {/* Comment textarea — only shown for active question (not in read-only mode) */}
              {isActive && !readOnly && (
                <div className="mt-3" onClick={(e) => e.stopPropagation()}>
                  <div className="relative">
                    <textarea
                      value={entry?.comment ?? ''}
                      onChange={(e) => saveComment(q.question_number, e.target.value || null)}
                      placeholder="Add a comment for this question…"
                      maxLength={500}
                      rows={3}
                      className="
                        w-full text-sm rounded-md border border-gray-200 px-3 py-2
                        placeholder-gray-300 text-gray-700 resize-none
                        focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                      "
                    />
                    {/* Comment save indicator */}
                    <div className="absolute bottom-2 right-2 flex items-center gap-1">
                      {entry?.commentSaving && <Spinner size="sm" />}
                      {!entry?.commentSaving && entry?.commentSaved && entry?.comment && (
                        <span className="text-xs text-green-600">Saved</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 text-right">
                    {(entry?.comment ?? '').length}/500
                  </p>
                </div>
              )}
              {/* Show comment read-only when locked */}
              {readOnly && entry?.comment && (
                <p className="mt-1 text-xs text-gray-500 italic">{entry.comment}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      {readOnly ? (
        <div className="px-4 py-3 border-t border-green-200 bg-green-50 flex-shrink-0 flex items-center gap-2">
          <svg className="h-4 w-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-xs text-green-700 font-medium">Locked — marking approved by admin</p>
        </div>
      ) : (
        <div className="border-t border-gray-200 flex-shrink-0">
          {isComplete ? (
            <div className="px-4 py-3 bg-green-50 border-b border-green-200 flex items-center gap-2">
              <svg className="h-4 w-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-xs text-green-700 font-medium">Marking complete for this student</p>
            </div>
          ) : (
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <Button
                variant="primary"
                size="sm"
                className="w-full"
                loading={completingMarking}
                onClick={onCompleteMarking}
              >
                Mark as Complete
              </Button>
            </div>
          )}
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 leading-relaxed">
              <strong>F</strong> full · <strong>H</strong> half · <strong>0–9</strong> type marks ·{' '}
              <strong>Enter/Tab</strong> confirm + next · <strong>Shift+Tab</strong> prev ·{' '}
              <strong>⌫</strong> clear
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Click comment box to type — shortcuts pause while focused.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
