const test=require('node:test');
const assert=require('node:assert/strict');
const {seed}=require('../src/quiz/seed');
const {createAuthoring}=require('../src/quiz/authoring');
const {toTables,fromTables}=require('../src/db/schema');
const {newInstance,studentView,gradeSync}=require('../src/quiz/formats');
const {keywordGrade,grade}=require('../src/quiz/grading');
const {resolveTags}=require('../src/quiz/assessment');
const {createQuizApi}=require('../src/quiz/api');
const http=require('node:http');
const subjects=[
  {name:'Quantitative science',outcome:'Calculate and justify outcomes using a constant rate and its assumptions.',report:'At a constant production rate of 2 units per minute, total output equals rate multiplied by duration. The assumption of a constant rate must be supplied and justified. A longer duration increases total output proportionally.',concepts:['Explain the relationship between a constant rate and total output.','Compare the roles of rate and duration in the production model.'],tasks:['In a hypothetical workshop with a constant rate of 2 units per minute for 5 minutes, calculate output and justify the assumption.','A hypothetical tank gains 2 units per minute at a constant rate. Interpret its output after 5 minutes.']},
  {name:'Historical reasoning',outcome:'Evaluate the reliability of a historical claim using provenance, purpose and corroboration.',report:'Evaluate testimony by considering provenance, purpose and independent corroboration. A single testimony does not establish a causal claim. Agreement between genuinely independent accounts strengthens a claim, while common authorship limits independence.',concepts:['Explain why common authorship limits independent corroboration.','Compare provenance and purpose when evaluating testimony.'],tasks:['In a hypothetical archive, two letters share an author while an independent diary disagrees. Evaluate the reliability of the claim using these supplied details.','Consider a hypothetical witness paid to promote a claim. Explain what independent corroboration would be needed before accepting it.']},
  {name:'Biology',outcome:'Interpret controlled observations and distinguish evidence of association from causal evidence.',report:'A controlled comparison varies one factor while keeping relevant conditions constant. Association alone does not establish causation. Consider alternative explanations and the limits of the observations when interpreting evidence.',concepts:['Explain why association alone does not establish causation.','Compare the purpose of controls and alternative explanations.'],tasks:['In a hypothetical seed trial, one group receives a treatment but also more light. Interpret the causal claim and identify the uncontrolled factor.','A hypothetical observation links a nutrient and growth without controlling temperature. Evaluate what can be concluded from the supplied observations.']},
];
async function settled(job){const until=Date.now()+5000;while(['queued','running'].includes(job.status)){if(Date.now()>until)throw new Error('Mock job timed out');await new Promise(r=>setTimeout(r,2));}}
async function fixture({subject=subjects[0],style='both',support=true,draft,decision,quantities={short:2}}={}){
  const db=seed(),course=db.courses.find(c=>c.id==='c-comp');course.title=subject.name;
  const stages=[],requests=[],classifications=new Map();let serial=0;
  const queue=createAuthoring({db,persist:async()=>{},ai:async opts=>{
    const stage=opts.requestContext.stage;stages.push(stage);requests.push(opts);
    if(stage==='analysis')return {json:{markdown:'# '+subject.name+'\n'+subject.report,insufficient:false}};
    if(stage==='drafting'){
      assert.match(opts.system,/subject-agnostic/);assert.match(opts.system,/decorative story/);
      assert.ok(opts.prompt.includes(subject.outcome));assert.match(opts.prompt,/Styles still needed|assessment/i);
      const slots=JSON.parse(opts.prompt.match(/remaining slots\): (.*)/)[1]);
      const sourceId=course.authoringJobs.find(j=>j.kind==='analysis').reportSourceId;
      const make=(type,cognitiveStyle,index=0,overrides={})=>{
        let stem=(cognitiveStyle==='application'?subject.tasks:subject.concepts)[index%2];
        const q={type,stem,explanation:subject.report,difficulty:'medium',sourceIds:[sourceId]};
        if(type==='short')Object.assign(q,{answerMode:'text',modelAnswer:subject.report,keyPoints:[subject.report.slice(0,90)]});
        if(type==='mcq')Object.assign(q,cognitiveStyle==='application'?{stem:'A hypothetical process operates at 2 units per minute for 5 minutes at a constant rate. What output follows?',options:['10 units','2 units','5 units','7 units'],answerIndex:0}:{stem:'Which assumption is necessary for total output to increase proportionally with duration?',options:['The production rate is constant.','The container is blue.','Labels determine output.','Duration never changes.'],answerIndex:0});
        if(type==='tf')Object.assign(q,{stem:cognitiveStyle==='application'?'A hypothetical machine running at a constant rate of 2 units per minute produces 10 units in 5 minutes.':'Under the specified constant-rate assumption, increasing duration proportionally increases total output.',answerIndex:0});
        if(type==='multi')Object.assign(q,{stem:cognitiveStyle==='application'?'A hypothetical process pauses during a trial. Which observations are needed to justify a constant-rate calculation?':'Which quantities determine total output under the constant-rate model?',options:cognitiveStyle==='application'?['Actual active duration','Evidence the rate is constant while active','Container colour','Equipment label']:['Production rate','Elapsed duration','Container colour','Equipment label'],answerIndexes:[0,1]});
        if(type==='numeric')Object.assign(q,{stem:'For a hypothetical constant rate of 2 units per minute over 5 minutes, calculate total output.',answer:10,tolerance:0,unit:'units'});
        if(type==='param')Object.assign(q,{stem:'At a constant rate of 2 units per minute, find output after {a} minutes.',variables:[{name:'a',min:1,max:5,step:1}],answerExpr:'2*a',distractorExprs:['2*a+1','2*a-1'],decimals:0,unit:'units'});
        Object.assign(q,overrides);classifications.set(q.stem,cognitiveStyle);return q;
      };
      const items=draft?draft({make,slots,batch:opts.requestContext.batch}):Object.entries(slots).flatMap(([type,n])=>Array.from({length:n},()=>{const index=serial++;return make(type,style==='both'?(index%2?'application':'conceptual'):style,index);}));
      return {json:{questions:items,applicationSupported:support,limitation:support?'':'The report supplies definitions but no supported method or evidence for the requested application.'}};
    }
    assert.equal(stage,'verification');assert.match(opts.prompt,/Novel examples do not need literal source matches/);
    const data=JSON.parse(opts.prompt.slice(opts.prompt.indexOf('\n')+1));
    assert.ok(data.questions.every(q=>q.answerIndex===undefined && q.answer===undefined));
    return {json:{applicationSupported:support,limitation:support?'':'The requested inference requires methods absent from the saved report.',checks:data.questions.map((q,index)=>{
      const v={index,correct:true,oneCorrect:true,questionValid:true,unambiguous:true,explanationSupported:true,statementTruth:q.type==='tf'?true:null,
        aligned:true,duplicate:false,fitsConfiguration:true,outcomeAligned:true,difficultyAppropriate:true,scenarioGrounded:true,cognitiveStyle:classifications.get(q.stem),
        answerableWithoutScenario:classifications.get(q.stem)!=='application',
        reasoningSteps:classifications.get(q.stem)==='application'?['Identify the supported rule and the scenario givens.','Apply the rule to the givens to reach the answer.']:['Recall the supported relationship.'],
        answerIndex:['mcq','tf'].includes(q.type)?0:-1,answerIndexes:q.type==='multi'?[0,1]:[],numericAnswer:q.type==='numeric' || q.answerMode==='numeric'?10:null,
        unsupportedClaims:[],reason:'Source-supported reasoning from supplied hypothetical givens.',evidence:[{passageId:q.sourceIds[0],quoteId:data.evidenceAnchors.find(a=>a.passageId===q.sourceIds[0]).id}]};
      return decision?decision(v,q):v;
    })}};
  }});
  const analysis=queue.start(course,'report',{},'t-a');await settled(analysis);
  await queue.review(course,analysis.id,'# '+subject.name+'\n'+subject.report,0);
  const raw={analysisId:analysis.id,reportRevision:1,topicText:subject.name+' tasks',learningOutcome:subject.outcome,assessmentStyle:style,quantities};
  const job=queue.start(course,'generation',raw,'t-a');await settled(job);
  return {db,course,queue,analysis,job,raw,stages,requests};
}
test('Conceptual, Application and Both use professor outcomes across science, history and biology',async t=>{
  for(const subject of subjects)for(const style of ['conceptual','application','both'])await t.test(subject.name+' '+style,async()=>{
    const f=await fixture({subject,style});assert.equal(f.job.status,'complete',f.job.message);
    assert.deepEqual(f.stages,['analysis','drafting','verification'],'no style preflight or avoidable replacement calls');
    const questions=f.db.questions.filter(q=>q.generationId===f.job.result.generationId);
    assert.equal(questions.length,2);assert.ok(questions.every(q=>q.assessment.topic===subject.name+' tasks' && q.assessment.learningOutcome===subject.outcome && q.assessment.style===style));
    const styles=new Set(questions.map(q=>q.assessment.cognitiveStyle));
    assert.deepEqual([...styles].sort(),style==='both'?['application','conceptual']:[style]);
    assert.ok(questions.every(q=>f.db.topics.find(t=>t.id===q.topicId).outcomes.some(o=>o.id===q.outcomeId && o.text===subject.outcome)));
    const restored=fromTables(toTables(f.db,()=>1));
    assert.deepEqual(restored.questions.find(q=>q.id===questions[0].id).assessment,questions[0].assessment);
    assert.equal(f.job.requestBudget,18);assert.equal(f.job.calls,2);
    assert.equal(f.queue.start(f.course,'generation',f.raw,'t-a').id,f.job.id,'unchanged configuration remains idempotent');
  });
});
test('explicit generation attempts allow unchanged intentional batches while retries and concurrent clicks share work',async()=>{
  const stems=['Describe why doubling elapsed time doubles production under constant throughput.','Identify how variable capacity undermines extrapolation beyond the measured interval.','Contrast interpreting an instantaneous reading versus accumulated yield over duration.'];
  let next=0;
  const f=await fixture({style:'conceptual',quantities:{short:1},draft:({make})=>[make('short','conceptual',0,{stem:stems[next++]})]});
  assert.equal(f.job.status,'complete',f.job.message);
  const original=structuredClone(f.db.questions),reports=JSON.stringify(f.course.authoringJobs.filter(j=>j.kind==='analysis'));
  const raw={...f.raw,attemptId:'intentional-batch-0001'};
  const second=f.queue.start(f.course,'generation',raw,'t-a');assert.notEqual(second.id,f.job.id);
  assert.equal(f.queue.start(f.course,'generation',raw,'t-a'),second,'same click retried while queued');
  assert.throws(()=>f.queue.start(f.course,'generation',{...raw,attemptId:'intentional-batch-0002'},'t-a'),e=>e.status===409,'course concurrency guard');
  await settled(second);assert.equal(second.status,'complete',second.message);assert.equal(second.calls,2);assert.equal(second.requestBudget,18);
  const calls=f.stages.length;assert.equal(f.queue.start(f.course,'generation',raw,'t-a'),second,'lost completed response is idempotent');assert.equal(f.stages.length,calls);
  assert.throws(()=>f.queue.start(f.course,'generation',{...raw,assessmentStyle:'application'},'t-a'),e=>e.status===409,'attempt payload is immutable');
  assert.throws(()=>f.queue.start(f.course,'generation',{...raw,attemptId:'bad'},'t-a'),e=>e.status===400);
  const third=f.queue.start(f.course,'generation',{...raw,attemptId:'intentional-batch-0002'},'t-a');await settled(third);
  assert.equal(third.status,'complete',third.message);assert.equal(third.calls,2);
  for(const q of original)assert.deepEqual(f.db.questions.find(x=>x.id===q.id),q,'earlier questions preserved');
  assert.equal(JSON.stringify(f.course.authoringJobs.filter(j=>j.kind==='analysis')),reports,'report versions unchanged');
  assert.equal(f.stages.filter(x=>x==='analysis').length,1,'repeated generation reuses the report');
  const db=fromTables(toTables(f.db,()=>1)),course=db.courses.find(c=>c.id===f.course.id);let recoveredCalls=0;
  const recovered=createAuthoring({db,persist:async()=>{},ai:async()=>{recoveredCalls++;throw Error('Recovery must not infer');}});
  assert.equal(recovered.start(course,'generation',raw,'t-a').id,second.id);assert.equal(recoveredCalls,0);
});
test('failed generation attempts remain retry-safe and explicit resume keeps the same budget without reanalysis',async()=>{
  let fail=true;
  const f=await fixture({style:'conceptual',quantities:{short:1},draft:({make})=>{if(fail)throw Error('mock drafting outage');return [make('short','conceptual')];}});
  assert.equal(f.job.status,'failed');
  const raw={...f.raw,attemptId:'failure-attempt-0001'};
  const failed=f.queue.start(f.course,'generation',raw,'t-a');await settled(failed);assert.equal(failed.status,'failed');
  const calls=failed.calls,stages=f.stages.length;
  assert.equal(f.queue.start(f.course,'generation',raw,'t-a'),failed);assert.equal(f.stages.length,stages,'retry does not implicitly resume or reset the budget');
  fail=false;f.queue.resume(f.course,failed.id);await settled(failed);
  assert.equal(failed.status,'complete',failed.message);assert.equal(failed.calls,calls+2);assert.equal(failed.requestBudget,18);
  assert.equal(f.stages.filter(s=>s==='analysis').length,1);
});
test('generated fenced CSS/JS and indented options survive validation and persisted recovery',async()=>{
  const subject={name:'Programming',concepts:['Interpret code comparisons.'],tasks:['Solve the supplied program.'],outcome:'Interpret code comparisons and explain their result.',report:'JavaScript compares numbers using <. A comparison of 2 < 3 evaluates to true. CSS width sets an element width. A width of 10px sets that width to ten pixels.'};
  const stem='Interpret the supplied JavaScript comparison. Which output follows?\n```js\nconst x = 2;\nconsole.log(x < 3);\n```';
  const explanation='The comparison is **true** because `2 < 3`.\n```css\n.box {\n  width: 10px;\n}\n```';
  const f=await fixture({subject,style:'conceptual',quantities:{mcq:1},draft:({make})=>[make('mcq','conceptual',0,{stem,explanation,options:['    true','false','undefined','null']})]});
  assert.equal(f.job.status,'complete',f.job.message);assert.equal(f.job.calls,2);
  const q=f.db.questions.find(q=>q.id===f.job.result.created[0]);
  assert.equal(q.versions[0].stem,stem);assert.equal(q.versions[0].explanation,explanation);assert.equal(q.versions[0].options[0],'    true');
  assert.deepEqual(fromTables(toTables(f.db,()=>1)).questions.find(x=>x.id===q.id).versions,q.versions.map(v=>({...v,publishedAt:v.publishedAt ?? null})));
});
test('novel grounded application scenarios and all four drafting formats remain independently verified',async()=>{
  const quantities={mcq:1,tf:1,short:1,multi:1};
  const f=await fixture({quantities,draft:({make,slots})=>Object.keys(slots).map((type,i)=>make(type,i%2?'conceptual':'application',i,Object.keys(slots).length===1 && type==='mcq'?{
    stem:'An experiment loses power and production stops. Which conclusion about using the model is defensible?',
    options:['The constant-rate assumption must hold for the model to apply.','Output continues forever.','The observations prove causation.','Duration does not matter.'],answerIndex:0,
  }:{}))});
  assert.equal(f.job.status,'complete',JSON.stringify(f.job.result.rejected));assert.equal(f.job.result.created.length,4);
  assert.deepEqual(f.stages,['analysis','drafting','verification']);
  const question=f.db.questions.find(q=>q.id===f.job.result.created[0]);
  assert.ok(!subjects[0].report.includes(question.versions[0].stem));
  assert.ok(f.job._validation.every(v=>v.pass && v.verification.scenarioGrounded));
  for(const id of f.job.result.created) {
    const q=f.db.questions.find(q=>q.id===id),v=q.versions[0],instance=newInstance(v),view=studentView(v,instance);
    assert.equal(view.answerIndex,undefined);assert.equal(view.answer,undefined);
    const sub=v.type==='multi'?{choices:v.answerIndexes}:v.type==='numeric'?{value:v.answer}:v.type==='param'?{choice:instance.answerIndex}:{choice:v.answerIndex};
    if(v.type==='short')assert.equal(keywordGrade(v,v.keyPoints.join(' ')).score,1);
    else assert.equal(gradeSync(v,instance,sub).correct,true,'shared Game grading remains valid for '+v.type);
  }
  const oldMetadata=f.db.questions.find(q=>q.id===f.job.result.created[0]).assessment;
  const replacement=f.queue.regenerate(f.course,f.db.questions.find(q=>q.id===f.job.result.created[0]),'t-a');
  await settled(replacement);
  assert.equal(replacement.status,'complete',replacement.message);
  assert.equal(replacement.input.assessmentStyle,oldMetadata.cognitiveStyle,'selective regeneration preserves the original task style');
});
test('Application retains valid conceptual work with an explicit limitation when material is insufficient',async()=>{
  const f=await fixture({style:'application',support:false,draft:({make})=>[make('short','conceptual')]});
  assert.equal(f.job.status,'failed');assert.equal(f.job.result.created.length,1);assert.equal(f.job.calls,2);
  assert.match(f.job.result.warnings.join(' '),/Add relevant methods/);
  assert.throws(()=>f.queue.resume(f.course,f.job.id),/Improve the saved report/);
  assert.deepEqual(f.stages,['analysis','drafting','verification']);
  const empty=await fixture({style:'application',support:false,draft:()=>[]});
  assert.deepEqual(empty.stages,['analysis','drafting'],'empty unsupported drafts need no verification or repair calls');
});
test('Both preserves valid conceptual questions and reports application limitations and shortfall',async()=>{
  const f=await fixture({style:'both',support:false,draft:({make})=>[make('short','conceptual')]});
  assert.equal(f.job.status,'failed');assert.equal(f.job.result.created.length,1);assert.equal(f.job.result.missing,1);
  assert.equal(f.job.calls,2);assert.match(f.job.message,/1 still missing/);assert.ok(f.job.result.warnings.length);
  assert.equal(f.db.questions.find(q=>q.id===f.job.result.created[0]).status,'draft');
});
test('Conceptual does not warn about application limitations; free-text tags validate and commit without altering historical taxonomy',async()=>{
  const f=await fixture({style:'conceptual',support:false});
  assert.equal(f.job.status,'complete');assert.equal(f.job.result.applicationUnsupported,undefined);
  const before=JSON.stringify(f.db.topics);
  assert.throws(()=>resolveTags(f.db,f.course,{topicText:'',learningOutcome:'A valid outcome'}),/Enter a topic/);
  assert.throws(()=>f.queue.start(f.course,'generation',{...f.raw,assessmentStyle:'recall'},'t-a'),/Choose Conceptual/);
  assert.equal(JSON.stringify(f.db.topics),before);
  const tags=resolveTags(f.db,f.course,{topicText:'An independent topic',learningOutcome:'Critique an argument using supplied evidence.'});
  assert.equal(JSON.stringify(f.db.topics),before,'resolution alone is read-only');
  tags.commit();tags.commit();
  assert.equal(f.db.topics.filter(t=>t.id===tags.topic.id).length,1);
  assert.equal(f.db.topics.find(t=>t.id===tags.topic.id).outcomes.length,1);
});
test('Both reports a missing cognitive style without replacing valid questions',async()=>{
  const f=await fixture({draft:({make,batch})=>batch===1?[make('short','conceptual',0),make('short','conceptual',1)]:[make('short','application',0)]});
  assert.equal(f.job.status,'complete',f.job.message);assert.equal(f.job.calls,2);assert.equal(f.job.result.rejected.length,0);
  assert.match(f.job.result.warnings.join(' '), /do not cover both/);
  assert.equal(f.job.result.created.length,2);
});
test('Both corrects decorative application labels across subjects without replacement calls',async t=>{
  for(const subject of subjects) await t.test(subject.name,async()=>{
    const f=await fixture({subject,draft:({make,batch})=>batch===1
      ? [make('short','conceptual',0),make('short','conceptual',1,{cognitiveStyle:'application'})]
      : [make('short','application',0)]});
    assert.equal(f.job.status,'complete',f.job.message);
    assert.equal(f.job.calls,2,'one drafting/verification pair');
    const qs=f.db.questions.filter(q=>q.generationId===f.job.result.generationId);
    assert.equal(qs.length,2);assert.ok(qs.some(q=>q.versions[0].stem===subject.concepts[0]),'valid conceptual survivor retained');
    assert.deepEqual(qs.map(q=>q.assessment.cognitiveStyle),['conceptual','conceptual']);
    assert.match(f.job.result.warnings.join(' '), /do not cover both/);
    assert.match(f.requests.find(r=>r.requestContext.stage==='verification').prompt,/definition matching, naming or sentence retrieval is conceptual/);
  });
});
test('unsupported scenarios and outcome drift fail while moderate difficulty/style issues are retained',async t=>{
  for(const field of ['scenarioGrounded','outcomeAligned'])await t.test(field,async()=>{
    const f=await fixture({style:'application',quantities:{short:1},decision:v=>({...v,[field]:false})});
    assert.equal(f.job.status,'failed');assert.equal(f.job.result.created.length,0);assert.ok(f.job.calls<=18);
  });
  const recall=await fixture({style:'application',draft:({make})=>[make('short','conceptual')]});
  assert.equal(recall.job.result.created.length,1);
  assert.equal(recall.db.questions.find(q=>q.id===recall.job.result.created[0]).assessment.cognitiveStyle,'conceptual');
  const moderate=await fixture({style:'application',quantities:{short:1},decision:v=>({...v,difficultyAppropriate:false})});
  assert.equal(moderate.job.result.created.length,1);assert.equal(moderate.job.calls,2);
});
test('application needs scenario-dependent, multi-step reasoning from the verifier',async t=>{
  for(const [name,override] of [['answerable without the scenario',{answerableWithoutScenario:true}],['a single reasoning step',{reasoningSteps:['Multiply rate by duration.']}],['missing reasoning steps',{reasoningSteps:undefined}]])
    await t.test(name,async()=>{
      const f=await fixture({style:'application',quantities:{short:1},decision:v=>v.cognitiveStyle==='application'?{...v,...override}:v});
      assert.equal(f.job.result.created.length,1);
      assert.equal(f.job.calls,2);
      assert.ok(f.job._validation.every(v=>v.verification.styleDowngraded && v.verification.cognitiveStyle==='conceptual'));
    });
  await t.test('Both counts a shallow application as conceptual and warns about coverage',async()=>{
    let first=true;
    const f=await fixture({decision:v=>{if(v.cognitiveStyle==='application' && first){first=false;return {...v,answerableWithoutScenario:true};}return v;}});
    assert.equal(f.job.status,'complete',f.job.message);
    const qs=f.db.questions.filter(q=>q.generationId===f.job.result.generationId);
    assert.deepEqual(qs.map(q=>q.assessment.cognitiveStyle),['conceptual','conceptual']);
    assert.match(f.job.result.warnings.join(' '), /do not cover both/);
  });
});
test('drafter plans each question with a blueprint and gets the application method when application is possible',async t=>{
  for(const style of ['conceptual','application','both'])await t.test(style,async()=>{
    const draft=({make,slots})=>Object.keys(slots).map((type,i)=>({...make(type,style==='both'?(i?'application':'conceptual'):style,i),
      blueprint:{intendedStyle:style,targetSkill:'constant-rate model',scenarioGivens:[],reasoningSteps:['Identify the rule.','Apply it.'],whyNotRecall:'',distractorRationale:[]}}));
    const f=await fixture({style,quantities:{mcq:1,short:1},draft});assert.equal(f.job.status,'complete',f.job.message);
    const drafting=f.requests.find(r=>r.requestContext.stage==='drafting');
    for(const variant of drafting.schema.properties.questions.items.anyOf){
      assert.equal(variant.propertyOrdering[0],'blueprint','blueprint is written before the stem');
      assert.ok(variant.required.includes('blueprint'));
    }
    assert.equal(/How to write an application question/.test(drafting.system),style!=='conceptual');
    assert.match(f.requests.find(r=>r.requestContext.stage==='analysis').prompt,/Applying these ideas/);
    const verification=f.requests.find(r=>r.requestContext.stage==='verification');
    assert.ok(verification.schema.properties.checks.items.required.includes('answerableWithoutScenario'));
    const saved=f.db.questions.filter(q=>q.generationId===f.job.result.generationId);
    assert.ok(saved.every(q=>q.versions[0].blueprint===undefined),'planning notes are not stored on questions');
  });
});

