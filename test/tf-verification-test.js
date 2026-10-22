const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { createAuthoring } = require('../src/quiz/authoring');
const { toTables, fromTables } = require('../src/db/schema');
const reportText = '# CSS knowledge report\nUnder content-box sizing, width applies only to content. Padding and borders are added outside it. Relative positioning preserves an element in normal document flow.';
async function settled(job) {
  const deadline=Date.now()+5000;
  while (['queued','running'].includes(job.status)) {
    if(Date.now()>deadline) throw new Error('Mock authoring job did not settle');
    await new Promise(r=>setTimeout(r,2));
  }
}
function item(truth, sourceId, overrides={}) {
  return {type:'tf',stem:truth ? 'Under content-box sizing, padding is added outside the specified content width.' : 'Relative positioning removes an element from the normal document flow.',
    answerIndex:truth?0:1,explanation:truth ? 'The report states that padding is added outside the content width.' : 'This is false: relative positioning preserves the element in normal flow.',
    difficulty:'medium',sourceIds:[sourceId],...overrides};
}
async function fixture({draft,verify}) {
  const db=seed(), course=db.courses.find(c=>c.id==='c-comp'), topic=db.topics.find(t=>t.courseId===course.id);
  const stages=[],batches=[],checks=[];
  const queue=createAuthoring({db,persist:async()=>{},ai:async opts=>{
    const stage=opts.requestContext.stage;stages.push(stage);
    if(stage==='analysis') return {json:{markdown:reportText,insufficient:false}};
    if(stage==='drafting') {
      const batch=opts.requestContext.batch;batches.push(batch);
      return {json:{questions:draft({batch,sourceId:course.authoringJobs.find(j=>j.kind==='analysis').reportSourceId,prompt:opts.prompt})}};
    }
    assert.equal(stage,'verification');
    const data=JSON.parse(opts.prompt.slice(opts.prompt.indexOf('\n')+1));
    assert.ok(data.questions.every(q=>!Object.hasOwn(q,'answerIndex')),'the verifier never receives proposed answer keys');
    assert.match(opts.prompt,/a FALSE statement with the correct False key is a VALID question/);
    for(const name of ['questionValid','unambiguous','explanationSupported','statementTruth']) assert.ok(opts.schema.properties.checks.items.required.includes(name));
    checks.push(data.questions);
    return {json:{checks:data.questions.map((q,index)=>{
      const truth=!q.stem.startsWith('Relative');
      const decision={index,correct:true,oneCorrect:true,questionValid:true,unambiguous:true,explanationSupported:true,statementTruth:truth,
        aligned:true,duplicate:false,fitsConfiguration:true,answerIndex:truth?0:1,answerIndexes:[],numericAnswer:null,
        unsupportedClaims:[],evidence:[{passageId:q.sourceIds[0],quoteId:data.evidenceAnchors.find(a=>a.passageId===q.sourceIds[0]).id}],reason:'Independently solved and source-supported.'};
      return verify ? verify({decision,q,batch:opts.requestContext.batch}) : decision;
    })}};
  }});
  const analysis=queue.start(course,'report',{},'t-a');await settled(analysis);
  await queue.review(course,analysis.id,reportText,0);
  async function generate(count=1) {
    const job=queue.start(course,'generation',{analysisId:analysis.id,reportRevision:1,topicId:topic.id,outcomeId:topic.outcomes[0].id,quantities:{tf:count}},'t-a');
    await settled(job);return job;
  }
  return {db,course,queue,stages,batches,checks,generate};
}
test('valid True and False statements pass independent verification without replacement requests',async()=>{
  const f=await fixture({draft:({sourceId})=>[item(true,sourceId),item(false,sourceId)],
    // Exercise separation even when an old overloaded flag reflects falsity.
    verify:({decision})=>({...decision,correct:decision.statementTruth,oneCorrect:decision.statementTruth})});
  const job=await f.generate(2);
  assert.equal(job.status,'complete',job.message);assert.equal(job.result.created.length,2);
  assert.deepEqual(f.stages,['analysis','drafting','verification']);assert.equal(job.calls,2);
  assert.equal(job.requestBudget,18);assert.deepEqual(job.result.rejected,[]);
  assert.deepEqual(job._validation.map(v=>v.candidate.answerIndex),[0,1]);
  assert.deepEqual(job._validation.map(v=>v.verification.statementTruth),[true,false]);
  assert.ok(job._validation.every(v=>v.pass));
});
test('invalid keys, explanations, ambiguity and missing evidence remain fail-closed',async t=>{
  const scenarios=[
    ['incorrect proposed key', {answerIndex:0}, d=>d],
    ['incorrect False key for a True statement', {stem:item(true,'unused').stem,answerIndex:1,explanation:item(true,'unused').explanation}, d=>d],
    ['inconsistent independently solved key',{},d=>({...d,answerIndex:0})],
    ['unsupported explanation',{explanation:'Relative positioning deletes surrounding elements.'},d=>({...d,explanationSupported:false,unsupportedClaims:['Surrounding elements are deleted.']})],
    ['explanation flag alone rejects',{},d=>({...d,explanationSupported:false})],
    ['ambiguity',{stem:'Relative positioning always makes layout better.'},d=>({...d,unambiguous:false,statementTruth:null,answerIndex:-1})],
    ['invalid question',{},d=>({...d,questionValid:false})],
    ['unresolved truth',{},d=>({...d,statementTruth:null})],
    ['missing truth',{},d=>{delete d.statementTruth;return d;}],
    ['missing explanation assessment',{},d=>{delete d.explanationSupported;return d;}],
    ['missing evidence',{},d=>({...d,evidence:[]})],
    ['ungrounded',{},d=>({...d,aligned:false})],
    ['unsupported claims',{},d=>({...d,unsupportedClaims:['Not established by the report.']})],
    ['duplicate',{},d=>({...d,duplicate:true})],
  ];
  for(const [name,overrides,decision] of scenarios) await t.test(name,async()=>{
    const f=await fixture({draft:({sourceId})=>[item(false,sourceId,overrides)],verify:({decision:d})=>decision(d)});
    const job=await f.generate();
    assert.equal(job.status,'failed');assert.equal(job.result.created.length,0);
    assert.equal(job.calls,6,'three bounded drafting/verification rounds');
    const log=f.db.generationLog.find(l=>l.id===job.result.generationId);
    assert.equal(log.rejected.length,3);assert.ok(job._validation.every(v=>!v.pass));
    assert.equal(log.rejected[0].candidate.answerIndex,overrides.answerIndex??1);
    assert.equal(log.rejected[0].candidate.explanation,overrides.explanation??item(false,'unused').explanation);
    assert.ok(log.rejected[0].errors.length);assert.equal(log.rejected[0].batch,1);
    assert.equal(job._validation[0].batch,1);assert.equal(job._validation[0].candidate.type,'tf');
    const restored=fromTables(toTables(f.db,()=>1));
    const audit=restored.courses.find(c=>c.id===f.course.id).authoringJobs.find(j=>j.id===job.id)._validation[0];
    assert.deepEqual(audit.candidate,job._validation[0].candidate);
    assert.deepEqual(audit.verification,job._validation[0].verification);
    assert.deepEqual(restored.generationLog.find(l=>l.id===log.id).rejected,log.rejected);
  });
});
test('replacement drafts and verification fill only missing slots and preserve accepted questions',async()=>{
  const f=await fixture({draft:({batch,sourceId,prompt})=>{
    if(batch===1)return [item(true,sourceId),item(false,sourceId,{answerIndex:0})];
    assert.match(prompt,/Write 1 question\(s\)/);
    assert.match(prompt,/remaining slots\): \{"tf":1\}/);
    const feedback=JSON.parse(prompt.split('Repair feedback from previous invalid slots: ')[1]);
    assert.ok(feedback.length>0 && feedback.every(f=>!Object.hasOwn(f,'candidate')),'audit payloads do not inflate repair prompts');
    return [item(false,sourceId)];
  }});
  const job=await f.generate(2);
  assert.equal(job.status,'complete',job.message);assert.equal(job.result.created.length,2);
  assert.deepEqual(f.stages,['analysis','drafting','verification','drafting','verification']);
  assert.deepEqual(f.checks.map(batch=>batch.length),[2,1]);
  assert.equal(job.calls,4);assert.deepEqual(f.batches,[1,2]);
  assert.equal(f.db.questions.find(q=>q.id===job.result.created[0]).versions.at(-1).answerIndex,0);
  assert.equal(f.db.questions.find(q=>q.id===job.result.created[1]).versions.at(-1).answerIndex,1);
  assert.equal(job.result.rejected.length,1);assert.equal(job.result.rejected[0].candidate.answerIndex,0);
  assert.equal(job._validation[1].verification.answerIndex,1);
  assert.equal(job._validation[1].candidate.answerIndex,0);
  assert.ok(job._validation[1].failedChecks.includes('answerKeyMatches'));
  assert.match(job.result.rejected[0].errors[0],/answerKeyMatches/);
});

test('structurally invalid TF candidates retain original details without spending verification calls',async()=>{
  const f=await fixture({draft:({sourceId})=>[item(false,sourceId,{answerIndex:2})]});
  const job=await f.generate();
  assert.equal(job.status,'failed');
  assert.deepEqual(f.stages,['analysis','drafting','drafting','drafting']);
  assert.equal(job.calls,3);
  const log=f.db.generationLog.find(l=>l.id===job.result.generationId);
  assert.equal(log.rejected.length,3);
  assert.ok(log.rejected.every(r=>r.candidate.answerIndex===2 && r.candidate.explanation===item(false,'unused').explanation));
});
