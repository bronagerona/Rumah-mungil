/* PROJECT WINGMATE — local model decision bridge.
   Decisions are requested from the Android-hosted local GGUF model.
   No scripted action fallback: if the model bridge is missing, show AI offline. */
(()=>{'use strict';
let inFlight=false,lastRequest=0,timeoutId=null;
function request(state){
  const now=Date.now();
  if(inFlight||now-lastRequest<900)return false;
  const host=window.ReactNativeWebView;
  if(!host||typeof host.postMessage!=='function')return false;
  inFlight=true;lastRequest=now;
  try{host.postMessage(JSON.stringify({type:'wingmate_decision_request',context:state}));timeoutId=setTimeout(()=>{inFlight=false;if(window.__wingmateAIRequestFailed)window.__wingmateAIRequestFailed()},12000);return true}
  catch(e){inFlight=false;return false}
}
window.WingmateAI={
  get mode(){return window.ReactNativeWebView?'LOCAL MODEL BRIDGE':'AI OFFLINE'},
  request,
  receive(result){inFlight=false;if(timeoutId!==null){clearTimeout(timeoutId);timeoutId=null}if(window.__receiveWingmateAI)window.__receiveWingmateAI(result)}
};
window.__wingmateAIRequestFailed=function(){inFlight=false};
})();