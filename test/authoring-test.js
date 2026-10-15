const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { createAuthoring, reportCheckSchema, groups } = require('../src/quiz/authoring');
const { generate, questionSchema } = require('../src/quiz/generator');
const { toTables, fromTables } = require('../src/db/schema');
const http = require('node:http');
const { createQuizApi } = require('../src/quiz/api');
const { duplicateContent } = require('../src/quiz/validate');
const { validateQuestion } = require('../src/quiz/validate');

test('generated duplicates include parameter-only variants and closely paraphrased explanations', () => {
  const first = {
    stem: 'A student sends 16,000 bits across a link at 2,000,000 bits per second. What is the transmission delay?',
    explanation:
      'Transmission delay is packet size in bits divided by link rate in bits per second: 16,000 divided by 2,000,000 is 0.008 seconds.',
    sourceIds: ['p-lecture'],
  };
  const changed = {
    ...first,
    stem: 'A student sends 20,000 bits across a link at 4,000,000 bits per second. What is the transmission delay?',
    explanation:
      'Transmission delay is packet size in bits divided by link rate in bits per second: 20,000 divided by 4,000,000 is 0.005 seconds.',
  };
  assert.equal(duplicateContent(first, changed), true);
  const different = {
    stem: 'Which intervention reduces queueing when traffic persistently exceeds link capacity?',
    explanation: 'More buffer space cannot increase the sustainable service rate. Increase capacity or reduce offered traffic.',
    sourceIds: ['p-lecture'],
  };
  assert.equal(duplicateContent(first, different), false);
});

test('report evidence anchors cover long paragraphs and short-line reports using literal source text',()=>{
  const text='Background material without sentence boundaries '.repeat(60)+'Calibration anchor request cost is 97 credits';
  const check=reportCheckSchema([{stem:'What is the calibration anchor request cost in credits?',explanation:'The professor defines the calibration anchor.'}],[{passageId:'report-1',text}]);
  assert.ok(check.anchors.some(a=>a.quote.includes('97 credits')),'evidence must cover professor additions after a long paragraph');
  assert.ok(check.anchors.every(a=>text.includes(a.quote)));
  assert.ok(check.schema.properties.checks.items.properties.evidence.items.required.includes('quoteId'));
  const shortLines='a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\nl\nm\nn\no\np\nq\nr\ns\nt\nu\nv\nw\nx\ny\nz';
  assert.ok(reportCheckSchema([{stem:'Letters',explanation:'Alphabet'}],[{passageId:'report-2',text:shortLines}]).anchors.length>0);
});

test('normal documents remain holistic when several uploads exceed a single report input',()=>{
  const passages=['a','b'].flatMap(documentId=>[1,2].map(n=>({id:documentId+n,documentId,title:documentId+' document',text:'Concept explanation. '.repeat(1000)})));
  const parts=groups(passages,{documents:true});
  assert.equal(parts.length,2);
  assert.deepEqual(parts.map(p=>p.passageIds),[['a1','a2'],['b1','b2']]);
  assert.equal(groups(passages.map(p=>({...p,text:'A short lecture.'})),{documents:true}).length,1,'small uploads share one holistic request');
});

async function settled(j) {
  const deadline = Date.now() + 6000;
  while (['queued', 'running'].includes(j.status)) {
    if (Date.now() > deadline) throw new Error('Job did not settle');
    await new Promise((r) => setTimeout(r, 5));
  }
  return j;
}
const analysisText =
  '## Network concepts\nPackets carry data across a network. Latency measures delay; bandwidth measures capacity. These are distinct properties that affect applications differently.';
function fixture() {
  const db = seed(),
    course = db.courses.find((c) => c.id === 'c-comp'),
    topic = db.topics.find((t) => t.courseId === course.id),
    outcome = topic.outcomes[0];
  const pp = db.passages.filter((p) => p.courseId === course.id && p.topicId === topic.id);
  return { db, course, topic, outcome, pp };
}
const ai = async ({ prompt }) => ({
  json: prompt.startsWith('Recommend')
    ? {
        recommendations: [{ title: 'Apply concepts', description: 'Compare application scenarios grounded in the lecture.' }],
        insufficient: false,
      }
    : { markdown: analysisText, insufficient: false },
});

