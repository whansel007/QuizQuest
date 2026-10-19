const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {createQuizApi}=require('../src/quiz/api');
const {seed}=require('../src/quiz/seed');
const {newInstance}=require('../src/quiz/formats');
const {toTables,fromTables}=require('../src/db/schema');
const {contentText}=require('../src/quiz/content');
test('manual authoring validates four new formats, preserves Markdown history and uses the Game grading service without inference',async t=>{
  const db=seed();let calls=0;
  const api=createQuizApi({store:{db,save(){},flush:async()=>{}},authoringAI:async()=>{calls++;throw Error('Unexpected inference');}});
  const server=http.createServer((req,res)=>api.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
  const base=`http://127.0.0.1:${server.address().port}`;
  const login=await(await fetch(base+'/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:'t-a'})})).json();
  async function request(path,body,method='POST') {const r=await fetch(base+path,{method,headers:{'content-type':'application/json',authorization:'Bearer '+login.token},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};}
  const path='/api/teacher/courses/c-comp/questions';
  const variants={mcq:{stem:'Interpret the following comparison and select the expression that returns true.\n```js\nconst x = 2;\nconsole.log(x < 3);\n```',options:['    x < 3','x > 3','x === 3','x < 1'],answerIndex:0},tf:{stem:'A hypothetical object moving two metres each second travels ten metres in five seconds.',answerIndex:0},short:{stem:'Calculate the total price of four hypothetical books costing three credits each.',answerMode:'numeric',answer:12,tolerance:.01,unit:'credits',modelAnswer:'12 credits',keyPoints:['Multiply price by quantity.']},multi:{stem:'Select both supplied observations that support the proposed controlled comparison.',options:['Only treatment differs','Temperature is held constant','Sample sizes are unknown','Different lighting is introduced'],answerIndexes:[0,1]}};
  for(const [type,value] of Object.entries(variants)) {
    const raw={type,...value,topicText:'Manual '+type,learningOutcome:'Interpret evidence and justify '+type+' decisions.',difficulty:'medium',sourceIds:[],explanation:'    const evidence = "**literal**";\n    // < & > remain text'};
    const created=await request(path,raw);assert.equal(created.status,201,JSON.stringify(created.body));const id=created.body.id;
    const q=db.questions.find(q=>q.id===id),v=q.versions[0];assert.equal(v.stem,raw.stem);assert.equal(v.explanation,raw.explanation);
    const tags=db.topics.find(x=>x.id===q.topicId);assert.equal(tags.name,raw.topicText);assert.equal(tags.outcomes.find(x=>x.id===q.outcomeId).text,raw.learningOutcome);
    assert.equal((await request(`/api/teacher/questions/${id}/status`,{action:'approve'})).status,200);
    const sub=type==='multi'?{choices:v.answerIndexes}:type==='short'?{text:'12 credits'}:{choice:v.answerIndex};
    const result=await api.services.answerQuestion({user:db.users.find(u=>u.id==='s-01'),cls:db.classes.find(c=>c.id==='cl-a'),q,v,instance:newInstance(v),submission:sub,servedAt:Date.now(),context:'world'});
    assert.equal(result.result.correct,true);
    assert.equal((await request(`/api/teacher/questions/${id}`,{...raw,explanation:raw.explanation+'\n    // Saved revision'},'PUT')).status,200);
    assert.equal(q.versions.length,2);assert.equal(q.versions[0].explanation,raw.explanation);
    assert.equal((await request(`/api/teacher/questions/${id}`,{...raw,topicText:'Changed published topic'},'PUT')).status,409);
    const restored=fromTables(toTables(db,()=>1)).questions.find(x=>x.id===id);assert.deepEqual(restored.versions,q.versions);
  }
  const count=db.topics.length;
  assert.equal((await request(path,{...variants.mcq,type:'mcq',topicText:'',learningOutcome:'Missing topic'})).status,400);
  assert.equal(db.topics.length,count,'failed validation creates no taxonomy records');
  assert.equal((await request(path,{...variants.multi,type:'multi',topicText:'Invalid multi',learningOutcome:'Choose evidence',answerIndexes:[0],difficulty:'medium',explanation:'Test explanation'})).status,400);
  for(const type of ['numeric','param']) {
    const historical=db.questions.find(q=>q.courseId==='c-comp' && q.versions.at(-1).type===type);assert.ok(historical);
    const raw={...historical.versions.at(-1),topicId:historical.topicId,outcomeId:historical.outcomeId};
    assert.equal((await request(path,raw)).status,400,'new legacy formats unavailable');
    assert.equal((await request('/api/teacher/questions/'+historical.id,raw,'PUT')).status,200,'historical '+type+' remains editable');
  }
  assert.equal(calls,0);
});
test('content cleanup preserves code indentation and treats whitespace-only content as empty',()=>{
  assert.equal(contentText('\n    const x = 1;\n      run(x);\n'),'    const x = 1;\n      run(x);');
  assert.equal(contentText('  Plain text  '),'Plain text');assert.equal(contentText(' \n \t '),'');
});
