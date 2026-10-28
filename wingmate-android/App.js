import React, {useEffect, useRef, useState} from 'react';
import {SafeAreaView, StatusBar, Text, View, TouchableOpacity, ActivityIndicator, Alert, StyleSheet} from 'react-native';
import {pick, types, keepLocalCopy} from '@react-native-documents/picker';
import {WebView} from 'react-native-webview';
import {initLlama} from 'llama.rn';

const ACTIONS = ['collect_drop','protect_player'];
const GAME_KNOWLEDGE = 'Konteks singkat PROJECT WINGMATE: shooter vertikal 100 stage; Joni mengendalikan pesawat dengan sentuhan dan geseran jari, tembakan otomatis. Tiap stage perlu 50 kill sebelum boss; stage kelipatan 10 memiliki elite boss. Musuh menjatuhkan EXP dan GOLD. Upgrade senjata dan damage punya biaya berbeda yang meningkat. Pilot punya HP; jika habis, misi gagal. Wingmate adalah partner AI tanpa HP terpisah. Wing Pulse otomatis tiap 10 detik. Magnet Pulse dapat membersihkan peluru sekitar Joni, menarik drop, dan memberi damage area. Jangan menjelaskan detail teknis AI kecuali Joni bertanya. Jangan mengaku tahu status permainan langsung jika tidak diberikan.';
export default function App() {
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[selectedGame,setSelectedGame]=useState('wingmate');
  const [status,setStatus]=useState('Pilih dua model GGUF: SmolLM untuk battle dan model pilihan untuk chat.');
  const webRef=useRef(null),ctxRef=useRef(null),inferenceRef=useRef(false),swappingRef=useRef(false);
  const modelsRef=useRef({battle:null,chat:null}),activeModeRef=useRef(null),chatHistoryRef=useRef([]),zeniaCommentBusyRef=useRef(false);
  useEffect(()=>()=>{if(ctxRef.current?.release)ctxRef.current.release()},[]);
  async function chooseLocalModel(role){
    const picked=await pick({type:[types.allFiles]});
    const file=Array.isArray(picked)?picked[0]:picked;
    if(!file||!file.name||!file.name.toLowerCase().endsWith('.gguf'))throw new Error('Pilih file model berformat .gguf untuk '+(role==='battle'?'battle':'chat')+'.');
    setStatus('Menyalin model '+(role==='battle'?'battle':'chat')+' ke penyimpanan aplikasi…');
    const copies=await keepLocalCopy({files:[{uri:file.uri,fileName:role+'-'+file.name}],destination:'cachesDirectory'});
    const local=copies&&copies[0];
    if(!local||local.status!=='success'||!local.localUri)throw new Error((local&&local.copyError)||'Gagal menyalin model '+role+'.');
    return {path:local.localUri,name:file.name};
  }
  async function createTestedContext(model){
    let next=null;
    try{
      next=await initLlama({model:model.path,n_ctx:2048,n_threads:4,n_gpu_layers:0,use_mmap:true});
      const probe=await next.completion({prompt:'Balas tepat satu kata: SIAP',n_predict:12,temperature:0});
      if(!probe||!probe.text||!probe.text.trim())throw new Error('Model '+model.name+' tidak memberi respons pada tes awal.');
      const readyContext=next;next=null;return readyContext;
    }finally{if(next&&next.release){try{await next.release()}catch(_){}}}
  }
  async function chooseModels(){
    if(swappingRef.current||inferenceRef.current){Alert.alert('AI sedang sibuk','Tunggu proses AI selesai.');return}
    setBusy(true);
    try{
      setStatus('Pilih model battle (SmolLM2 GGUF)…');
      const battle=await chooseLocalModel('battle');
      setStatus('Pilih model chat (Qwen, Gemma, atau GGUF lain)…');
      const chat=await chooseLocalModel('chat');
      setStatus('Menguji model battle…');
      const context=await createTestedContext(battle);
      if(ctxRef.current&&ctxRef.current.release){try{await ctxRef.current.release()}catch(_){}}
      ctxRef.current=context;modelsRef.current={battle,chat};activeModeRef.current='battle';chatHistoryRef.current=[];
      setReady(true);setStatus('Kedua model terdaftar · model battle aktif: '+battle.name);
    }catch(e){
      const cancelled=String(e&&e.code||'').toLowerCase().includes('cancel');
      setStatus(cancelled?'Pemilihan model dibatalkan. Pilih kedua model untuk mulai.':'Gagal menyiapkan model. Periksa file GGUF dan coba lagi.');
      if(!cancelled)Alert.alert('Model lokal belum siap',String(e&&e.message||e));
    }finally{setBusy(false)}
  }
  function sendNativeMessage(message){
    const encoded=JSON.stringify(message);
    webRef.current?.injectJavaScript('window.__wingmateNativeMessage&&window.__wingmateNativeMessage('+encoded+'); true;');
  }
  function sendDecision(result){
    webRef.current?.injectJavaScript('window.WingmateAI&&window.WingmateAI.receive('+JSON.stringify(result)+'); true;');
  }
  async function activateMode(mode){
    if(!modelsRef.current[mode]){sendNativeMessage({type:'model_ready',mode,ok:false,error:'Pilih model battle dan chat terlebih dahulu.'});return}
    if(swappingRef.current||inferenceRef.current){sendNativeMessage({type:'model_ready',mode,ok:false,error:'AI sedang menyelesaikan tugas sebelumnya. Coba lagi sebentar.'});return}
    if(ctxRef.current&&activeModeRef.current===mode){sendNativeMessage({type:'model_ready',mode,ok:true,modelName:modelsRef.current[mode].name});return}
    swappingRef.current=true;setBusy(true);setStatus('Beralih ke model '+(mode==='battle'?'battle':'chat')+'…');
    const previousMode=activeModeRef.current;
    let next=null;
    try{
      if(ctxRef.current&&ctxRef.current.release){const old=ctxRef.current;ctxRef.current=null;await old.release()}
      activeModeRef.current=null;
      next=await createTestedContext(modelsRef.current[mode]);
      ctxRef.current=next;next=null;activeModeRef.current=mode;
      setStatus('Model aktif: '+modelsRef.current[mode].name+' ('+mode+')');
      sendNativeMessage({type:'model_ready',mode,ok:true,modelName:modelsRef.current[mode].name});
    }catch(e){
      if(next&&next.release){try{await next.release()}catch(_){}}
      let restored=false;
      if(previousMode&&modelsRef.current[previousMode]){
        try{ctxRef.current=await createTestedContext(modelsRef.current[previousMode]);activeModeRef.current=previousMode;restored=true}catch(_){ctxRef.current=null;activeModeRef.current=null}
      }
      const message='Gagal memuat model '+modelsRef.current[mode].name+'.'+(restored?' Model sebelumnya dipulihkan.':' Muat ulang kedua model dari layar awal.')+' '+String(e&&e.message||e);
      setStatus(message);sendNativeMessage({type:'model_ready',mode,ok:false,error:message});
    }finally{swappingRef.current=false;setBusy(false)}
  }
  async function onGameMessage(event){
    let msg;try{msg=JSON.parse(event.nativeEvent.data)}catch(_){return}
    if(msg&&msg.type==='switch_model'){await activateMode(msg.mode==='chat'?'chat':'battle');return}
    if(msg&&msg.type==='zenia_comment_request'){
      if(selectedGame!=='zenia'||zeniaCommentBusyRef.current||swappingRef.current||inferenceRef.current||!modelsRef.current.chat)return;
      zeniaCommentBusyRef.current=true;
      try{
        if(activeModeRef.current!=='chat')await activateMode('chat');
        if(activeModeRef.current!=='chat'||!ctxRef.current)throw new Error('Model chat belum siap');
        inferenceRef.current=true;
        const c=msg.context||{};
        const eventNames={hurt:'Joni terkena serangan',low_hp:'HP Joni tinggal sedikit',kill:'Joni mengalahkan monster',boss:'boss muncul',boss_defeated:'boss dikalahkan'};
        const context='Lokasi: '+String(c.map||'petualangan')+'; Level: '+Number(c.level||1)+'; HP: '+Number(c.hp||0)+'/'+Number(c.maxHp||0)+' ('+Number(c.hpPercent||0)+'%); Monster: '+String(msg.monster||'monster')+'; Musuh dekat: '+Number(c.nearby||0)+'; Boss dekat: '+(c.boss?'ya':'tidak')+'; Quest: '+String(c.quest||'belum ada');
        const prompt='<start_of_turn>user\\nKamu companion serigala lucu di game RPG Zenia. Buat SATU komentar pendek, spontan, kocak, dan relevan dalam bahasa Indonesia santai untuk Joni. Maksimal satu kalimat pendek, 4-12 kata. Jangan mengarang aksi, jangan memberi instruksi gameplay, jangan keluarkan label atau markdown. Kamu hanya membuat komentar; tidak mengendalikan gerakan atau aksi game.\\nKejadian: '+(eventNames[String(msg.event)]||'ada kejadian di petualangan')+'. Konteks: '+context+'\\nTulis hanya komentarnya.<end_of_turn>\\n<start_of_turn>model\\n';
        const result=await ctxRef.current.completion({prompt,n_predict:48,temperature:0.78,top_p:0.9});
        let answer=String(result&&result.text||'').replace(/<end_of_turn>[\\s\\S]*$/i,'').replace(/<start_of_turn>[\\s\\S]*$/i,'').replace(/[\\r\\n]+/g,' ').replace(/^\\s*[\"'“”*#>\\-]+|[\"'“”*#>\\-]+\\s*$/g,'').trim();
        if(/[a-zA-ZÀ-ÿ0-9]/.test(answer)){
          if(answer.length>100)answer=answer.slice(0,97).replace(/\\s+\\S*$/,'')+'…';
          webRef.current?.injectJavaScript('window.ZeniaLocalAI&&window.ZeniaLocalAI.receiveComment('+JSON.stringify(answer)+'); true;');
        }
      }catch(e){setStatus('Komentar Zenia gagal kali ini; gameplay tetap berjalan.');}
      finally{
        inferenceRef.current=false;
        try{if(activeModeRef.current!=='battle')await activateMode('battle')}catch(_){}
        zeniaCommentBusyRef.current=false;
      }
      return;
    }
    if(msg&&msg.type==='wingmate_chat_request'){
      if(activeModeRef.current!=='chat'||!ctxRef.current||inferenceRef.current||swappingRef.current){sendNativeMessage({type:'chat_reply',error:'Model chat belum aktif. Buka chat lagi setelah model siap.'});return}
      inferenceRef.current=true;
      try{
        const userText=String(msg.text||'').trim().slice(0,500);if(!userText){sendNativeMessage({type:'chat_reply',text:''});return}
        const modelName=String(modelsRef.current.chat&&modelsRef.current.chat.name||'').toLowerCase();
        const isGemma=/gemma/i.test(modelName);
        const isQwen=/qwen/i.test(modelName);
        const isGameQuestion=/game|stage|boss|upgrade|gold|exp|wing pulse|magnet pulse|cara main|pesawat|skill|senjata|misi/i.test(userText);
        const instructions='Kamu Wingmate, teman AI Joni. Jawab langsung pesan Joni dalam bahasa Indonesia yang santai dan masuk akal. Jawab hanya pesan terakhir, biasanya satu atau dua kalimat. Jangan menulis nama pembicara, dialog tambahan, markdown, daftar, atau simbol dekoratif. Jangan menyebut Joni sebagai pemain. Jika tidak tahu, katakan dengan jujur.';
        const gameContext=isGameQuestion?GAME_KNOWLEDGE:'';
        const history=chatHistoryRef.current.slice(-4);
        const buildPrompt=(withHistory)=>{
          if(isGemma){
            let p='<start_of_turn>user\n'+instructions+(gameContext?'\n'+gameContext:'')+'\nGunakan instruksi ini hanya untuk menjawab pertanyaan Joni berikutnya.\n<end_of_turn>\n';
            if(withHistory)history.forEach(m=>{p+='<start_of_turn>'+(m.role==='user'?'user':'model')+'\n'+m.text+'<end_of_turn>\n'});
            return p+'<start_of_turn>user\n'+userText+'<end_of_turn>\n<start_of_turn>model\n';
          }
          let p='<|im_start|>system\n'+instructions+(gameContext?'\n'+gameContext:'')+'<|im_end|>\n';
          if(withHistory)history.forEach(m=>{p+='<|im_start|>'+(m.role==='user'?'user':'assistant')+'\n'+m.text+'<|im_end|>\n'});
          return p+'<|im_start|>user\n'+userText+'<|im_end|>\n<|im_start|>assistant\n';
        };
        const cleanAnswer=raw=>String(raw||'').replace(/<\|im_end\|>|<\|im_start\|>.*$/s,'').replace(/<end_of_turn>[\s\S]*$/i,'').replace(/^\s*(?:Wingmate|Assistant|Bot)\s*[:：-]\s*/i,'').split(/\n\s*(?:Joni|Pemain|User|Human|Wingmate|Assistant|Bot)\s*[:：]/i)[0].replace(/^[\s*#>\-`~•]+|[\s*#>\-`~•]+$/g,'').replace(/\bPemain\b/gi,'Joni').trim();
        const validAnswer=text=>/[a-zA-Z0-9À-ÿ]/.test(text)&&text.replace(/[\s*#>\-`~•]/g,'').length>=2;
        let result=await ctxRef.current.completion({prompt:buildPrompt(true),n_predict:64,temperature:0.25});
        let answer=cleanAnswer(result&&result.text);
        if(!validAnswer(answer)){
          const retryPrompt=isGemma?'<start_of_turn>user\nJawab dengan satu kalimat bahasa Indonesia yang wajar. Jangan tulis markdown atau simbol. Pertanyaan Joni: '+userText+'<end_of_turn>\n<start_of_turn>model\n':'<|im_start|>user\nJawab dengan satu kalimat bahasa Indonesia yang wajar. Jangan tulis markdown atau simbol. Pertanyaan Joni: '+userText+'<|im_end|>\n<|im_start|>assistant\n';
          result=await ctxRef.current.completion({prompt:retryPrompt,n_predict:48,temperature:0.2});
          answer=cleanAnswer(result&&result.text);
        }
        if(!validAnswer(answer))throw new Error('Model memberi teks yang tidak terbaca. Coba kirim pesan sekali lagi.');
        if(answer.length>300)answer=answer.slice(0,297).replace(/\s+\S*$/,'')+'…';
        chatHistoryRef.current.push({role:'user',text:userText},{role:'assistant',text:answer});
        if(chatHistoryRef.current.length>12)chatHistoryRef.current=chatHistoryRef.current.slice(-12);
        sendNativeMessage({type:'chat_reply',text:answer});
      }catch(e){sendNativeMessage({type:'chat_reply',error:'Chat AI gagal: '+String(e&&e.message||e)})}
      finally{inferenceRef.current=false}
      return;
    }
    if(!msg||msg.type!=='wingmate_decision_request')return;
    if(!ctxRef.current||activeModeRef.current!=='battle'||inferenceRef.current||swappingRef.current){sendDecision({action:null});return}
    inferenceRef.current=true;
    try{
      const s=msg.context||{},hpPercent=Number(s.hpPercent)||0;
      const prompt='You are the tactical AI wingmate companion in a vertical shooter. Choose exactly one action. If player HP is ABOVE 50%, choose collect_drop and prioritize EXP/GOLD drops. If player HP is 50% OR BELOW, choose protect_player: stay near the player and prioritize using Magnet Pulse to clear nearby enemy bullets when its cooldown is ready. Keep shooting in either mode. Obey the HP threshold strictly. Output exactly collect_drop or protect_player, no explanation. Context: '+JSON.stringify({hp:Number(s.hp)||0,hpPercent,hpMax:Number(s.hpMax)||100,threat:!!s.threat,nearbyDrops:Number(s.nearbyDrops)||0,drops:s.drops,player:s.player,companion:s.companion});
      const result=await ctxRef.current.completion({prompt,n_predict:8,temperature:0,grammar:'root ::= "collect_drop" | "protect_player"'});
      const raw=String(result&&result.text||'').trim().toLowerCase();
      const normalized=raw.replace(/[^a-z_]/g,' ').split(/\s+/).find(token=>ACTIONS.includes(token));
      const action=normalized||null;sendDecision({action,raw:raw.slice(0,42)});
      setStatus(action?'AI battle aktif · '+action.toUpperCase():'AI battle memberi format keputusan tidak valid · '+raw.slice(0,42));
    }catch(e){sendDecision({action:null});setStatus('AI battle gagal memberi keputusan; periksa model/prompt.')}
    finally{inferenceRef.current=false}
  }
  return <SafeAreaView style={styles.root}>
    <StatusBar backgroundColor="#080d20" barStyle="light-content"/>
    <View style={styles.head}>
      <Text style={styles.title}>PROJECT WINGMATE</Text><Text style={styles.status}>{status}</Text>
      {ready?<View style={styles.gamePicker}><TouchableOpacity style={[styles.gameBtn,selectedGame==='wingmate'&&styles.gameBtnActive]} onPress={()=>setSelectedGame('wingmate')}><Text style={styles.btnText}>✈️ Wingmate</Text></TouchableOpacity><TouchableOpacity style={[styles.gameBtn,selectedGame==='zenia'&&styles.gameBtnActive]} onPress={()=>setSelectedGame('zenia')}><Text style={styles.btnText}>🐺 Zenia</Text></TouchableOpacity></View>:null}
      <TouchableOpacity style={styles.btn} onPress={chooseModels} disabled={busy}><Text style={styles.btnText}>{busy?'Menyiapkan model…':ready?'Ganti kedua model GGUF':'Pilih dua model GGUF'}</Text></TouchableOpacity>
    </View>
    {ready?<WebView key={selectedGame} ref={webRef} style={styles.game} source={{uri:selectedGame==='zenia'?'file:///android_asset/zenia.html':'file:///android_asset/index.html'}} javaScriptEnabled domStorageEnabled allowFileAccess originWhitelist={['*']} onMessage={onGameMessage} onLoadEnd={()=>{if(selectedGame==='wingmate')webRef.current?.injectJavaScript('window.__wingmateAIReady=true; true;')}}/>:<View style={styles.loader}>
      {busy?<ActivityIndicator size="large" color="#5ee7ff"/>:<Text style={styles.emoji}>✈️</Text>}
      <Text style={styles.loaderTitle}>{busy?'Menyiapkan dua model lokal…':'Aktifkan dua model Wingmate'}</Text>
      <Text style={styles.loaderText}>Pilih SmolLM2 GGUF untuk battle, lalu pilih model GGUF lain untuk chat. Kedua berkas disiapkan saat startup, tetapi hanya satu model dimuat ke RAM pada satu waktu. Game dibuka setelah model battle lulus tes inferensi.</Text>
    </View>}
  </SafeAreaView>
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#080d20'},head:{backgroundColor:'#101a32',padding:12},title:{fontSize:20,fontWeight:'bold',color:'#5ee7ff'},status:{color:'#e7efff',marginVertical:7},btn:{backgroundColor:'#13637b',padding:10,borderRadius:8,alignItems:'center'},btnText:{color:'#fff',fontWeight:'bold'},game:{flex:1},gamePicker:{flexDirection:'row',gap:8,marginBottom:8},gameBtn:{flex:1,backgroundColor:'#26324d',padding:9,borderRadius:8,alignItems:'center'},gameBtnActive:{backgroundColor:'#13637b',borderWidth:1,borderColor:'#5ee7ff'},loader:{flex:1,alignItems:'center',justifyContent:'center',padding:28},emoji:{fontSize:48,marginBottom:12},loaderTitle:{fontSize:20,fontWeight:'bold',color:'#e7efff',marginBottom:10},loaderText:{textAlign:'center',color:'#c0cde8',lineHeight:22}});