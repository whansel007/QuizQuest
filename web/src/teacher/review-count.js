// The number on the sidebar's "To review" tab: answers waiting for a mark
// plus open student reports, for the class being looked at. A hint only:
// if it can't be fetched the badge just keeps its last value, and the page
// itself reports any error.
import { S, api } from '../api.js';

export async function refreshReviewCount() {
  if (S.me?.role !== 'teacher' || !S.classId) return;
  const classId = S.classId;
  try {
    const [marking, reports] = await Promise.all([
      api('GET', `/api/teacher/classes/${classId}/marking`),
      api('GET', `/api/teacher/classes/${classId}/reports`),
    ]);
    if (S.classId === classId) S.reviewCount = marking.total + reports.items.length;
  } catch {
    // keep the last value
  }
}
