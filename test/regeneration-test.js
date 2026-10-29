const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { generate, buildUserPrompt } = require('../src/quiz/generator');

const short = (stem, concept = 'Flexbox alignment', answer = 'align-items: center;') => ({
  type: 'short', stem, modelAnswer: answer, answerMode: 'text', keyPoints: ['Correct property and value'],
  explanation: 'The cross axis is controlled by align-items.', difficulty: 'medium', sourceIds: ['css'],
  blueprint: { concept, taskType: 'calculate', intendedStyle: 'application' },
});
async function run(candidates, others = [], strict = true) {
  const db = seed(), course = db.courses[0], topic = db.topics.find(t => t.courseId === course.id);
  db.questions = [];
  const original = { id: 'original', question: short('Write CSS to align the guild banner on its cross axis.') };
  for (const [i, question] of others.entries()) db.questions.push({ id: 'old'+i, courseId: course.id, topicId: topic.id,
    status: 'draft', assessment: question.blueprint, versions: [question] });
  const contexts = [];
  const result = await generate({ db, course, topic, outcome: topic.outcomes[0], count: 1, quantities: {short: 1},
    force: true, userId: 'teacher', assessment: {style: 'application'}, replaces: ['original'],
    regeneration: strict ? { original, otherQuestions: others } : undefined,
    sourceChunks: [{passageId: 'css', text: 'Flexbox aligns elements. Content-box width adds padding and borders.'}],
    drafter: async ctx => { contexts.push(ctx); return {items: [candidates[Math.min(contexts.length-1,candidates.length-1)]]}; },
    batchVerifier: async qs => qs.map(() => null),
  });
  return {result, contexts, db};
}
test('regeneration blocks box-model number substitutions across MCQ and Short Answer with bounded retries', async () => {
  const old = {...short('Calculate the guild box total width: content 100px, padding 10px and border 2px.', 'CSS box model', '124px'),
    type: 'mcq', options: ['124px','100px','112px','120px'], answerIndex: 0};
  const candidates = [200,300,400].map(n => short(`Calculate the guild box total width: content ${n}px, padding 10px and border 2px.`, 'CSS box model', `${n+24}px`));
  const {result, contexts, db} = await run(candidates, [old]);
  assert.equal(contexts.length, 3);
  assert.equal(result.body.missing, 1);
  assert.deepEqual(result.body.created, []);
  assert.equal(db.questions.length, 1);
  assert.match(contexts[1].validationFeedback[0].errors.join(' '), /Coverage review|different numbers/);
});
test('coverage warning alone rejects regeneration even when wording differs', async () => {
  const old = short('Find the exterior span of the treasure container.', 'CSS box model', '124px');
  const {result} = await run([short('How broad is this panel after adding its edges?', 'CSS box model', '224px')], [old]);
  assert.equal(result.body.created.length, 0);
  assert.match(result.body.rejected[0].errors.join(' '), /Coverage review/);
});
test('retry repairs multiline answers while retaining the original concept and one-line code', async () => {
  const {result, contexts, db} = await run([
    short('Write the missing banner alignment declarations.', undefined, 'display: flex;\nalign-items: center;'),
    short('The banner already uses flex layout; supply the cross-axis centring declaration.'),
  ]);
  assert.equal(contexts.length, 2);
  assert.match(contexts[1].validationFeedback[0].errors.join(' '), /at most one line/);
  assert.equal(db.questions.find(q => q.id === result.body.created[0]).assessment.concept, 'Flexbox alignment');
  const prompt = buildUserPrompt(contexts[1]);
  assert.match(prompt, /Preserve the original concept, learning objective/);
  assert.match(prompt, /Change concept only if/);
  assert.match(prompt, /other current batch questions/);
  assert.match(prompt, /adventure theme/);
});
test('one-line numerical and explanatory answers remain valid', async () => {
  for (const answer of ['124px', 'The cross axis uses align-items, so centre it.']) {
    const {result} = await run([short('Give the single requested response for the guild banner.', undefined, answer)]);
    assert.equal(result.body.created.length, 1);
  }
});
test('initial generation retains advisory coverage and multiline answers', async () => {
  const old = short('Find the exterior span of the treasure container.', 'CSS box model', '124px');
  const {result} = await run([short('How broad is this panel after adding its edges?', 'CSS box model', 'First line\nSecond line')], [old], false);
  assert.equal(result.body.created.length, 1);
});
