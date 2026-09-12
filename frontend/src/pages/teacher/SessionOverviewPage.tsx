import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { markingApi } from '../../api/marking';
import { sessionsApi } from '../../api/sessions';
import type { SessionResult, Sheet, ScanSession } from '../../types';
import TopBar from '../../components/layout/TopBar';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Spinner from '../../components/ui/Spinner';
import { formatMarks } from '../../utils/markingHelpers';
import { useToastStore } from '../../store/toastStore';
import { downloadBlob, extractErrorMessage } from '../../utils/download';

function exportResultsCSV(results: SessionResult[], sessionName: string) {
  const header = ['Student ID', 'Total Score', 'Max Score', 'Percentage', 'Status'];
  const rows = results.map(r => [
    r.student_id,
    r.total_score ?? '',
    r.max_possible,
    r.total_score != null ? ((r.total_score / r.max_possible) * 100).toFixed(1) + '%' : '',
    r.status,
  ]);
  const csv = [header, ...rows].map(row => row.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${sessionName}_results.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SessionOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<ScanSession | null>(null);
  const [results, setResults] = useState<SessionResult[]>([]);
  const [flagged, setFlagged] = useState<Sheet[]>([]);
  const [resolveInputs, setResolveInputs] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [generatingReport, setGeneratingReport] = useState(false);
  const { showToast } = useToastStore();

  const fetchData = () => {
    if (!id) return;
    Promise.allSettled([
      sessionsApi.get(id),
      markingApi.getResults(id),
      sessionsApi.getFlaggedSheets(id),
    ]).then(([sessionRes, resultsRes, flaggedRes]) => {
      if (sessionRes.status === 'fulfilled') setSession(sessionRes.value);
      if (resultsRes.status === 'fulfilled') setResults(resultsRes.value);
      if (flaggedRes.status === 'fulfilled') {
        const sheets = flaggedRes.value;
        setFlagged(sheets);
        const inputs: Record<string, string> = {};
        sheets.forEach(s => { inputs[s.id] = s.student_id_raw ?? ''; });
        setResolveInputs(inputs);
      }
    }).finally(() => setLoading(false));
  };

  useEffect(fetchData, [id]);

  const handleGenerateReport = async () => {
    if (!id) return;
    setGeneratingReport(true);
    try {
      const blob = await markingApi.downloadReport(id);
      downloadBlob(blob, `${id}_report.pdf`);
    } catch (error) {
      showToast(await extractErrorMessage(error, 'Could not generate the report. Please try again.'), 'error');
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleResolve = async (sheetId: string) => {
    const studentId = resolveInputs[sheetId]?.trim();
    if (!studentId || !id) return;
    setResolving(r => ({ ...r, [sheetId]: true }));
    try {
      await sessionsApi.resolveSheet(id, sheetId, studentId);
      // Refresh both lists after resolution
      fetchData();
    } finally {
      setResolving(r => ({ ...r, [sheetId]: false }));
    }
  };

  const columns = [
    { key: 'student_id', header: 'Student ID' },
    {
      key: 'status',
      header: 'Status',
      render: (r: SessionResult) => <Badge variant={r.status} />,
    },
    {
      key: 'score',
      header: 'Score',
      render: (r: SessionResult) => (
        <span className="font-mono text-sm">
          {r.total_score !== null ? formatMarks(r.total_score) : '—'} / {formatMarks(r.max_possible)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (_r: SessionResult) => (
        <Link to={`/teacher/sessions/${id}/marking`}>
          <Button size="sm" variant="secondary">Mark</Button>
        </Link>
      ),
    },
  ];

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  const totalMarked = results.filter(r => r.status === 'marked').length;
  const isApproved = session?.review_status === 'approved';
  const isRejected = session?.review_status === 'rejected';

  return (
    <div>
      <TopBar
        title="Session Overview"
        backTo="/teacher"
        actions={
          <div className="flex gap-2">
            {results.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => exportResultsCSV(results, id ?? 'session')}>
                Export CSV
              </Button>
            )}
            {results.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                loading={generatingReport}
                disabled={totalMarked < results.length}
                title={
                  totalMarked < results.length
                    ? `${results.length - totalMarked} student(s) still need marking before a report can be generated`
                    : undefined
                }
                onClick={handleGenerateReport}
              >
                Generate Report
              </Button>
            )}
            <Link to={`/teacher/sessions/${id}/scheme`}>
              <Button variant="secondary" size="sm">Manage Scheme</Button>
            </Link>
            {!isApproved && (
              <Link to={`/teacher/sessions/${id}/marking`}>
                <Button variant="primary" size="sm">Go to Marking</Button>
              </Link>
            )}
          </div>
        }
      />

      {isApproved && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-center gap-2 text-green-800 text-sm">
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          Marking approved — results are locked. Contact an admin if changes are needed.
        </div>
      )}
      {isRejected && session?.review_note && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 text-amber-800 text-sm">
          <span className="font-medium">Marking sent back for revision:</span> {session.review_note}
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Students', value: results.length },
            { label: 'Marked', value: totalMarked },
            { label: 'Remaining', value: results.length - totalMarked },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-lg border border-gray-200 p-5">
              <p className="text-sm text-gray-500">{stat.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* All done — final step: export results (no school-system integration yet) */}
        {!isApproved && results.length > 0 && totalMarked === results.length && (
          <div className="bg-primary-light border border-primary/20 rounded-lg p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-primary-dark">All students marked</p>
              <p className="text-sm text-gray-600 mt-0.5">
                Marking is complete for this session. Export the results to hand off — direct upload to the school's
                system isn't available yet.
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="secondary" size="sm" onClick={() => exportResultsCSV(results, id ?? 'session')}>
                Export CSV
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={generatingReport}
                onClick={handleGenerateReport}
              >
                Generate Report
              </Button>
            </div>
          </div>
        )}

        {/* Flagged sheets panel */}
        {flagged.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-amber-700 mb-3 flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                {flagged.length}
              </span>
              Flagged Sheets — Student ID Unclear
            </h2>
            <div className="space-y-3">
              {flagged.map(sheet => (
                <div
                  key={sheet.id}
                  className="flex gap-4 bg-amber-50 border border-amber-200 rounded-lg p-4"
                >
                  {/* Thumbnail */}
                  <a href={sheet.image_url} target="_blank" rel="noreferrer" className="flex-shrink-0">
                    <img
                      src={sheet.image_url}
                      alt="Scanned sheet"
                      className="w-20 h-28 object-cover rounded border border-amber-200 hover:opacity-80 transition-opacity"
                    />
                  </a>

                  {/* Info + resolve form */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-amber-600 mb-1">
                      Sheet #{sheet.upload_order}
                      {sheet.student_id_raw && (
                        <> · Detected: <span className="font-mono font-semibold">{sheet.student_id_raw}</span></>
                      )}
                      {sheet.id_confidence !== null && (
                        <> · Confidence: {Math.round(sheet.id_confidence * 100)}%</>
                      )}
                      {!sheet.student_id_raw && ' · No ID detected'}
                    </p>
                    <div className="flex gap-2 items-center mt-2">
                      <input
                        type="text"
                        value={resolveInputs[sheet.id] ?? ''}
                        onChange={e =>
                          setResolveInputs(r => ({ ...r, [sheet.id]: e.target.value }))
                        }
                        placeholder="Enter correct student ID"
                        className="flex-1 text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono"
                      />
                      <button
                        onClick={() => handleResolve(sheet.id)}
                        disabled={!resolveInputs[sheet.id]?.trim() || resolving[sheet.id]}
                        className="px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                      >
                        {resolving[sheet.id] ? 'Saving…' : 'Confirm ID'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Results table */}
        <div>
          {flagged.length === 0 && results.length === 0 && (
            <p className="text-sm text-gray-500">No submissions yet.</p>
          )}
          {results.length > 0 && (
            <Table
              columns={columns}
              data={results}
              keyExtractor={(r) => r.student_id}
              emptyMessage="No submissions yet."
            />
          )}
        </div>
      </div>
    </div>
  );
}
