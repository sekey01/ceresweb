import api from './axios';
import type { QuestionScore, SessionResult } from '../types';

export interface ScoreInput {
  question_number: string;
  awarded_marks: number;
  max_marks: number;
  comment?: string | null;
}

export const markingApi = {
  getMarkingOverview: (sessionId: string) =>
    api.get(`/sessions/${sessionId}/marking`).then(r => r.data),

  saveScores: (submissionId: string, scores: ScoreInput[]) =>
    api.put<QuestionScore[]>(`/submissions/${submissionId}/scores`, scores).then(r => r.data),

  saveComment: (submissionId: string, questionNumber: string, comment: string | null) =>
    api.put(`/submissions/${submissionId}/scores/${questionNumber}/comment`, { comment }).then(r => r.data),

  getScores: (submissionId: string) =>
    api.get<QuestionScore[]>(`/submissions/${submissionId}/scores`).then(r => r.data),

  getResults: (sessionId: string) =>
    api.get<SessionResult[]>(`/sessions/${sessionId}/results`).then(r => r.data),

  completeSubmission: (submissionId: string) =>
    api.put<SessionResult>(`/submissions/${submissionId}/complete`).then(r => r.data),

  downloadReport: (sessionId: string) =>
    api
      .get(`/sessions/${sessionId}/report`, { responseType: 'blob' })
      .then(r => r.data as Blob),
};
