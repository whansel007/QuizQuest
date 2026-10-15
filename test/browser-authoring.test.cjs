const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { start } = require('../server');
const { lecture, pdf, pptx } = require('./support/lecture-fixtures.cjs');
let srv, browser, base;
let sequence = 0;
let inferenceCalls = 0;
let holdNextInference = 0;
let mockApplicationSupported = true;
const stems = [
  'A video call has enough capacity but responses are delayed. Which property explains this?',
  'Traffic arriving at a link exceeds its capacity. What happens to the waiting packets?',
  'A packet must leave its local network. Which device forwards it toward its destination?',
  'Several nearby computers need to exchange packets locally. Which device connects them?',
];
const ai = async ({ prompt }) => {
  inferenceCalls++;
  if (holdNextInference) { const delay=holdNextInference; holdNextInference=0; await new Promise((r)=>setTimeout(r,delay)); }
  if (prompt.startsWith('Independently')) {
    const d = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
    return {
      json: {
        applicationSupported:mockApplicationSupported,limitation:mockApplicationSupported?'':'The requested application needs a supported method absent from the saved report.',
        checks: d.questions.map((question, index) => ({
          index,
          correct: true,
          oneCorrect: true,
          questionValid: true,
          unambiguous: true,
          explanationSupported: true,
          statementTruth: question.type === 'tf' ? false : null,
          cognitiveStyle: question.type==='tf'?'conceptual':'application',outcomeAligned:true,difficultyAppropriate:true,scenarioGrounded:true,
          aligned: true,
          duplicate: false,
          fitsConfiguration: true,
          unsupportedClaims: [],
          answerIndex: question.type === 'tf' ? 1 : 0,
          answerIndexes:question.type==='multi'?[0,1]:[],numericAnswer:question.answerMode==='numeric'?10:null,
          evidence: question.sourceIds.map((id) => d.evidenceAnchors ? {passageId:id,quoteId:d.evidenceAnchors.find(a=>a.passageId===id).id} : { passageId: id, quote: d.sources.find((s) => s.passageId === id).text.slice(0, 50) }),
        })),
      },
    };
  }
  if (prompt.startsWith('Recommend'))
    return {
      json: {
        insufficient: false,
        recommendations: [
          { title: 'Apply network concepts', description: 'Use lecture scenarios to distinguish delay and capacity.' },
          { title: 'Compare devices', description: 'Distinguish local switching from routing between networks.' },
        ],
      },
    };
  return {
    json: {
      markdown:
        '## Network behaviour\n' +
        lecture +
        '\n\n### Connections across slides\nHigh bandwidth does not imply low latency.\n\n### Example assessment\nWhy can a high-capacity link still delay a call? Answer: capacity and travel time are different properties.',
      insufficient: false,
    },
  };
};
test.before(async () => {
  srv = start(0, {
    dataFile: null,
    authoringAI: ai,
    authoringDrafter: async (ctx) => {
      assert.equal(ctx.chunks.length,1);
      assert.match(ctx.chunks[0].passageId,/^report-/);
      assert.match(ctx.chunks[0].text,/Professor-specific report edit/);
      return ({
      items: [...Array.from({ length: ctx.quantities?.mcq || 0 }, () => ({
        type: 'mcq',
        stem: stems[sequence++ % stems.length],
        options: ['Latency', 'Bandwidth', 'Routing', 'Switching'],
        answerIndex: 0,
        explanation: 'The lecture distinguishes travel time from transfer capacity.',
        difficulty: 'medium',
        sourceIds: [ctx.chunks[0].passageId],
      })), ...Array.from({length:ctx.quantities?.tf || 0},()=>({type:'tf',
        stem:'Latency describes link transfer capacity rather than packet travel delay.',answerIndex:1,
        explanation:'False: latency measures travel delay; bandwidth describes transfer capacity.',difficulty:'medium',sourceIds:[ctx.chunks[0].passageId]})),
        ...Array.from({length:ctx.quantities?.short || 0},()=>({type:'short',answerMode:'text',stem:'Diagnose a hypothetical live call with ample capacity but delayed replies, explaining which network property matters.',modelAnswer:'Latency measures travel delay, while bandwidth describes capacity.',keyPoints:['Latency measures travel delay','Bandwidth describes capacity'],explanation:'The report distinguishes travel time from transfer capacity.',difficulty:'medium',sourceIds:[ctx.chunks[0].passageId]})),
        ...Array.from({length:ctx.quantities?.multi || 0},()=>({type:'multi',stem:'A hypothetical investigation finds slow packet delivery and constrained transfer capacity. Which properties should be distinguished?',options:['Latency','Bandwidth','Container colour','Device label'],answerIndexes:[0,1],explanation:'The report explains latency as delay and bandwidth as capacity.',difficulty:'medium',sourceIds:[ctx.chunks[0].passageId]}))],
    }); },
  });
  await new Promise((r) => srv.httpServer.once('listening', r));
  base = `http://localhost:${srv.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
});
test.after(async () => {
  await browser?.close();
  srv?.io.close();
});
test('PDF/PPTX upload, saved Markdown editing, preview/download, generation and publication work in the browser', async (t) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(async () => {
    await page.screenshot({ path: 'tmp/authoring-browser-final.png', fullPage: true });
    await page.close();
    assert.deepEqual(errors, []);
  });
  await page.goto(base);
  await page.getByRole('button', { name: 'Prof. Demo A' }).click();
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting', exact: true }).click();
  await page.getByRole('button', { name: 'Choose files', exact: true }).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Choose files' && !b.disabled));
  await page.waitForTimeout(200);
  let idleRequests = 0;
  const trackAuthoring = (req) => { if (req.url().endsWith('/authoring')) idleRequests++; };
  page.on('request', trackAuthoring);
  const idleCalls = inferenceCalls;
  await page.waitForTimeout(5500);
  assert.equal(idleRequests, 0, 'idle authoring makes no requests over two former poll periods');
  assert.equal(inferenceCalls, idleCalls, 'idle authoring never starts inference');
  page.off('request', trackAuthoring);
  await page.getByLabel('Lecture files').setInputFiles([
    { name: 'networks.pdf', mimeType: 'application/pdf', buffer: pdf(26 * 1024 * 1024) },
    { name: 'networks.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptx() },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from(lecture) },
  ]);
  await page.getByText('Files ready. All uploaded material will be processed together.', { exact: true }).waitFor();
  assert.equal(await page.getByText('Include this excerpt').count(),0);
  // Local extraction recovery survives a refresh without displaying raw excerpts.
  await page.reload();
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting', exact: true }).click();
  await page.getByText('networks.pptx',{exact:true}).waitFor();
  await page.getByRole('checkbox', { name: /This is authorised course material/ }).check();
  assert.match(await page.getByLabel('Lecture file upload status').innerText(), /Selected — ready to upload/);
  const beforeUpload = inferenceCalls;
  await page.getByRole('button', { name: 'Upload files', exact: true }).click();
  await page.getByText('All uploaded material is saved.', {exact:true}).waitFor();
  assert.equal(inferenceCalls, beforeUpload, 'uploading alone uses zero inference');
  assert.equal(srv.quiz.db.courses.find(c=>c.id==='c-comp').authoringJobs?.length || 0, 0);
  assert.equal(await page.getByLabel('Lecture file upload status').getByText('Uploaded', {exact:true}).count(), 3);
  // Recover uploaded filenames from server even without browser recovery data.
  await page.evaluate(() => new Promise((resolve, reject) => {
    const r = indexedDB.open('quizquest-authoring', 1);
    r.onsuccess = () => { const db=r.result; const tx=db.transaction('drafts','readwrite'); tx.objectStore('drafts').clear(); tx.oncomplete=()=>{db.close();resolve();}; tx.onerror=()=>reject(tx.error); };
  }));
  await page.reload();
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting', exact: true }).click();
  await page.getByLabel('Lecture file upload status').getByText('networks.pptx',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Lecture file upload status').getByText('Uploaded', {exact:true}).count(), 3);
  assert.equal(inferenceCalls, beforeUpload);
  // Selecting the same saved files again must not upload duplicate excerpts.
  let uploadRequests=0, reportPosts=0, activePolls=0, generationBody;
  page.on('request', req=>{
    if(req.url().endsWith('/import')) uploadRequests++;
    if(req.url().endsWith('/authoring')) { if(req.method()==='POST') reportPosts++; else activePolls++; }
    if(req.url().endsWith('/authoring') && req.method()==='POST' && req.postDataJSON()?.kind==='generation') generationBody=req.postDataJSON();
  });
  await page.getByLabel('Lecture files').setInputFiles([
    { name: 'networks.pdf', mimeType: 'application/pdf', buffer: pdf(26 * 1024 * 1024) },
    { name: 'networks.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptx() },
  ]);
  await page.getByText('Files ready. All uploaded material will be processed together.', {exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Upload files',exact:true}).count(),0);
  assert.equal(uploadRequests,0);
  holdNextInference=3000;
  await page.getByRole('button', { name: 'Generate report', exact: true }).evaluate(button=>{button.click();button.click();});
  const reportEditor=page.getByLabel('Knowledge report (Markdown)',{exact:true});
  await reportEditor.waitFor();
  assert.equal(reportPosts,1,'same-tick clicks start one job');
  assert.ok(activePolls >= 2,'an authorized active job is polled through completion');
  const beforeReuse=inferenceCalls;
  await page.getByRole('button', {name:'Generate report',exact:true}).click();
  await page.getByRole('button', {name:'Generate report',exact:true}).isEnabled();
  await page.waitForTimeout(200);
  assert.equal(inferenceCalls,beforeReuse,'unchanged materials reuse the completed report');
  await page.waitForTimeout(200);
  idleRequests = 0;
  page.on('request', trackAuthoring);
  const completedCalls = inferenceCalls;
  await page.waitForTimeout(5500);
  assert.equal(idleRequests, 0, 'polling stops after completion');
  assert.equal(inferenceCalls, completedCalls);
  page.off('request', trackAuthoring);
  const beforeEditing=inferenceCalls;
  const imported=srv.quiz.db.passages.filter(p=>p.importHash);
  assert.equal(imported.length,4);
  assert.match(imported.find(p=>p.title==='networks.pptx · Slide 1').text,/Slide one: Latency & bandwidth/);
  assert.match(imported.find(p=>p.title==='networks.pptx · Slide 1').text,/Speaker example/);
  assert.match(imported.find(p=>p.title==='networks.pdf · Page 1').text,/Latency is the time/);
  const edited=(await reportEditor.inputValue())+'\n\n## Professor-specific report edit\nBudget cap is 97 units.\n<script>window.reportInjected=true</script>';
  await reportEditor.fill(edited);
  await page.getByRole('region',{name:'Markdown editor: Knowledge report (Markdown)',exact:true}).getByRole('button',{name:'Preview',exact:true}).click();
  await page.getByRole('heading',{name:'Professor-specific report edit',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.reportInjected),undefined);
  await page.getByRole('region',{name:'Markdown editor: Knowledge report (Markdown)',exact:true}).getByRole('button',{name:'Write',exact:true}).click();
  const downloadEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download .md',exact:true}).click();
  const download=await downloadEvent;
  assert.equal(download.suggestedFilename(),'knowledge-report.md');
  assert.equal(require('node:fs').readFileSync(await download.path(),'utf8'),edited);
  await page.reload();
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting', exact: true }).click();
  assert.equal(await page.getByLabel('Knowledge report (Markdown)',{exact:true}).inputValue(),edited);
  await page.getByRole('button', { name: 'Save report',exact:true }).click();
  await page.getByText('Report saved',{exact:true}).waitFor();
  // A concurrent professor save must not replace this tab's unsaved editor.
  const localDraft=edited+'\nUnsaved local teaching plan.';
  await page.getByLabel('Knowledge report (Markdown)',{exact:true}).fill(localDraft);
  const reportJob=srv.quiz.db.courses.find(c=>c.id==='c-comp').authoringJobs.find(j=>j.input.reportBased);
  const concurrentText=edited+'\nAnother professor added a saved clarification.';
  const token=await page.evaluate(()=>sessionStorage.getItem('qq-token'));
  const concurrent=await page.request.put(`${base}/api/teacher/courses/c-comp/authoring/${reportJob.id}/review`,{
    headers:{authorization:'Bearer '+token},data:{markdown:concurrentText,reportRevision:1},
  });
  assert.equal(concurrent.status(),200);
  await page.getByRole('button',{name:'Refresh progress',exact:true}).click();
  await page.getByText(/A newer saved version is available/).waitFor();
  assert.equal(await page.getByLabel('Knowledge report (Markdown)',{exact:true}).inputValue(),localDraft);
  await page.getByRole('button',{name:'Save report',exact:true}).click();
  await page.getByText(/Another saved version exists/).waitFor();
  assert.equal(await page.getByLabel('Knowledge report (Markdown)',{exact:true}).inputValue(),localDraft);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Load saved report',exact:true}).click();
  assert.equal(await page.getByLabel('Knowledge report (Markdown)',{exact:true}).inputValue(),concurrentText);
  await page.getByRole('spinbutton',{name:'MCQ quantity',exact:true}).fill('1');
  await page.getByRole('spinbutton',{name:'True/False quantity',exact:true}).fill('1');
  await page.getByRole('spinbutton',{name:'Short Answer quantity',exact:true}).fill('1');
  await page.getByRole('spinbutton',{name:'Multi-select quantity',exact:true}).fill('1');
  assert.equal(await page.getByRole('spinbutton').count(),4);
  assert.equal(await page.getByRole('spinbutton',{name:'Numeric answer quantity',exact:true}).count(),0);
  assert.equal(await page.getByRole('spinbutton',{name:'Maths variation quantity',exact:true}).count(),0);
  await page.getByLabel('Topic', { exact: true }).fill('Network reasoning');
  await page.getByLabel('Learning outcome', { exact: true }).fill('Apply delay and bandwidth concepts to diagnose network scenarios.');
  assert.equal(await page.getByLabel('Assessment Style',{exact:true}).inputValue(),'both');
  await page.getByLabel('Assessment Style',{exact:true}).selectOption('both');
  await page.waitForTimeout(150);
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('quizquest-authoring',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('drafts','readwrite'),store=tx.objectStore('drafts'),read=store.get('report-workflow:t-a:c-comp');
      read.onsuccess=()=>{const draft=read.result;draft.config.quantities.numeric=7;draft.config.quantities.param=2;store.put(draft,'report-workflow:t-a:c-comp');};
      tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  }));
  await page.reload();
  await page.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
  await page.getByLabel('Topic',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Topic',{exact:true}).inputValue(),'Network reasoning');
  assert.equal(await page.getByLabel('Learning outcome',{exact:true}).inputValue(),'Apply delay and bandwidth concepts to diagnose network scenarios.');
  assert.equal(await page.getByLabel('Assessment Style',{exact:true}).inputValue(),'both');
  assert.equal(await page.getByRole('heading',{name:'Coverage',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:/Fill gap/}).count(),0);
  assert.equal(inferenceCalls,beforeEditing,'editing, recovery, saving, version checks and fetching use zero inference');
  await page.getByRole('button', { name: 'Generate questions',exact:true }).click();
  await page.getByRole('button', { name: 'Review drafts', exact: true }).waitFor();
  const tfJob=srv.quiz.db.courses.find(c=>c.id==='c-comp').authoringJobs.find(j=>j.kind==='generation');
  assert.equal(tfJob.result.created.length,4);
  assert.deepEqual(generationBody.quantities,{mcq:1,tf:1,short:1,multi:1},'recovery cannot submit hidden formats');
  assert.equal(tfJob.result.rejected.length,0,'valid False questions need no replacements');
  assert.equal(tfJob._validation.find(v=>v.candidate.type==='tf').pass,true);
  await page.screenshot({ path: 'tmp/authoring-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Review drafts', exact: true }).click();
  const card = page.locator('.qcard').filter({ hasText: stems[0] });
  assert.ok(!(await card.innerText()).includes('Apply delay and bandwidth concepts to diagnose network scenarios.'));
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = card.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Edit question', exact: true }) });
  await editor
    .getByLabel('Question', { exact: true })
    .fill('A live conversation has plenty of capacity but delayed responses. Which property is responsible?');
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting', exact: true }).click();
  await page.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();
  await page.locator('.qcard').filter({ hasText: stems[0] }).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Restore unsaved edit' }).click();
  assert.match(await page.getByLabel('Question', { exact: true }).inputValue(), /live conversation/);
  // Publication uses the existing bank action; no generated draft is auto-published.
  const q = srv.quiz.db.questions.find((q) => q.versions.at(-1).stem === stems[0]);
  assert.equal(q.status, 'draft');
  await page.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting', exact: true }).click();
  await page.getByRole('button', { name: 'Review drafts', exact: true }).click();
  await page.locator('.qcard').filter({ hasText: stems[0] }).getByRole('button', { name: 'Approve & publish', exact: true }).click();
  assert.equal(q.status, 'published');
  const user = srv.quiz.db.users.find((u) => u.id === 's-01'),
    cls = srv.quiz.db.classes.find((c) => c.id === 'cl-a');
  const other = srv.quiz.db.questions.filter((x) => x.courseId === q.courseId && x.id !== q.id);
  other.forEach((x) => (x.status = 'withdrawn'));
  const challenge = srv.quiz.services.pickChallenge(user, cls);
  assert.equal(challenge.q.id, q.id);
  assert.equal(challenge.view.options.length, 4);
  assert.equal(challenge.view.answerIndex, undefined);
  const answer = await srv.quiz.services.answerQuestion({
    user,
    cls,
    q,
    v: challenge.v,
    instance: challenge.instance,
    submission: { choice: 0 },
    servedAt: Date.now(),
  });
  assert.equal(answer.result.correct, true);
});

test('unchanged intentional generation repeats, double clicks deduplicate, and ambiguous failures recover without analysis',async t=>{
  // Dedicated novel candidates keep this test independent of later fixtures.
  const originalSequence=sequence,originalLength=stems.length;
  stems.push('The measured round trip changes from twenty milliseconds to eighty while link speed stays fixed. Diagnose the timing metric affected.',
    'An interactive robot must receive immediate feedback despite tiny command messages. Select the property to measure before deployment.',
    'Investigators compare elapsed packet travel intervals between endpoints during identical transfers. Identify the relevant reported quantity.');
  sequence=originalLength;t.after(()=>{stems.length=originalLength;sequence=originalSequence;});
  const page=await browser.newPage();t.after(()=>page.close());
  await page.goto(base);await page.getByRole('button',{name:'Prof. Demo A'}).click();
  await page.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
  await page.getByLabel('Topic',{exact:true}).waitFor();
  await page.getByLabel('Topic',{exact:true}).fill('Network reasoning');
  await page.getByLabel('Learning outcome',{exact:true}).fill('Apply delay and bandwidth concepts to diagnose network scenarios.');
  await page.getByLabel('Assessment Style',{exact:true}).selectOption('application');
  for(const name of ['True/False','Short Answer','Multi-select'])await page.getByRole('spinbutton',{name:name+' quantity',exact:true}).fill('0');
  await page.getByRole('spinbutton',{name:'MCQ quantity',exact:true}).fill('1');
  const course=srv.quiz.db.courses.find(c=>c.id==='c-comp');
  const priorQuestions=JSON.stringify(srv.quiz.db.questions),reports=JSON.stringify(course.authoringJobs.filter(j=>j.kind==='analysis'));
  const priorIds=new Set(course.authoringJobs.map(j=>j.id)),before=inferenceCalls;
  let posts=[];
  page.on('request',r=>{if(r.method()==='POST' && r.url().endsWith('/authoring') && r.postDataJSON().kind==='generation')posts.push(r.postDataJSON());});
  const generate=page.getByRole('button',{name:'Generate questions',exact:true});
  holdNextInference=300;
  await generate.evaluate(b=>{b.click();b.click();});
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Generate questions' && !b.disabled));
  assert.equal(posts.length,1);
  let created=course.authoringJobs.filter(j=>j.kind==='generation'&&!priorIds.has(j.id));assert.equal(created.length,1);assert.equal(created[0].status,'complete',created[0].message);
  const firstAttempt=posts[0].attemptId;
  // A definite server error before acceptance retains the request for explicit retry.
  await page.route('**/authoring',r=>r.request().method()==='POST'?r.fulfill({status:503,contentType:'application/json',body:'{"error":"mock temporarily unavailable"}'}):r.continue(),{times:1});
  await generate.click();await page.getByText('mock temporarily unavailable',{exact:true}).waitFor();
  assert.equal(course.authoringJobs.filter(j=>j.kind==='generation'&&!priorIds.has(j.id)).length,1);
  const secondAttempt=posts[1].attemptId;assert.notEqual(secondAttempt,firstAttempt);
  await page.reload();await page.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
  await page.getByRole('button',{name:'Retry generation request',exact:true}).waitFor();
  assert.equal(inferenceCalls,before+1,'refresh did not infer');
  await page.getByRole('button',{name:'Retry generation request',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Generate questions' && !b.disabled));
  assert.equal(posts.at(-1).attemptId,secondAttempt);
  created=course.authoringJobs.filter(j=>j.kind==='generation'&&!priorIds.has(j.id));assert.equal(created.length,2);assert.ok(created.every(j=>j.status==='complete'));
  // Lost acknowledgement after the server accepted a third request: recovery is GET-only.
  await page.route('**/authoring',async r=>{if(r.request().method()!=='POST')return r.continue();await r.fetch();await r.fulfill({status:503,contentType:'application/json',body:'{"error":"mock lost acknowledgement"}'});},{times:1});
  await generate.click();await page.getByText('mock lost acknowledgement',{exact:true}).waitFor();
  await page.reload();await page.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
  await page.getByRole('button',{name:'Generate questions',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Generate questions' && !b.disabled));
  assert.equal(await page.getByRole('button',{name:'Retry generation request',exact:true}).count(),0);
  created=course.authoringJobs.filter(j=>j.kind==='generation'&&!priorIds.has(j.id));assert.equal(created.length,3);
  assert.equal(new Set(created.map(j=>j.input.attemptId)).size,3);
  for(const q of JSON.parse(priorQuestions))assert.deepEqual(srv.quiz.db.questions.find(x=>x.id===q.id),q);
  assert.equal(JSON.stringify(course.authoringJobs.filter(j=>j.kind==='analysis')),reports);
  assert.equal(inferenceCalls,before+3,'one mocked independent verification per batch; custom drafting uses the mock drafter');
  await page.screenshot({path:'tmp/repeated-generation-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('region',{name:'Markdown editor: Knowledge report (Markdown)',exact:true}).getByRole('button',{name:'Preview',exact:true}).click();
  await page.screenshot({path:'tmp/repeated-generation-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});

test('partial uploads recover filenames and retry only unsaved excerpts without inference', async (t) => {
  const page=await browser.newPage();
  t.after(()=>page.close());
  await page.goto(base);
  await page.getByRole('button',{name:'Prof. Demo A'}).click();
  await page.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
  await page.getByRole('button',{name:'Choose files',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Choose files' && !b.disabled));
  await page.getByLabel('Lecture files').setInputFiles([
    {name:'recovery-test.pdf',mimeType:'application/pdf',buffer:pdf()},
    {name:'recovery-test.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:pptx()},
  ]);
  await page.getByText('Files ready. All uploaded material will be processed together.',{exact:true}).waitFor();
  const before=inferenceCalls, count=srv.quiz.db.passages.filter(p=>p.importHash).length;
  let imports=0;
  await page.route('**/import',async route=>{
    imports++;
    if(imports===3) await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'mock storage failure'})});
    else await route.continue();
  });
  await page.getByRole('checkbox',{name:/This is authorised course material/}).check();
  await page.getByRole('button',{name:'Upload files',exact:true}).click();
  await page.getByText(/mock storage failure/).waitFor();
  await page.getByText('Partially uploaded (1/2 excerpts)',{exact:true}).waitFor();
  await page.unroute('**/import');
  await page.reload();
  await page.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
  await page.getByText('Partially uploaded (1/2 excerpts)',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:/This is authorised course material/}).check();
  await page.getByRole('button',{name:'Upload files',exact:true}).click();
  await page.getByText('All uploaded material is saved.',{exact:true}).waitFor();
  assert.equal(srv.quiz.db.passages.filter(p=>p.importHash).length,count+3);
  assert.equal(inferenceCalls,before);
  const status=page.getByLabel('Lecture file upload status');
  for(const name of ['recovery-test.pdf','recovery-test.pptx']) {
    const row=status.locator('li').filter({hasText:name});
    assert.match(await row.innerText(),/Uploaded/);
  }
});

test('remove and replace uploads survive recovery, preserve reports, and require new-report confirmation', async t=>{
  const page=await browser.newPage(),stale=await browser.newPage();
  t.after(async()=>{await page.close();await stale.close();});
  async function open(p){await p.goto(base);await p.getByRole('button',{name:'Prof. Demo A'}).click();await p.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();await p.getByRole('button',{name:'Choose files',exact:true}).waitFor();await p.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Choose files' && !b.disabled));}
  await open(page);
  const before=inferenceCalls,course=srv.quiz.db.courses.find(c=>c.id==='c-comp');
  const reports=JSON.stringify(course.authoringJobs),versions=JSON.stringify(srv.quiz.db.passages.filter(p=>p.origin==='report')),questions=JSON.stringify(srv.quiz.db.questions);
  await page.getByLabel('Lecture files',{exact:true}).setInputFiles({name:'selected-only.txt',mimeType:'text/plain',buffer:Buffer.from(lecture)});
  await page.getByRole('button',{name:'Remove selected-only.txt',exact:true}).waitFor();
  await page.getByRole('button',{name:'Remove selected-only.txt',exact:true}).click();
  await page.getByText('File removed from attached material. Existing reports and questions are kept.',{exact:true}).waitFor();
  await page.reload();await page.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
  await page.getByRole('button',{name:'Choose files',exact:true}).waitFor();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Choose files' && !b.disabled));
  assert.equal(await page.getByRole('button',{name:'Remove selected-only.txt',exact:true}).count(),0);
  await page.getByLabel('Lecture files',{exact:true}).setInputFiles([
    {name:'remove-me.pdf',mimeType:'application/pdf',buffer:pdf()},
    {name:'replace-me.pptx',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation',buffer:pptx()},
  ]);
  await page.getByText('Files ready. All uploaded material will be processed together.',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:/This is authorised course material/}).check();
  await page.getByRole('button',{name:'Upload files',exact:true}).click();
  await page.getByText('All uploaded material is saved.',{exact:true}).waitFor();
  await open(stale);
  await stale.getByRole('button',{name:'Remove remove-me.pdf',exact:true}).waitFor();
  // A failed detach leaves the uploaded row available for retry.
  await page.route('**/imports',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"mock detach failed"}'}));
  await page.getByRole('button',{name:'Remove remove-me.pdf',exact:true}).click();
  await page.getByText('mock detach failed',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Remove remove-me.pdf',exact:true}).count(),1);
  await page.unroute('**/imports');
  await page.getByRole('button',{name:'Remove remove-me.pdf',exact:true}).click();
  await page.getByText('File removed from attached material. Existing reports and questions are kept.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Remove remove-me.pdf',exact:true}).count(),0);
  // A second tab's stale uploaded draft must not resurrect detached files.
  await stale.reload();await stale.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
  await stale.getByRole('button',{name:'Remove replace-me.pptx',exact:true}).waitFor();
  assert.equal(await stale.getByRole('button',{name:'Remove remove-me.pdf',exact:true}).count(),0);
  // Extract/validate a replacement before detaching the original.
  await page.getByRole('button',{name:'Replace replace-me.pptx',exact:true}).click();
  await page.getByLabel('Replacement lecture file',{exact:true}).setInputFiles({name:'empty.txt',mimeType:'text/plain',buffer:Buffer.from('')});
  await page.getByText(/No readable text found/).waitFor();
  assert.equal(await page.getByRole('button',{name:'Remove replace-me.pptx',exact:true}).count(),1);
  await page.getByRole('button',{name:'Replace replace-me.pptx',exact:true}).click();
  await page.getByLabel('Replacement lecture file',{exact:true}).setInputFiles({name:'replacement.pdf',mimeType:'application/pdf',buffer:pdf()});
  await page.getByText('Files ready. All uploaded material will be processed together.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Remove replace-me.pptx',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Generate report',exact:true}).isDisabled(),true);
  await page.getByRole('checkbox',{name:/This is authorised course material/}).check();
  await page.getByRole('button',{name:'Upload files',exact:true}).click();
  await page.getByText('All uploaded material is saved.',{exact:true}).waitFor();
  await page.reload();await page.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
  await page.getByRole('button',{name:'Remove replacement.pdf',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Remove replace-me.pptx',exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Remove remove-me.pdf',exact:true}).count(),0);
  assert.equal(inferenceCalls,before,'all add/remove/replace/recovery operations use zero inference');
  assert.equal(JSON.stringify(course.authoringJobs),reports);assert.equal(JSON.stringify(srv.quiz.db.passages.filter(p=>p.origin==='report')),versions);assert.equal(JSON.stringify(srv.quiz.db.questions),questions);
  let confirmed=false;
  page.once('dialog',async d=>{assert.match(d.message(),/Attached files have changed/);confirmed=true;await d.dismiss();});
  await page.getByRole('button',{name:'Generate report',exact:true}).click();
  assert.equal(confirmed,true);assert.equal(inferenceCalls,before);assert.equal(JSON.stringify(course.authoringJobs),reports);
  page.once('dialog',d=>d.accept());
  const response=page.waitForResponse(r=>r.url().endsWith('/authoring') && r.request().method()==='POST');
  await page.getByRole('button',{name:'Generate report',exact:true}).click();
  const result=await (await response).json();
  const job=course.authoringJobs.find(j=>j.id===result.id);
  while(['queued','running'].includes(job.status)) await new Promise(r=>setTimeout(r,10));
  assert.equal(job.status,'complete');
  const inputs=srv.quiz.db.passages.filter(p=>job.input.passageIds.includes(p.id));
  assert.ok(inputs.some(p=>p.fileName==='replacement.pdf'));
  assert.ok(!inputs.some(p=>['remove-me.pdf','replace-me.pptx'].includes(p.fileName)));
  assert.equal(course.authoringJobs.length,JSON.parse(reports).length+1);
  assert.equal(JSON.stringify(srv.quiz.db.passages.filter(p=>p.origin==='report')),versions);
  const afterGeneration=inferenceCalls;
  // Removing every attachment hides generation but leaves report history.
  while(await page.getByRole('button',{name:/^Remove /}).count()) {
    await page.getByRole('button',{name:/^Remove /}).first().click();
    await page.getByRole('button',{name:'Choose files',exact:true}).isEnabled();
    await page.waitForFunction(()=>![...document.querySelectorAll('button')].some(b=>b.textContent==='Choose files' && b.disabled));
  }
  assert.equal(await page.getByRole('button',{name:'Generate report',exact:true}).count(),0);
  assert.equal(inferenceCalls,afterGeneration);
  assert.equal(JSON.stringify(srv.quiz.db.passages.filter(p=>p.origin==='report')),versions);
  assert.equal(await page.getByRole('combobox',{name:'Knowledge report',exact:true}).count(),1);
});

test('Application insufficiency is actionable and cannot silently generate conceptual replacements',async t=>{
  const page=await browser.newPage();t.after(async()=>{mockApplicationSupported=true;await page.close();});
  await page.goto(base);await page.getByRole('button',{name:'Prof. Demo A'}).click();
  await page.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
  const course=srv.quiz.db.courses.find(c=>c.id==='c-comp');
  const savedReport=course.authoringJobs.find(j=>j.kind==='analysis' && j.reportSourceId);
  const select=page.getByRole('combobox',{name:'Knowledge report',exact:true});
  if(course.authoringJobs.filter(j=>j.kind==='analysis' && j.input.reportBased).length>1){await select.waitFor();page.once('dialog',d=>d.accept());await select.selectOption(savedReport.id);}
  await page.getByLabel('Topic',{exact:true}).waitFor();
  await page.getByLabel('Topic',{exact:true}).fill('Evidence for authentic application');
  await page.getByLabel('Learning outcome',{exact:true}).fill('Evaluate a novel problem requiring a method missing from this report.');
  await page.getByLabel('Assessment Style',{exact:true}).selectOption('application');
  await page.getByRole('spinbutton',{name:'MCQ quantity',exact:true}).fill('1');
  const before=inferenceCalls,reportText=savedReport.reviewedText;
  mockApplicationSupported=false;
  await page.getByRole('button',{name:'Generate questions',exact:true}).click();
  await page.getByText(/Add relevant methods, assumptions, worked reasoning or evidence/).waitFor();
  assert.equal(inferenceCalls,before+1,'one verification and no automatic replacement loop');
  assert.equal(course.authoringJobs.at(-1).result.created.length,0);
  assert.equal(savedReport.reviewedText,reportText);
  assert.equal(await page.getByRole('button',{name:'Resume saved work',exact:true}).count(),0);
});