test('all four types support each assessment style with independent answer checks',async t=>{
  for(const type of ['mcq','tf','short','multi'])for(const style of ['conceptual','application','both'])await t.test(type+' '+style,async()=>{
    const f=await fixture({style,quantities:{[type]:1}});assert.equal(f.job.status,'complete',f.job.message);
    assert.equal(f.job.calls,2);assert.equal(f.job.result.created.length,1);
    assert.equal(f.db.questions.find(q=>q.id===f.job.result.created[0]).versions[0].type,type);
    if(style==='both')assert.match(f.job.result.warnings.join(' '),/at least two/);
  });
});
test('hidden formats are rejected before spending requests; historical numeric and maths questions survive',async()=>{
  const f=await fixture();const calls=f.stages.length,topics=JSON.stringify(f.db.topics);
  for(const quantities of [{numeric:1},{param:1},{mcq:1,numeric:0}])
    assert.throws(()=>f.queue.start(f.course,'generation',{...f.raw,quantities},'t-a'),e=>e.status===400);
  assert.equal(f.stages.length,calls);assert.equal(JSON.stringify(f.db.topics),topics);
  assert.equal(f.queue.start(f.course,'generation',{...f.raw,assessmentStyle:undefined},'t-a').id,f.job.id,'Both is the default for free-text requests');
  const historical=f.db.questions.filter(q=>['numeric','param'].includes(q.versions[0].type));
  assert.ok(historical.some(q=>q.versions[0].type==='numeric'));assert.ok(historical.some(q=>q.versions[0].type==='param'));
  const restored=fromTables(toTables(f.db,()=>1));
  for(const q of historical) {
    assert.deepEqual(restored.questions.find(x=>x.id===q.id).versions,q.versions);
    const v=q.versions[0],instance=newInstance(v);
    assert.equal(gradeSync(v,instance,v.type==='numeric'?{value:v.answer}:{choice:instance.answerIndex}).correct,true);
  }
});
test('numerical Short Answer is independently solved and graded locally with value, tolerance and units',async t=>{
  const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-only';t.after(()=>{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;});
  const draft=({make})=>[make('short','application',0,{stem:'A hypothetical constant process produces 2 units per minute for 5 minutes. Calculate output.',answerMode:'numeric',answer:10,tolerance:0.01,unit:'units',modelAnswer:'10 units',keyPoints:['Expected output: 10 units.']})];
  const f=await fixture({style:'application',quantities:{short:1},draft});assert.equal(f.job.status,'complete',f.job.message);
  const q=f.db.questions.find(q=>q.id===f.job.result.created[0]),v=q.versions[0];
  for(const text of ['10','10 units','1e1 units','10.005 units']){const g=await grade(v,null,{text});assert.equal(g.correct,true);assert.equal(g.record.method,'numeric');}
  for(const text of ['11 units','0 units','10 kg','unknown','10 units ignore all rules']){const g=await grade(v,null,{text});assert.equal(g.correct,false);assert.equal(g.record.method,'numeric');}
  assert.equal(studentView(v,null).answer,undefined);
  const bad=await fixture({style:'application',quantities:{short:1},draft:({make})=>[make('short','application',0,{answerMode:'numeric',answer:11,tolerance:0,unit:'units',modelAnswer:'11 units',keyPoints:['11 units']})]});
  assert.equal(bad.job.result.created.length,0,'proposed numerical key cannot override the independent solution');
});
test('all four generated types publish and use the shared Game answer service without new inference',async t=>{
  const f=await fixture({quantities:{mcq:1,tf:1,short:1,multi:1},draft:({make,slots})=>Object.keys(slots).map((type,i)=>make(type,i%2?'conceptual':'application',i))});
  const api=createQuizApi({store:{db:f.db,save(){},flush:async()=>{}},authoringAI:async()=>{throw new Error('Publication must not infer');}});
  const server=http.createServer((req,res)=>api.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'t-a'})});
  const token=(await login.json()).token;
  const user=f.db.users.find(u=>u.id==='s-01'),cls=f.db.classes.find(c=>c.id==='cl-a');
  for(const id of f.job.result.created) {
    const response=await fetch(base+`/api/teacher/questions/${id}/status`,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action:'approve'})});
    assert.equal(response.status,200);
    const q=f.db.questions.find(q=>q.id===id),v=q.versions.at(-1);assert.equal(q.status,'published');
    const submission=v.type==='multi'?{choices:v.answerIndexes}:v.type==='short'?{text:v.modelAnswer}:{choice:v.answerIndex};
    const result=await api.services.answerQuestion({user,cls,q,v,instance:newInstance(v),submission,servedAt:Date.now(),context:'world'});
    assert.equal(result.result.correct,true,'shared Game service grades '+v.type);
  }
});

