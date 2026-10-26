// ============================================================
// What the floating generation status says about a generation job
// ------------------------------------------------------------
// Uses only what the server reports: questions saved so far
// (result.created, updated after each checked batch) against the batch
// size (input.count). Never an estimated percentage.
// ============================================================

const questions = (n) => `${n} question${n === 1 ? '' : 's'}`;

export function generationStatus(job) {
  const saved = job.result?.created?.length || 0, total = job.input?.count || 0;
  const active = ['queued', 'running'].includes(job.status);
  const progress = `${saved} of ${total} saved to the Question Bank`;
  let s;
  if (active)
    // the server's "N of M questions ready" repeats the progress line
    s = { tone: '', title: 'Generating questions', detail: job.message === `${saved} of ${total} questions ready` ? '' : job.message || '' };
  else if (job.status === 'complete' && saved >= total)
    s = { tone: 'good', title: `${questions(saved)} saved to the Question Bank`, detail: 'Saved as drafts. Review answers and explanations before publishing.' };
  else if (saved > 0)
    s = { tone: 'warn', title: `${saved} of ${questions(total)} saved`, detail: job.status === 'complete' ? `${total - saved} could not be generated.` : job.message || '' };
  else s = { tone: 'bad', title: 'No questions were saved', detail: job.message || '' };
  return {
    ...s,
    active,
    saved,
    total,
    progress,
    warnings: job.result?.warnings?.length || 0,
    canResume: ['failed', 'interrupted'].includes(job.status) && !job.result?.applicationUnsupported,
    announcement: active ? `Generating questions: ${progress}. ${s.detail}`.trim() : `${s.title}. ${s.detail}`.trim(),
  };
}
