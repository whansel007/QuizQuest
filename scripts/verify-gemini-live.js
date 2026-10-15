// Opt-in real Gemini/browser verification. Publishes only into a synthetic local
// database. Shares the real quota ledger; stop other AI app processes first.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { start } = require('../server');
const gemini = require('../src/quiz/gemini');
const { sharedQuota } = require('../src/quiz/gemini-quota');
const { makePdf, makePptx } = require('../test/support/assessment-lecture.cjs');
async function main() {
  if (!gemini.enabled()) throw new Error('GEMINI_API_KEY is required.');
  const resumeAt=process.argv.indexOf('--resume');
  const directory=resumeAt>=0 ? path.resolve(process.argv[resumeAt+1]) : path.resolve('tmp',`gemini-report-${Date.now()}`);
  if (!directory.startsWith(path.resolve('tmp')+path.sep)) throw new Error('Live verification data must be inside the workspace tmp directory.');
  fs.mkdirSync(directory,{recursive:true});
  const file=path.join(directory,'db.json'),reportFile=path.join(directory,`evidence-${Date.now()}.json`);
  if(resumeAt>=0&&!fs.existsSync(file))throw new Error('No saved verification database exists.');
  fs.writeFileSync(path.join(directory,'lecture.pdf'),makePdf());
  fs.writeFileSync(path.join(directory,'lecture.pptx'),makePptx());
  const before=sharedQuota().snapshot(),started=Date.now();
  const report={startedAt:new Date().toISOString(),model:gemini.model(),steps:[]};
  const record=(step,data={})=>{report.steps.push({step,...data});console.log(JSON.stringify({step,...data}));};
  let srv,browser,page;
  try {
    srv=start(0,{dataFile:file});
    await new Promise(r=>srv.httpServer.once('listening',r));
    const base=`http://127.0.0.1:${srv.httpServer.address().port}`;
    const c=srv.quiz.db.courses.find(c=>c.id==='c-comp');
    if(resumeAt<0) { // isolate upload input from unrelated seeded material
      srv.quiz.db.passages=srv.quiz.db.passages.filter(p=>p.courseId!==c.id);
      srv.quiz.store.save();srv.quiz.store.flush();
    }
    const topic=srv.quiz.db.topics.find(t=>t.courseId===c.id&&/network/i.test(t.name));
    browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'msedge'});
    page=await browser.newPage({viewport:{width:1280,height:1000}});
    page.setDefaultTimeout(30000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.getByRole('button',{name:'Prof. Demo A'}).click();
    await page.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
    const token=await page.evaluate(()=>sessionStorage.getItem('qq-token'));
    async function request(method,url,body){
      const res=await page.request.fetch(base+url,{method,headers:{authorization:'Bearer '+token},...(body?{data:body}:{})});
      const json=await res.json();if(!res.ok())throw new Error(json.error||'Request failed');return json;
    }
    async function wait(id){
      const deadline=Date.now()+10*60000;let last='';
      while(Date.now()<deadline){
        const j=c.authoringJobs.find(j=>j.id===id);
        if(j.message!==last){last=j.message;console.log(JSON.stringify({status:j.status,message:last}));}
        if(!['queued','running'].includes(j.status)){if(j.status!=='complete')throw new Error(j.message);return j;}
        await new Promise(r=>setTimeout(r,1000));
      }
      throw new Error('Verification deadline exceeded; progress remains saved.');
    }
    let a=[...(c.authoringJobs||[])].reverse().find(j=>j.kind==='analysis'&&j.input.reportBased);
    if(!a){
      await page.getByLabel('Lecture files').setInputFiles([path.join(directory,'lecture.pdf'),path.join(directory,'lecture.pptx')]);
      await page.getByText('Files ready. All uploaded material will be processed together.',{exact:true}).waitFor();
      await page.getByRole('checkbox',{name:/This is authorised course material/}).check();
      await page.getByRole('button',{name:'Generate knowledge report',exact:true}).click();
      const deadline=Date.now()+30000;
      while(!a&&Date.now()<deadline){a=c.authoringJobs?.find(j=>j.kind==='analysis'&&j.input.reportBased);await new Promise(r=>setTimeout(r,100));}
      assert.ok(a);
    } else if(['failed','interrupted'].includes(a.status)) await request('POST',`/api/teacher/courses/${c.id}/authoring/${a.id}/resume`);
    const material=srv.quiz.db.passages.filter(p=>p.courseId===c.id&&p.origin!=='report');
    assert.equal(material.length,12);
    assert.ok(material.some(p=>/absence of an acknowledgement/.test(p.text)));
    record('real PDF/PPTX uploads',{excerpts:material.length,characters:material.reduce((n,p)=>n+p.text.length,0)});
    await wait(a.id);
    assert.ok(a.result.markdown.length>1000);
    record('holistic Markdown knowledge report',{calls:a.calls,characters:a.result.markdown.length,insufficient:a.result.insufficient});
    const cached=await request('POST',`/api/teacher/courses/${c.id}/authoring`,{kind:'report'});
    assert.equal(cached.id,a.id);
    const editor=page.getByLabel('Knowledge report (Markdown)',{exact:true});await editor.waitFor();
    const original=a.result.markdown;
    const policy='\n\n## Professor laboratory policy\nA single calibration request costs 97 credits. The calibration budget equals credit cost per request multiplied by the number of requests. There are no other charges.';
    if(!a.reviewedText){
      await editor.fill(original+policy);
      await page.getByRole('button',{name:'Preview Markdown',exact:true}).click();
      await page.getByRole('heading',{name:'Professor laboratory policy',exact:true}).waitFor();
      await page.getByRole('button',{name:'Edit Markdown',exact:true}).click();
      await page.getByRole('button',{name:'Save report',exact:true}).click();
      await page.getByText('Report saved',{exact:true}).waitFor();
    }
    await page.reload();await page.locator('#tabs').getByRole('button',{name:'AI drafting',exact:true}).click();
    assert.equal(await page.getByLabel('Knowledge report (Markdown)',{exact:true}).inputValue(),a.reviewedText);
    record('professor edit save and refresh',{reportRevision:a.reportRevision,extraAnalysisCalls:0});
    let g=c.authoringJobs.find(j=>j.kind==='generation'&&j.input.learningGoals?.includes('two calibration'));
    if(!g){
      const panel=page.locator('.panel').filter({has:page.getByRole('heading',{name:'Assessment configuration',exact:true})});
      await panel.getByLabel('Topic',{exact:true}).selectOption(topic.id);
      await page.getByRole('spinbutton',{name:'Single answer quantity',exact:true}).fill('2');
      await page.getByRole('spinbutton',{name:'Numeric answer quantity',exact:true}).fill('1');
      await page.getByLabel('Learning goals',{exact:true}).fill('Two MCQs: apply distinct networking concepts from the saved report. One numeric question: compute the credit budget for exactly two calibration requests using the professor laboratory policy.');
      await page.getByLabel('Assessment styles',{exact:true}).fill('Moderate scenario questions, distinct reasoning tasks. Single-answer MCQs have four distinct plausible options. The numeric item must use the professor laboratory policy, without introducing other charges.');
      await page.getByRole('button',{name:'Generate questions',exact:true}).click();
      const deadline=Date.now()+30000;
      while(!g&&Date.now()<deadline){g=c.authoringJobs.find(j=>j.kind==='generation');await new Promise(r=>setTimeout(r,100));}
    } else if(['failed','interrupted'].includes(g.status))await request('POST',`/api/teacher/courses/${c.id}/authoring/${g.id}/resume`);
    await wait(g.id);
    const questions=g.result.created.map(id=>srv.quiz.db.questions.find(q=>q.id===id));
    assert.equal(questions.length,3);
    assert.equal(questions.filter(q=>q.versions[0].type==='mcq').length,2);
    const numeric=questions.find(q=>q.versions[0].type==='numeric');assert.equal(numeric.versions[0].answer,194);
    assert.ok(questions.every(q=>q.status==='draft'&&q.versions[0].sourceIds.every(id=>id===g.input.reportSourceId)));
    report.firstAssessment=questions.map(q=>({id:q.id,...q.versions[0]}));
    record('mixed report-grounded assessment',{drafts:3,calls:g.calls,numericAnswer:194,rejected:g.result.rejected.length});
    const oldSource=g.input.reportSourceId;
    const edited=original+policy.replace('97 credits','113 credits');
    if(a.reviewedText!==edited)await request('PUT',`/api/teacher/courses/${c.id}/authoring/${a.id}/review`,{markdown:edited,reportRevision:a.reportRevision});
    // Selective regeneration is a new one-question assessment using the latest
    // saved report and the original professor goals; the other two drafts remain.
    const qid=numeric.id;
    if(numeric.status==='draft')await request('POST',`/api/teacher/questions/${qid}/status`,{action:'reject'});
    const replacement=await request('POST',`/api/teacher/questions/${qid}/regenerate`);
    const rg=c.authoringJobs.find(j=>j.id===replacement.id);
    if(['failed','interrupted'].includes(rg.status))await request('POST',`/api/teacher/courses/${c.id}/authoring/${rg.id}/resume`);
    await wait(rg.id);
    const next=srv.quiz.db.questions.find(q=>q.id===rg.result.created[0]);
    assert.equal(next.versions[0].type,'numeric');assert.equal(next.versions[0].answer,226);
    assert.ok(next.versions[0].sourceIds.every(id=>id===a.reportSourceId));
    assert.equal(numeric.versions[0].answer,194);assert.equal(numeric.status,'rejected');
    assert.ok(srv.quiz.db.passages.find(p=>p.id===oldSource).text.includes('97 credits'));
    assert.equal(a.calls,1,'second assessment must reuse the report, without reanalysis');
    record('edited report reuse and selective regeneration',{calls:rg.calls,newAnswer:226,originalAnswer:194,otherDraftsPreserved:2,extraAnalysisCalls:0});
    report.replacement={id:next.id,...next.versions[0]};
    // Human review, then publish one MCQ through the existing bank UI.
    await page.locator('#tabs').getByRole('button',{name:'Question bank',exact:true}).click();
    const first=questions.find(q=>q.versions[0].type==='mcq');
    await page.locator('.qcard').filter({hasText:first.versions[0].stem}).getByRole('button',{name:'Approve & publish',exact:true}).click();
    assert.equal(first.status,'published');
    const temporary=srv.quiz.db.questions.filter(q=>q.courseId===c.id&&q!==first).map(q=>[q,q.status]);
    temporary.forEach(([q])=>q.status='withdrawn');
    const user=srv.quiz.db.users.find(u=>u.id==='s-01'),cls=srv.quiz.db.classes.find(cl=>cl.id==='cl-a');
    const challenge=srv.quiz.services.pickChallenge(user,cls);temporary.forEach(([q,status])=>q.status=status);
    assert.equal(challenge.q.id,first.id);assert.equal(challenge.view.answerIndex,undefined);
    const answer=await srv.quiz.services.answerQuestion({user,cls,q:first,v:challenge.v,instance:challenge.instance,submission:{choice:challenge.v.answerIndex},servedAt:Date.now()});
    assert.equal(answer.result.correct,true);
    record('professor approval publishing and Game grading',{answerKeyHidden:true,correct:true,isolatedDataOnly:true});
    assert.deepEqual(errors,[]);
    srv.quiz.store.save();srv.quiz.store.flush();
    await page.screenshot({path:path.join(directory,'review.png'),fullPage:true});
    await page.close();page=null;await new Promise(r=>srv.io.close(r));srv=null;
    srv=start(0,{dataFile:file});await new Promise(r=>srv.httpServer.once('listening',r));
    const restored=srv.quiz.db.courses.find(x=>x.id===c.id).authoringJobs.find(j=>j.id===a.id);
    assert.equal(restored.reviewedText,edited);assert.equal(restored.reportRevision,2);
    assert.equal(srv.quiz.db.questions.find(q=>q.id===first.id).status,'published');
    record('restart recovery',{editedReportRestored:true,publishedQuestionRestored:true});report.ok=true;
  } finally {
    if(page)await page.screenshot({path:path.join(directory,'failure.png'),fullPage:true}).catch(()=>{});
    await browser?.close();if(srv){srv.quiz.store.flush();await new Promise(r=>srv.io.close(r));}
    const prior=new Set(before.events.map(e=>e.id)),events=sharedQuota().snapshot().events.filter(e=>!prior.has(e.id));
    report.elapsedMs=Date.now()-started;
    report.api={requests:events.length,models:[...new Set(events.map(e=>e.model))],promptTokens:events.reduce((n,e)=>n+(e.usage?.promptTokens||0),0),outputTokens:events.reduce((n,e)=>n+(e.usage?.outputTokens||0),0),totalTokens:events.reduce((n,e)=>n+(e.usage?.totalTokens||0),0),responsesWithoutUsage:events.filter(e=>!e.usage).length};
    fs.writeFileSync(reportFile,JSON.stringify(report,null,2));console.log(JSON.stringify({reportFile,ok:!!report.ok,...report.api}));
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
