/* PROJECT WINGMATE — native local-model bridge. */
(()=>{'use strict';
let inFlight=false,lastRequest=0,timeoutId=null;
function post(payload){const host=window.ReactNativeWebView;if(!host||typeof host.postMessage!=='function')return false;try{host.postMessage(JSON.stringify(payload));return true}catch(e){return false}}
function request(state){const now=Date.now();if(inFlight||now-lastRequest<900)return false;if(!post({type:'wingmate_decision_request',context:state}))return false;inFlight=true;lastRequest=now;timeoutId=setTimeout(()=>{inFlight=false;timeoutId=null;if(window.__wingmateAIResponseTimeout)window.__wingmateAIResponseTimeout();if(window.__wingmateAIRequestFailed)window.__wingmateAIRequestFailed()},12000);return true}
window.WingmateAI={
 get mode(){return window.ReactNativeWebView?'LOCAL MODEL BRIDGE':'AI OFFLINE'},
 request,
 activateBattle(){return post({type:'switch_model',mode:'battle'})},
 activateChat(){return post({type:'switch_model',mode:'chat'})},
 sendChat(text){return post({type:'wingmate_chat_request',text:String(text||'').slice(0,500)})},
 receive(result){inFlight=false;if(timeoutId!==null){clearTimeout(timeoutId);timeoutId=null}if(window.__receiveWingmateAI)window.__receiveWingmateAI(result)}
};
window.__wingmateAIRequestFailed=function(){inFlight=false};
})();