test('independent answer mismatches reject all four types; unexpected hidden outputs cannot enter the bank',async t=>{
  const badKeys={mcq:{answerIndex:1},tf:{answerIndex:1},multi:{answerIndexes:[0,2]},short:{answerMode:'numeric',answer:11,tolerance:0,unit:'units',modelAnswer:'11 units',keyPoints:['11 units']}};
  for(const [type,overrides] of Object.entries(badKeys))await t.test(type,async()=>{
    const f=await fixture({style:'application',quantities:{[type]:1},draft:({make})=>[make(type,'application',0,overrides)]});
    assert.equal(f.job.result.created.length,0);assert.ok(f.job._validation.every(v=>!v.pass && v.failedChecks.includes('answerKeyMatches')));
    assert.ok(f.job.calls<=18);
  });
  const hidden=await fixture({style:'application',quantities:{short:1},draft:({make})=>[make('numeric','application')]});
  assert.equal(hidden.job.result.created.length,0);assert.ok(!hidden.stages.includes('verification'),'wrong types fail locally before inference');
  const single=await fixture({style:'application',quantities:{multi:1},draft:({make})=>[make('multi','application',0,{answerIndexes:[0]})]});
  assert.equal(single.job.result.created.length,0);assert.ok(!single.stages.includes('verification'),'single-key Multi-select fails locally');
});
