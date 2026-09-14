import { useEffect, useState } from 'react';
import TopBar from '../../components/layout/TopBar';
import Spinner from '../../components/ui/Spinner';
import { auditApi } from '../../api/audit';
import type { AnalyticsOverview, SessionAnalytics, AuditSession } from '../../types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className=" bg-blue-500 border border-gray-200 rounded-lg p-5">
      <p className="text-sm text-white">{label}</p>
      <p className="text-3xl font-bold text-white mt-1 font-mono">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [sessions, setSessions] = useState<AuditSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [analytics, setAnalytics] = useState<SessionAnalytics | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  useEffect(() => {
    Promise.allSettled([
      auditApi.getOverviewStats(),
      auditApi.getSessions(),
    ]).then(([overviewRes, sessionsRes]) => {
      if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value);
      if (sessionsRes.status === 'fulfilled') {
        const s = sessionsRes.value;
        setSessions(s);
        if (s.length > 0) setSelectedSessionId(s[0].session_id);
      }
    }).finally(() => setLoadingOverview(false));
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    setLoadingAnalytics(true);
    setAnalytics(null);
    auditApi.getSessionAnalytics(selectedSessionId)
      .then(setAnalytics)
      .catch(() => setAnalytics(null))
      .finally(() => setLoadingAnalytics(false));
  }, [selectedSessionId]);

  return (
    <div>
      <TopBar title="Analytics" backTo="/admin" />
      <div className="p-6 space-y-6">

        {/* System-wide stat cards */}
        {loadingOverview ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : overview ? (
          <div className=" grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="Total Sessions" value={overview.total_sessions} />
            <StatCard label="Total Submissions" value={overview.total_submissions} />
            <StatCard
              label="Average Score"
              value={overview.average_score_pct != null ? `${overview.average_score_pct.toFixed(1)}%` : '—'}
            />
            <StatCard
              label="Flagged Sheets"
              value={overview.total_flagged_sheets}
              sub="low-confidence OCR"
            />
          </div>
        ) : null}

        {/* Review status summary */}
        {overview && (
          <div className="bg-blue-500 rounded-lg grid grid-cols-3 gap-4">
            <div className="rounded-lg p-4 text-center">
              <p className="text-white text-2xl font-bold font-mono">{overview.sessions_approved}</p>
              <p className="text-white text-xs  mt-1">Sessions Approved</p>
            </div>
            <div className=" rounded-lg p-4 text-center">
              <p className="text-white text-2xl font-bold font-mono">{overview.sessions_pending_review}</p>
              <p className="text-white text-xs  mt-1">Pending Review</p>
            </div>
            <div className=" rounded-lg p-4 text-center">
              <p className="text-white text-2xl font-bold font-mono">{overview.sessions_rejected}</p>
              <p className="text-white text-xs mt-1">Rejected</p>
            </div>
          </div>
        )}

        {/* Session selector */}
        {sessions.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Drill into session:</label>
            <select
              value={selectedSessionId}
              onChange={e => setSelectedSessionId(e.target.value)}
              className="flex-1 max-w-sm border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white"
            >
              {sessions.map(s => (
                <option key={s.session_id} value={s.session_id}>
                  {s.class_name} — {s.course_name} ({new Date(s.created_at).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Per-session charts */}
        {loadingAnalytics && (
          <div className="flex justify-center py-8"><Spinner /></div>
        )}

        {!loadingAnalytics && analytics && (
          <>
            {/* Session summary strip */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="Submissions" value={analytics.total_submissions} />
              <StatCard label="Marked" value={analytics.marked_count} />
              <StatCard
                label="Average Score"
                value={analytics.average_score != null ? analytics.average_score.toFixed(1) : '—'}
                sub={`out of ${analytics.max_possible}`}
              />
              <StatCard
                label="Pass Rate"
                value={analytics.pass_rate != null ? `${(analytics.pass_rate * 100).toFixed(1)}%` : '—'}
                sub="≥ 50% threshold"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Score distribution */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Score Distribution</h3>
                {analytics.score_distribution.length === 0 ? (
                  <p className="text-sm text-gray-400">No data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={analytics.score_distribution} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} name="Students" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Question performance */}
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Question Performance (avg %)</h3>
                {analytics.question_performance.length === 0 ? (
                  <p className="text-sm text-gray-400">No scored questions yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={analytics.question_performance}
                      margin={{ top: 4, right: 8, left: -16, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                      <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                      <ReferenceLine y={50} stroke="#ef4444" strokeDasharray="4 2" label={{ value: '50%', fontSize: 10, fill: '#ef4444' }} />
                      <Bar dataKey="avg_pct" fill="#10b981" radius={[3, 3, 0, 0]} name="Avg %" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )}

        {!loadingAnalytics && !analytics && selectedSessionId && (
          <p className="text-sm text-gray-400">No analytics data available for this session yet.</p>
        )}
      </div>
    </div>
  );
}