test('analysis checkpoints survive Postgres row mapping, interrupted jobs resume and cached parts are reused', async () => {
  const f = fixture();
  let calls = 0,
    saves = 0;
  const run = createAuthoring({
    db: f.db,
    persist: async () => {
      saves++;
    },
    ai: async (opts) => {
      calls++;
      return ai(opts);
    },
  });
  const j = run.start(f.course, 'analysis', { passageIds: f.pp.map((p) => p.id) }, 't-a');
  assert.equal(run.start(f.course, 'analysis', { passageIds: f.pp.map((p) => p.id) }, 't-a').id, j.id);
  await settled(j);
  assert.equal(j.status, 'complete');
  assert.ok(saves > 3);
  await run.review(f.course, j.id, analysisText);
  const tables = toTables(f.db, () => 1),
    restored = fromTables(tables);
  const c = restored.courses.find((c) => c.id === f.course.id),
    saved = c.authoringJobs[0];
  saved.status = 'running';
  delete saved.result.markdown;
  saved.result.synthesis = {};
  let resumedCalls = 0;
  const restarted = createAuthoring({
    db: restored,
    persist: async () => {},
    ai: async (opts) => {
      resumedCalls++;
      return ai(opts);
    },
  });
  assert.equal(saved.status, 'interrupted');
  restarted.resume(c, saved.id);
  await settled(saved);
  assert.equal(saved.status, 'complete');
  assert.equal(resumedCalls, 0, 'a cached single-group analysis needs no extra synthesis call');
  assert.equal(saved.reviewedText, analysisText);
});

test('review and recommendation configuration are enforced and material changes invalidate cached analysis', async () => {
  const f = fixture(),
    run = createAuthoring({ db: f.db, persist: async () => {}, ai });
  const a = run.start(f.course, 'analysis', { passageIds: f.pp.map((p) => p.id) }, 't-a');
  await settled(a);
  const cfg = {
    analysisId: a.id,
    topicId: f.topic.id,
    outcomeId: f.outcome.id,
    count: 2,
    learningGoals: 'Apply ideas',
    assessmentStyles: 'Scenarios',
  };
  assert.throws(() => run.start(f.course, 'recommendations', cfg, 't-a'), /Review and confirm/);
  await run.review(f.course, a.id, analysisText);
  const r = run.start(f.course, 'recommendations', cfg, 't-a');
  await settled(r);
  assert.equal(r.status, 'complete');
  assert.throws(
    () => run.start(f.course, 'generation', { ...cfg, count: 3, recommendationId: r.id, selected: ['r1'] }, 't-a'),
    /configuration changed/,
  );
  assert.throws(
    () => run.start(f.course, 'generation', { ...cfg, recommendationId: r.id, selected: ['missing'] }, 't-a'),
    /Select at least/,
  );
  f.pp[0].text += ' changed';
  assert.throws(() => run.start(f.course, 'recommendations', cfg, 't-a'), /material changed/);
});

test('partial batches keep valid questions and refill missing slots without duplicates, including explicit recovery', async () => {
  const f = fixture();
  let calls = 0;
  const stems = [
    'How does a network choose the destination for a packet?',
    'Which component controls access to a shared communication medium?',
    'What is the main consequence of reducing available bandwidth?',
  ];
  const item = (stem) => ({
    type: 'mcq',
    stem,
    options: ['First choice', 'Second choice', 'Third choice', 'Fourth choice'],
    answerIndex: 0,
    explanation: 'The cited course material explains the distinction.',
    difficulty: 'medium',
    sourceIds: [f.pp[0].id],
  });
  const args = { ...f, count: 3, userId: 't-a', format: 'mcq', checkpoint: async () => {} };
  const first = await generate({
    ...args,
    drafter: async () => ({
      items: ++calls === 1 ? [item(stems[0]), { ...item(stems[1]), options: ['same', 'same', 'same', 'same'] }] : [],
    }),
  });
  assert.equal(first.body.created.length, 1);
  assert.equal(first.body.missing, 2);
  const kept = first.body.created[0];
  const second = await generate({
    ...args,
    force: true,
    resumeLogId: first.body.generationId,
    drafter: async (ctx) => {
      assert.equal(ctx.count, 2);
      return { items: [item(stems[1]), item(stems[2])] };
    },
  });
  assert.equal(second.body.created.length, 3);
  assert.equal(second.body.missing, 0);
  assert.equal(second.body.created[0], kept);
  assert.equal(new Set(second.body.created).size, 3);
  assert.ok(second.body.created.every((id) => f.db.questions.find((q) => q.id === id).status === 'draft'));
});

