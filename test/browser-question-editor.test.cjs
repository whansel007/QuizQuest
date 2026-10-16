const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {start}=require('../server');
let srv,browser,base,calls=0;
test.before(async()=>{
  srv=start(0,{dataFile:null,authoringAI:async()=>{calls++;throw Error('Manual authoring must never infer');}});
  await new Promise(r=>srv.httpServer.once('listening',r));base=`http://localhost:${srv.httpServer.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
});
test.after(async()=>{await browser?.close();srv?.io.close();});
test('four manual formats preserve code, answers and tags through preview, publication, edit and refresh',async t=>{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});
  await page.goto(base);await page.getByRole('button',{name:'Prof. Demo A',exact:false}).click();
  await page.getByRole('heading',{name:'Question bank',exact:true}).waitFor();
  const token=await page.evaluate(()=>sessionStorage.getItem('qq-token'));
  const headers={authorization:'Bearer '+token};
  const courses=await (await page.request.get(base+'/api/teacher/courses',{headers})).json(),cid=courses[0].id;
  const stems={mcq:'Interpret the following CSS rule and choose its width.\n```css\n.box {\n  width: calc(100% - 2px);\n  content: "**literal**";\n}\n```',tf:'This hypothetical program calls run only if a is less than b.\n```js\nif (a < b) run();\n```',short:'Compute the numerical output of a hypothetical constant process producing two units per minute for five minutes.',multi:'Select the supplied expressions that compare values rather than assigning a new value. Use `a < b` as a comparison example.'};
  for(const type of ['mcq','tf','short','multi']) {
    await page.getByRole('button',{name:'+ New question',exact:true}).click();
    const editor=page.getByRole('region',{name:'Question editor'});
    assert.deepEqual(await editor.getByLabel('Format',{exact:true}).locator('option').evaluateAll(xs=>xs.map(x=>x.value)),['mcq','tf','short','multi']);
    await editor.getByLabel('Format',{exact:true}).selectOption(type);
    await editor.getByRole('button',{name:'Save as draft',exact:true}).click();
    await editor.getByText('Enter at least 10 characters.',{exact:true}).waitFor();
    await editor.getByLabel('Topic',{exact:true}).fill('Independent authoring '+type);
    await editor.getByLabel('Learning outcome',{exact:true}).fill('Interpret and justify the supplied '+type+' task.');
    await editor.getByLabel(type==='tf'?'Statement':'Question',{exact:true}).fill(stems[type]);
    await editor.getByLabel('Explanation shown after answering',{exact:true}).fill('Compare **evidence** with `a < b`.\n- Preserve reasoning\n- Preserve $x^2$ and \\(x + y\\)\n&lt;img src=x onerror="window.unsafe=true"&gt;');
    const textEditor=editor.getByRole('region',{name:'Markdown editor: '+(type==='tf'?'Statement':'Question'),exact:true});
    await textEditor.getByRole('button',{name:'Preview',exact:true}).click();
    assert.equal(await textEditor.getByRole('button',{name:'Preview',exact:true}).getAttribute('aria-pressed'),'true');
    if(type==='mcq')assert.equal(await textEditor.locator('pre code').innerText(),'.box {\n  width: calc(100% - 2px);\n  content: "**literal**";\n}');
    if(type==='mcq')await textEditor.screenshot({path:'tmp/question-markdown-desktop.png'});
    await textEditor.getByRole('button',{name:'Write',exact:true}).click();
    assert.equal(await editor.getByLabel(type==='tf'?'Statement':'Question',{exact:true}).inputValue(),stems[type]);
    const explanationEditor=editor.getByRole('region',{name:'Markdown editor: Explanation shown after answering',exact:true});
    await explanationEditor.getByRole('button',{name:'Preview',exact:true}).click();
    assert.equal(await explanationEditor.locator('img,script').count(),0);
    assert.ok((await explanationEditor.innerText()).includes('$x^2$'));
    await explanationEditor.getByRole('button',{name:'Write',exact:true}).click();
    if(type==='mcq' || type==='multi') {
      for(let i=1;i<=4;i++)await editor.getByLabel('Option '+i,{exact:true}).fill(['`a < b`\n```js\na < b\n```','a > b','a = b','a += b'][i-1]);
      if(type==='multi'){await editor.getByLabel('Option 1 is correct',{exact:true}).check();await editor.getByLabel('Option 2 is correct',{exact:true}).check();}
    }
    if(type==='tf') await editor.getByRole('radio',{name:'True',exact:true}).check();
    if(type==='short') {
      await editor.getByLabel('Answer grading',{exact:true}).selectOption('numeric');
      await editor.getByLabel('Numerical short answer',{exact:true}).fill('10');
      await editor.getByLabel('Accepted tolerance',{exact:true}).fill('0.01');
      await editor.getByLabel('Answer unit',{exact:true}).fill('units');
      await editor.getByLabel('Model answer (shown to students after they answer)',{exact:true}).fill('10 units using `rate × duration`.');
      await editor.getByLabel('Key points a good answer must cover (one per line, 1-6)',{exact:true}).fill('Multiply rate by duration');
    }
    await editor.getByText('Preview question',{exact:true}).click();
    assert.equal(await editor.locator('.question-details img, .question-details script').count(),0);
    if(type==='mcq')assert.equal(await editor.locator('.question-stem pre code').innerText(),'.box {\n  width: calc(100% - 2px);\n  content: "**literal**";\n}');
    await editor.getByRole('button',{name:'Save & publish',exact:true}).click();
    await editor.waitFor({state:'detached'});
    await page.getByRole('button',{name:/^Published \(/}).click();
    const card=page.locator('.qcard').filter({hasText:stems[type].split('\n')[0].split(' Use ')[0]});
    await card.waitFor();assert.equal(await card.locator('img,script').count(),0);
    const questions=await(await page.request.get(base+`/api/teacher/courses/${cid}/questions`,{headers})).json(),q=questions.find(q=>q.latest.stem===stems[type]);
    assert.ok(q);assert.equal(q.latest.type,type);assert.equal(q.status,'published');
    if(type==='mcq')assert.equal(q.latest.options[0],'`a < b`\n```js\na < b\n```');
    await card.getByRole('button',{name:'Edit',exact:true}).click();
    const edit=card.getByRole('region',{name:'Question editor'});
    assert.equal(await edit.getByLabel(type==='tf'?'Statement':'Question',{exact:true}).inputValue(),stems[type]);
    assert.equal(await edit.getByLabel('Topic',{exact:true}).inputValue(),'Independent authoring '+type);
    assert.equal(await edit.getByLabel('Topic',{exact:true}).isDisabled(),true,'published taxonomy remains fixed');
    await edit.getByLabel('Explanation shown after answering',{exact:true}).fill('Updated explanation with `a < b` and **reasoning**.');
    await edit.getByRole('button',{name:'Save',exact:true}).click();await edit.waitFor({state:'detached'});
    await page.reload();await page.getByRole('button',{name:/^Published \(/}).click();
    const saved=await(await page.request.get(base+`/api/teacher/courses/${cid}/questions`,{headers})).json();
    const updated=saved.find(x=>x.id===q.id);assert.equal(updated.versions.length,2);assert.equal(updated.latest.stem,stems[type]);
    assert.equal(updated.latest.explanation,'Updated explanation with `a < b` and **reasoning**.');
  }
  const formatted=page.locator('.qcard').filter({hasText:'Interpret the following CSS rule and choose its width.'});
  await formatted.scrollIntoViewIfNeeded();
  await page.screenshot({path:'tmp/question-bank-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await formatted.scrollIntoViewIfNeeded();
  await page.screenshot({path:'tmp/question-bank-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow');
  const first=formatted;await first.getByRole('button',{name:'Edit',exact:true}).click();
  await first.getByRole('region',{name:'Question editor'}).scrollIntoViewIfNeeded();
  const mobileEditor=first.getByRole('region',{name:'Question editor'});
  await mobileEditor.getByLabel('Explanation shown after answering',{exact:true}).fill('Long-line preview\n```js\nconst text = "'+'x'.repeat(500)+'";\n```');
  await mobileEditor.getByText('Preview question',{exact:true}).click();
  const mobileText=mobileEditor.getByRole('region',{name:'Markdown editor: Question',exact:true});
  await mobileText.getByRole('button',{name:'Preview',exact:true}).click();
  await mobileText.screenshot({path:'tmp/question-markdown-mobile.png'});
  await mobileText.getByRole('button',{name:'Write',exact:true}).click();
  assert.equal(await mobileEditor.locator('.editor-preview pre').last().evaluate(e=>e.scrollWidth>e.clientWidth),true,'long code scrolls within its own block');
  await page.evaluate(()=>{const e=document.querySelector('.question-editor');window.scrollTo(0,e.getBoundingClientRect().top+scrollY-110);});
  await page.screenshot({path:'tmp/question-editor-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await first.getByRole('button',{name:'Cancel',exact:true}).click();
  const historical=await(await page.request.get(base+`/api/teacher/courses/${cid}/questions`,{headers})).json();
  for(const type of ['numeric','param']) {
    const q=historical.find(q=>q.latest.type===type);assert.ok(q);
    await page.getByRole('button',{name:q.status==='published'?/^Published \(/:/^Needs review \(/}).click();
    await page.getByLabel('Filter by topic').selectOption(q.topicId); // the list is paged; narrow it like a professor would
    const legacy=page.locator('#qcard-'+q.id);await legacy.getByRole('button',{name:'Edit',exact:true}).click();
    const form=legacy.getByRole('region',{name:'Question editor'});
    assert.equal(await form.getByLabel('Format',{exact:true}).inputValue(),type);
    assert.equal(await form.getByLabel('Format',{exact:true}).locator('option').count(),5);
    await form.getByRole('button',{name:'Check',exact:true}).click();
    await form.getByText('Structure checks pass.',{exact:true}).waitFor();
    await form.getByText('Preview question',{exact:true}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await form.getByRole('button',{name:'Cancel',exact:true}).click();
  }
  assert.equal(calls,0,'manual authoring and publication use zero inference');
});

test('question bank filters by topic and pages long lists',async t=>{
  const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  t.after(async()=>{await page.close();assert.deepEqual(errors,[]);});
  const db=srv.quiz.db,template=db.questions.find(q=>q.courseId==='c-comp' && q.topicId==='tp-net');
  // 14 extra drafts: 12 on Networking basics, 2 on Data representation.
  for(let i=0;i<14;i++) db.questions.push({...structuredClone(template),id:'q-page-'+i,status:'draft',topicId:i<12?'tp-net':'tp-data'});
  const drafts=(topic)=>db.questions.filter(q=>q.courseId==='c-comp' && q.status==='draft' && (!topic || q.topicId===topic)).length;
  await page.goto(base);await page.getByRole('button',{name:'Prof. Demo A',exact:false}).click();
  await page.getByRole('heading',{name:'Question bank',exact:true}).waitFor();
  await page.getByRole('button',{name:/^Needs review/}).click();
  const cards=page.locator('.qcard'),pager=page.getByRole('navigation',{name:'Question pages',exact:true});
  await pager.getByText(`Showing 1–10 of ${drafts()} questions`).waitFor();
  assert.equal(await cards.count(),10);
  await pager.getByRole('button',{name:'Page 2',exact:true}).click();
  assert.equal(await cards.count(),drafts()-10);
  // Choosing a topic narrows the list and the status counts, and returns to page 1.
  await page.getByLabel('Filter by topic').selectOption('tp-data');
  await page.getByRole('button',{name:`Needs review (${drafts('tp-data')})`,exact:true}).waitFor();
  assert.equal(await cards.count(),drafts('tp-data'));
  assert.equal(await pager.count(),0,'one page needs no pager');
  await page.getByLabel('Filter by topic').selectOption('tp-net');
  await pager.getByText(`Showing 1–10 of ${drafts('tp-net')} questions`).waitFor();
  db.questions=db.questions.filter(q=>!q.id.startsWith('q-page-'));
});
