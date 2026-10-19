// ============================================================
// Professor-side shared state: the course list (cached per token)
// ============================================================

import { S, api } from '../api.js';

// Cached by token: switching professor in the same tab must not show the
// previous professor's courses. api() rejects responses that arrive after
// the user changed, so a stale list can never be stored under a new token.
let courses = null;
let coursesToken = null;
export async function loadCourses(force) {
  if (!courses || force || coursesToken !== S.token) {
    const token = S.token;
    courses = await api('GET', '/api/teacher/courses');
    coursesToken = token;
  }
  if (!S.courseId || !courses.some((c) => c.id === S.courseId)) S.courseId = courses[0]?.id;
  return courses;
}
export const currentCourse = () => courses?.find((c) => c.id === S.courseId);

// "Week 3 · Networking basics" (topics come from the server in week order)
export const topicLabel = (t) => (t ? (Number.isInteger(t.week) ? `Week ${t.week} · ${t.name}` : t.name) : '');
// Keep the shared topic inside this course. `required`: pages that work on
// one topic (AI drafting) fall back to the first topic instead of "all".
export function syncTopic(course, { required = false } = {}) {
  const topics = course?.topics || [];
  if (S.topicId && !topics.some((t) => t.id === S.topicId)) S.topicId = '';
  if (required && !S.topicId) S.topicId = topics[0]?.id || '';
  return topics.find((t) => t.id === S.topicId) || null;
}

// Starting topic + outcome for a TopicOutcomeFields pair
export function initialTags(course, init = {}) {
  const topic = course.topics.find((t) => t.id === init.topicId) || course.topics[0];
  const outcome = topic?.outcomes.find((o) => o.id === init.outcomeId) || topic?.outcomes[0];
  return { topicId: topic?.id, outcomeId: outcome?.id };
}

export const ORIGIN = { manual: 'written by hand', template: 'offline drafter', ai: 'AI draft', custom: 'drafted' };
export const RES = { wood: { emoji: '🪵' }, crystal: { emoji: '💎' }, herb: { emoji: '🌿' } };