test('semantic verification rejects unsupported answers and retains supported drafts', async () => {
  const f = fixture();
  let index = 0;
  const run = createAuthoring({
    db: f.db,
    persist: async () => {},
    ai: async (opts) => {
      if (!opts.prompt.startsWith('Independently')) return ai(opts);
      const data = JSON.parse(opts.prompt.slice(opts.prompt.indexOf('\n') + 1));
      return {
        json: {
          checks: data.questions.map((question, index) => ({
            index,
            correct: !question.stem.includes('Unsupported'),
            oneCorrect: true,
            aligned: true,
            duplicate: false,
            fitsConfiguration: true,
            unsupportedClaims: [],
            answerIndex: 0,
            evidence: [{ passageId: f.pp[0].id, quote: data.sources[0].text.slice(0, 50) }],
          })),
        },
      };
    },
    drafter: async () => ({
      items: [
        {
          type: 'mcq',
          stem:
            index++ === 0
              ? 'Unsupported invented answer from outside the course?'
              : 'Which delivery mechanism is explained in the course network material?',
          options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
          answerIndex: 0,
          explanation: 'An explanation based on the source.',
          difficulty: 'medium',
          sourceIds: [f.pp[0].id],
        },
      ],
    }),
  });
  const a = run.start(f.course, 'analysis', { passageIds: f.pp.map((p) => p.id) }, 't-a');
  await settled(a);
  await run.review(f.course, a.id, analysisText);
  const cfg = { analysisId: a.id, topicId: f.topic.id, outcomeId: f.outcome.id, count: 1 };
  const r = run.start(f.course, 'recommendations', cfg, 't-a');
  await settled(r);
  const g = run.start(f.course, 'generation', { ...cfg, recommendationId: r.id, selected: ['r1'] }, 't-a');
  await settled(g);
  assert.equal(g.status, 'complete');
  assert.equal(g.result.created.length, 1);
  assert.ok(g.result.rejected.some((x) => x.errors.some((e) => e.includes('source alignment'))));
  const q = f.db.questions.find((q) => q.id === g.result.created[0]);
  const interrupted = JSON.parse(JSON.stringify(f.db));
  interrupted.questions = interrupted.questions.filter((x) => x.id !== q.id);
  interrupted.generationLog = interrupted.generationLog.filter((x) => x.id !== g.result.generationId);
  createAuthoring({ db: interrupted, persist: async () => {}, ai });
  assert.deepEqual(
    interrupted.questions.find((x) => x.id === q.id),
    q,
    'the course checkpoint repairs a missing question write',
  );
  assert.ok(
    interrupted.generationLog.some((x) => x.id === g.result.generationId),
    'the generation log is repaired before question rows',
  );
  const existing = interrupted.questions.find((x) => x.id === q.id);
  existing.status = 'published';
  createAuthoring({ db: interrupted, persist: async () => {}, ai });
  assert.equal(existing.status, 'published', 'recovery does not overwrite later professor decisions');
  const partial = JSON.parse(JSON.stringify(f.db));
  partial.generationLog.find((x) => x.id === g.result.generationId).createdQuestionIds = [];
  createAuthoring({ db: partial, persist: async () => {}, ai });
  assert.ok(
    partial.generationLog.find((x) => x.id === g.result.generationId).createdQuestionIds.includes(q.id),
    'an older log row is reconciled with saved drafts',
  );
  // A partial parent can retain candidates/cooldowns from an interrupted check.
  // A replacement is new work, never a replay of those unrelated candidates.
  g.pendingBatch = { items: [{ stem: 'Unfinished parent candidate' }] };
  g.retryAt = Date.now() + 60000;
  g._diagnostics = { step: 'parent' };
  const replacement = run.regenerate(f.course, q, 't-a');
  assert.equal(replacement.pendingBatch, undefined);
  assert.equal(replacement.retryAt, undefined);
  assert.equal(replacement._validation, undefined);
  assert.equal(replacement._diagnostics, undefined);
  assert.equal(run.regenerate(f.course, q, 't-a').id, replacement.id);
  await settled(replacement);
  assert.equal(q.status, 'draft', 'regeneration never deletes or rejects the original');
});

