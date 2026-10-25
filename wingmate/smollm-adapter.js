/* PROJECT WINGMATE — SmolLM companion adapter
 * This adapter does not pretend a model is installed. It probes for an app-provided
 * local bridge with generate(prompt, options) and validates its response. Without one,
 * it uses a small deterministic fallback so gameplay remains functional.
 */
(()=>{'use strict';
const valid=new Set(['defend','focus_boss','attack','patrol']);
let lastAction='patrol',lastAt=0,bridge=null,modelLabel='fallback';
function findBridge(){
  const candidates=[window.SmolLMBridge,window.smollmBridge,window.LocalLLM,window.localLLM];
  return candidates.find(x=>x&&typeof x.generate==='function')||null;
}
function normalize(v){v=String(v||'').toLowerCase().trim().replace(/[^a-z_].*$/s,'');return valid.has(v)?v:null}
async function ask(state){
  bridge=findBridge();if(!bridge)return null;
  const prompt='You control a companion aircraft in a vertical arcade shooter. Choose exactly one action: defend, focus_boss, attack, patrol. Rules: defend when threat=true and hp<55; focus_boss when boss=true; attack when nearby>0; otherwise patrol. Never output anything except the action. State JSON: '+JSON.stringify(state);
  try{
    const out=await bridge.generate(prompt,{maxTokens:12,temperature:0.1});
    const text=typeof out==='string'?out:(out&&typeof out.text==='string'?out.text:'');
    const action=normalize(text);if(action){modelLabel='SmolLM LOCAL';return action}
  }catch(e){/* bridge unavailable: continue fallback */}
  modelLabel='fallback';return null;
}
function fallback(s){if(s.threat&&s.hp<55)return'defend';if(s.boss)return'focus_boss';if(s.nearby>0)return'attack';return'patrol'}
window.WingmateAI={
  get mode(){bridge=findBridge();return bridge?'SmolLM LOCAL':'FALLBACK';},
  get modelLabel(){return modelLabel;},
  decide(state){
    const now=Date.now();
    if(now-lastAt<650)return lastAction;
    lastAt=now;
    const immediate=fallback(state);lastAction=immediate;
    // Model calls are asynchronous and throttled; deterministic fallback is immediate.
    ask(state).then(action=>{if(action)lastAction=action;}).catch(()=>{});
    return immediate;
  }
};
})();