test('authoring access is course-scoped and retried imports acknowledge durable storage without duplicating passages', async (t) => {
  const db = seed();
  let unavailable = false,
    flushes = 0;
  const api = createQuizApi({
    store: {
      db,
      save() {},
      async flush() {
        flushes++;
      },
      pending: () => unavailable,
    },
    authoringAI: ai,
  });
  const server = http.createServer((req, res) => api.handle(req, res));
  await new Promise((r) => server.listen(0, r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(method, path, body, token) {
    const r = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json() };
  }
  const teacher = (await request('POST', '/api/login', { userId: 't-a' })).body.token;
  const student = (await request('POST', '/api/login', { userId: 's-01' })).body.token;
  assert.equal((await request('POST', '/api/hero-lab/test-ai', {})).status, 401);
  assert.equal((await request('POST', '/api/hero-lab/test-ai', {}, student)).status, 403);
  assert.equal((await request('GET', '/api/teacher/courses/c-comp/authoring')).status, 401);
  assert.equal((await request('GET', '/api/teacher/courses/c-comp/authoring', null, student)).status, 403);
  assert.equal((await request('GET', '/api/teacher/courses/c-stats/authoring', null, teacher)).status, 404);
  const topic = db.topics.find((t) => t.courseId === 'c-comp');
  const body = {
    topicId: topic.id,
    outcomeId: topic.outcomes[0].id,
    title: 'A reviewed import',
    text: analysisText,
    confirmNoPersonalData: true,
    origin: 'pptx',
    fileName: 'A reviewed import.pptx',
    documentId: 'a'.repeat(64),
  };
  unavailable = true;
  const failed = await request('POST', '/api/teacher/courses/c-comp/import', body, teacher);
  assert.equal(failed.status, 503);
  assert.match(failed.body.error, /could not be saved/);
  unavailable = false;
  const retry = await request('POST', '/api/teacher/courses/c-comp/import', body, teacher);
  assert.equal(retry.status, 200);
  const again = await request('POST', '/api/teacher/courses/c-comp/import', body, teacher);
  assert.equal(again.body.id, retry.body.id);
  assert.equal(retry.body.fileName, body.fileName);
  const restoredImport = fromTables(toTables(db, () => 1)).passages.find(p => p.id === retry.body.id);
  assert.equal(restoredImport.fileName,body.fileName);
  assert.equal(restoredImport.documentId,body.documentId);
  assert.equal(db.passages.filter((p) => p.title === body.title).length, 1);
  assert.ok(flushes >= 3, 'even a cached import must confirm pending data reached storage');

  const starts = await Promise.all(Array.from({ length: 4 }, () => request('POST',
    '/api/teacher/courses/c-comp/authoring', { kind: 'analysis', passageIds: [retry.body.id] }, teacher)));
  assert.ok(starts.every((r) => r.status === 202));
  assert.equal(new Set(starts.map((r) => r.body.id)).size, 1, 'simultaneous duplicate requests share one job');
  const job = db.courses.find((c) => c.id === 'c-comp').authoringJobs[0];
  await settled(job);
  assert.equal(job.calls, 1);
  const callsBeforeSaving = job.calls;
  for (let i = 0; i < 3; i++) {
    assert.equal((await request('GET', '/api/teacher/courses/c-comp/authoring', null, teacher)).status, 200);
    assert.equal((await request('GET', `/api/teacher/courses/c-comp/authoring/${job.id}`, null, teacher)).status, 200);
    assert.equal((await request('PUT', `/api/teacher/courses/c-comp/authoring/${job.id}/review`, { markdown: analysisText }, teacher)).status, 200);
  }
  assert.equal(job.calls, callsBeforeSaving, 'fetching and saving consume zero inference calls');

  const question = {
    id: 'q-audit-ai', courseId: 'c-comp', topicId: topic.id, outcomeId: topic.outcomes[0].id,
    origin: 'ai', status: 'draft', reports: [], versions: [{
      v: 1, type: 'mcq', stem: 'Which property of this reviewed lecture describes packet travel delay?',
      options: ['Latency', 'Bandwidth', 'Routing', 'Switching'], answerIndex: 0,
      explanation: 'Latency measures travel delay in the source.', difficulty: 'medium', sourceIds: [retry.body.id],
    }],
  };
  db.questions.push(question);
  const edit = await request('PUT', '/api/teacher/questions/' + question.id,
    { ...question.versions[0], sourceIds: [] }, teacher);
  assert.equal(edit.status, 400);
  assert.ok(edit.body.details.some((e) => /cite at least one source/.test(e)));
  question.versions[0].sourceIds = [];
  assert.equal((await request('POST', '/api/teacher/questions/' + question.id + '/status', { action: 'approve' }, teacher)).status, 400);
  assert.equal(question.status, 'draft', 'invalid AI questions cannot be published');
});

test('quota failure during batch validation preserves candidates across restart without drafting again', async () => {
  const f = fixture();
  let draftCalls = 0,
    limited = true;
  const provider = async (opts) => {
    if (opts.prompt.startsWith('Course:')) {
      draftCalls++;
      assert.ok(opts.schema?.properties.questions, 'drafting must preserve the MCQ response schema');
      return {
        json: {
          questions: [
            {
              type: 'mcq',
              stem: 'Which mechanism explains the network delivery behaviour in the lecture?',
              options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
              answerIndex: 0,
              explanation: 'The source explains this delivery behaviour.',
              difficulty: 'medium',
              sourceIds: [f.pp[0].id],
            },
          ],
        },
        model: 'gemini-3.5-flash-lite',
      };
    }
    if (opts.prompt.startsWith('Independently')) {
      if (limited) throw Object.assign(new Error('Shared AI quota is temporarily exhausted.'), { status: 429, retryable: false });
      const data = JSON.parse(opts.prompt.slice(opts.prompt.indexOf('\n') + 1));
      assert.ok(
        data.questions.every((q) => q.answerIndex === undefined),
        'the verifier must solve without the proposed answer key',
      );
      return {
        json: {
          checks: data.questions.map((q, index) => ({
            index,
            correct: true,
            oneCorrect: true,
            aligned: true,
            duplicate: false,
            fitsConfiguration: true,
            unsupportedClaims: [],
            answerIndex: 0,
            evidence: [{ passageId: q.sourceIds[0], quote: data.sources.find((s) => s.passageId === q.sourceIds[0]).text.slice(0, 50) }],
          })),
        },
      };
    }
    return ai(opts);
  };
  const run = createAuthoring({ db: f.db, persist: async () => {}, ai: provider });
  const a = run.start(f.course, 'analysis', { passageIds: f.pp.map((p) => p.id) }, 't-a');
  await settled(a);
  await run.review(f.course, a.id, analysisText);
  const cfg = { analysisId: a.id, topicId: f.topic.id, outcomeId: f.outcome.id, count: 1 };
  const r = run.start(f.course, 'recommendations', cfg, 't-a');
  await settled(r);
  const g = run.start(f.course, 'generation', { ...cfg, recommendationId: r.id, selected: ['r1'] }, 't-a');
  await settled(g);
  assert.equal(g.status, 'failed');
  assert.equal(g.pendingBatch.items.length, 1);
  assert.equal(draftCalls, 1);
  const restored = fromTables(toTables(f.db, () => 1)),
    course = restored.courses.find((c) => c.id === f.course.id);
  limited = false;
  const resumed = createAuthoring({ db: restored, persist: async () => {}, ai: provider }),
    job = course.authoringJobs.find((j) => j.id === g.id);
  resumed.resume(course, job.id);
  await settled(job);
  assert.equal(job.status, 'complete');
  assert.equal(job.result.created.length, 1);
  assert.equal(draftCalls, 1);
  assert.equal(job.pendingBatch, undefined);
});

test('saved report revisions alone ground mixed assessments, survive restart, and reuse analysis', async () => {
  const f = fixture(); let analyses = 0, batches = 0, verifications = 0;
  const reportText = '# Knowledge report\nPackets cross networks. Latency is travel delay; bandwidth is capacity.\nThe professor defines the anchor cost as 73 units per packet. Total cost is packet count times anchor cost.';
  const provider = async ({ prompt }) => {
    if (!prompt.startsWith('Independently')) { analyses++; return { json: {markdown:reportText,insufficient:false} }; }
    verifications++;
    const data = JSON.parse(prompt.slice(prompt.indexOf('\n')+1));
    assert.equal(data.sources.length,1);
    assert.match(data.sources[0].passageId,/^report-/);
    assert.ok(data.questions.every((q)=>q.answerIndex===undefined && q.answer===undefined && q.answerIndexes===undefined));
    return {json:{checks:data.questions.map((q,index)=>({index,correct:true,oneCorrect:true,aligned:true,duplicate:false,fitsConfiguration:true,
      questionValid:true,unambiguous:true,explanationSupported:true,statementTruth:q.type==='tf'?true:null,
      answerIndex:0,answerIndexes:q.type==='multi'?[0,1]:[],numericAnswer:q.type==='numeric' || q.answerMode==='numeric'?Number(data.sources[0].text.match(/cost as (\d+)/)[1]):null,
      unsupportedClaims:[],evidence:[{passageId:data.sources[0].passageId,quoteId:data.evidenceAnchors[0].id}],reason:'Report supported.'}))}};
  };
  const drafter = async (ctx) => {
    batches++;
    assert.equal(ctx.chunks.length,1);
    assert.match(ctx.chunks[0].passageId,/^report-/);
    assert.ok(ctx.chunks[0].text.includes('professor defines'));
    const cost=Number(ctx.chunks[0].text.match(/cost as (\d+)/)[1]);
    const shapes={
      mcq:{stem:'Which measure identifies the time spent travelling across a network?',options:['Latency','Capacity','Routing','Switching'],answerIndex:0},
      tf:{stem:'Bandwidth describes transfer capacity rather than the time needed to travel.',answerIndex:0},
      multi:{stem:'Select the statements consistent with the saved knowledge report.',options:['Latency measures delay','Bandwidth measures capacity','Latency is packet size','Capacity is travel time'],answerIndexes:[0,1]},
      numeric:{stem:cost===91 ? 'Using the updated report, calculate the charge for a single packet.' : `What is the professor-defined cost of sending one packet under the ${cost}-unit anchor rule?`,answer:cost,tolerance:0,unit:'units'},
      short:cost===91?{stem:'Using the updated saved report, calculate the charge for a single packet.',answerMode:'numeric',answer:cost,tolerance:0,unit:'units',modelAnswer:cost+' units',keyPoints:[cost+' units']}:{stem:'Explain why capacity and travel delay describe different network properties.',modelAnswer:'Capacity is the transfer rate; latency measures travel delay.',keyPoints:['Capacity measures transfer rate','Latency measures delay']},
      param:{stem:'For {a} packets, calculate total cost using the professor-defined anchor.',variables:[{name:'a',min:1,max:4,step:1}],answerExpr:`a*${cost}`,distractorExprs:[`a+${cost}`,`a-${cost}`],decimals:0,unit:'units'},
    };
    return {items:Object.entries(ctx.quantities).flatMap(([type,n])=>Array.from({length:n},()=>({type,...shapes[type],difficulty:'medium',explanation:'The saved report defines the relevant concepts and cost rule.',sourceIds:[ctx.chunks[0].passageId]})))};
  };
  const run=createAuthoring({db:f.db,persist:async()=>{},ai:provider,drafter});
  const a=run.start(f.course,'report',{},'t-a'); await settled(a);
  assert.equal(analyses,1,'normal-sized materials use one holistic request');
  await run.review(f.course,a.id,reportText,0);
  const firstSource=a.reportSourceId;
  await run.review(f.course,a.id,reportText,0); // lost save response is idempotent
  assert.equal(a.reportRevision,1);
  await assert.rejects(run.review(f.course,a.id,reportText+' stale edit',0),/Another saved version/);
  const cfg={analysisId:a.id,reportRevision:1,topicId:f.topic.id,outcomeId:f.outcome.id,quantities:{mcq:1,tf:1,multi:1,short:1}};
  const g=run.start(f.course,'generation',cfg,'t-a'); await settled(g);
  assert.equal(g.status,'complete',g.message); assert.equal(g.result.created.length,4);
  assert.equal(batches,1); assert.equal(verifications,1);
  assert.equal(run.start(f.course,'generation',cfg,'t-a').id,g.id);
  for(const id of g.result.created) {
    const v=f.db.questions.find(q=>q.id===id).versions.at(-1);
    assert.deepEqual(validateQuestion(v,{allowedSourceIds:new Set([firstSource])}).errors,[]);
  }
  // Removing original slides cannot invalidate an authoritative saved report.
  f.db.passages=f.db.passages.filter(p=>p.origin==='report');
  await run.review(f.course,a.id,reportText.replace('73','91'),1);
  assert.notEqual(a.reportSourceId,firstSource);
  assert.ok(f.db.passages.find(p=>p.id===firstSource).text.includes('73 units'));
  const restored=fromTables(toTables(f.db,()=>1)),course=restored.courses.find(c=>c.id===f.course.id);
  const restarted=createAuthoring({db:restored,persist:async()=>{},ai:provider,drafter});
  const latest=course.authoringJobs.find(j=>j.id===a.id);
  assert.equal(latest.reportRevision,2); assert.match(latest.reviewedText,/91 units/);
  assert.throws(()=>restarted.start(course,'generation',cfg,'t-a'),/saved report changed/);
  const second=restarted.start(course,'generation',{...cfg,reportRevision:2,quantities:{short:1},learningGoals:'Use the edited anchor cost'},'t-a');
  await settled(second); assert.equal(second.status,'complete',second.message);
  const generated=restored.questions.find(q=>q.id===second.result.created[0]);
  assert.equal(generated.versions[0].answer,91);
  assert.deepEqual(generated.versions[0].sourceIds,[latest.reportSourceId]);
  assert.equal(analyses,1,'a second assessment must not reanalyse slides');
  // A partial course-before-passages write is repaired on startup.
  restored.passages=restored.passages.filter(p=>p.id!==latest.reportSourceId);
  createAuthoring({db:restored,persist:async()=>{},ai:provider});
  assert.match(restored.passages.find(p=>p.id===latest.reportSourceId).text,/91 units/);
});

test('mixed batches retry only the missing type and never accept extra slots of a filled type',async()=>{
  const variants=questionSchema({mcq:2,numeric:1},'mixed').properties.questions.items.anyOf;
  assert.ok(variants[0].required.includes('answerIndex'),'mixed MCQs must structurally require an answer key');
  assert.ok(variants[1].required.includes('answer'),'numeric slots must structurally require a numeric answer');
  const f=fixture();let calls=0;
  const items={
    tf:{type:'tf',stem:'The course describes packets as units that carry data across networks.',answerIndex:0},
    numeric:{type:'numeric',stem:'How many bits are contained in two bytes under the stated conversion?',answer:16,tolerance:0,unit:'bits'},
  };
  const args={...f,count:2,format:'mixed',quantities:{tf:1,numeric:1},providerName:'gemini',batchSize:10,userId:'t-a',
    drafter:async ctx=>{
      calls++;
      if(calls===2)assert.deepEqual(ctx.quantities,{numeric:1});
      const selected=calls===1?[items.tf,items.tf]:[items.numeric];
      return {items:selected.map(q=>({...q,difficulty:'medium',explanation:'The report supplies this definition or conversion.',sourceIds:[f.pp[0].id]}))};
    },batchVerifier:async questions=>questions.map(()=>null)};
  const result=await generate(args);
  assert.equal(result.body.missing,0);assert.equal(result.body.created.length,2);assert.equal(calls,2);
  assert.deepEqual(result.body.created.map(id=>f.db.questions.find(q=>q.id===id).versions[0].type).sort(),['numeric','tf']);
});
