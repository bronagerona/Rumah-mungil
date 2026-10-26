import React, {useEffect, useRef, useState} from 'react';
import {SafeAreaView, StatusBar, Text, View, TouchableOpacity, ActivityIndicator, Alert, StyleSheet} from 'react-native';
import {pick, types, keepLocalCopy} from '@react-native-documents/picker';
import {WebView} from 'react-native-webview';
import {initLlama} from 'llama.rn';

const ACTIONS = ['collect_drop','protect_player'];
export default function App() {
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false);
  const [status,setStatus]=useState('Pilih model GGUF lokal. Game dibuka setelah tes AI berhasil.');
  const webRef=useRef(null),ctxRef=useRef(null),inferenceRef=useRef(false);
  useEffect(()=>()=>{if(ctxRef.current?.release)ctxRef.current.release()},[]);
  async function loadModel(){
    if(inferenceRef.current){Alert.alert('AI sedang berpikir','Tunggu keputusan selesai sebelum mengganti model.');return}
    let next=null;
    try{
      setBusy(true);
      const picked=await pick({type:[types.allFiles]});
      const file=Array.isArray(picked)?picked[0]:picked;
      if(!file?.name?.toLowerCase().endsWith('.gguf')){Alert.alert('Format model salah','Pilih file model .gguf.');return}
      setStatus('Menyalin model ke penyimpanan aplikasi…');
      const copies=await keepLocalCopy({files:[{uri:file.uri,fileName:file.name}],destination:'cachesDirectory'});
      const local=copies?.[0];
      if(local?.status!=='success'||!local.localUri)throw new Error(local?.copyError||'Gagal menyalin model.');
      if(ctxRef.current?.release){await ctxRef.current.release();ctxRef.current=null}
      setReady(false);setStatus('Memuat model AI lokal…');
      next=await initLlama({model:local.localUri,n_ctx:2048,n_threads:4,n_gpu_layers:0,use_mmap:true});
      setStatus('Menguji inferensi lokal…');
      const probe=await next.completion({prompt:'Balas tepat satu kata: SIAP',n_predict:12,temperature:0});
      if(!probe?.text?.trim())throw new Error('Model tidak memberi respons pada tes awal.');
      ctxRef.current=next;next=null;setReady(true);setStatus('AI LOKAL SIAP · Wingmate akan mengambil keputusan tempur');
    }catch(e){
      if(String(e?.code||'').toLowerCase().includes('cancel'))setStatus(ready?'Model lokal tetap aktif.':'Pemilihan model dibatalkan.');
      else{setStatus('Model belum siap. Periksa file GGUF.');Alert.alert('AI lokal belum siap',String(e?.message||e))}
    }finally{if(next?.release){try{await next.release()}catch(_){}}setBusy(false)}
  }
  function sendResult(result){webRef.current?.injectJavaScript('window.WingmateAI&&window.WingmateAI.receive('+JSON.stringify(result)+'); true;')}
  async function onGameMessage(event){
    let msg;try{msg=JSON.parse(event.nativeEvent.data)}catch(_){return}
    if(msg?.type!=='wingmate_decision_request')return;
    if(!ctxRef.current||inferenceRef.current){sendResult({action:null});return}
    inferenceRef.current=true;
    try{
      const s=msg.context||{};
      const hpPercent=Number(s.hpPercent)||0;const prompt='You are the tactical AI wingmate companion in a vertical shooter. Choose exactly one action. If player HP is ABOVE 50%, choose collect_drop and prioritize EXP/GOLD drops. If player HP is 50% OR BELOW, choose protect_player: stay near the player and prioritize using Magnet Pulse to clear nearby enemy bullets when its cooldown is ready. Keep shooting in either mode. Obey the HP threshold strictly. Output exactly collect_drop or protect_player, no explanation. Context: '+JSON.stringify({hp:Number(s.hp)||0,hpPercent,hpMax:Number(s.hpMax)||100,threat:!!s.threat,nearbyDrops:Number(s.nearbyDrops)||0,drops:s.drops,player:s.player,companion:s.companion});
      const result=await ctxRef.current.completion({prompt,n_predict:8,temperature:0,grammar:'root ::= "collect_drop" | "protect_player"'});
      const raw=String(result?.text||'').trim().toLowerCase();
      const normalized=raw.replace(/[^a-z_]/g,' ').split(/\s+/).find(token=>ACTIONS.includes(token));
      const action=normalized||null;
      sendResult({action,raw:raw.slice(0,42)});
      setStatus(action?'AI LOKAL AKTIF · keputusan: '+action.toUpperCase():'AI lokal merespons, format keputusan tidak valid · '+raw.slice(0,42));
    }catch(e){sendResult({action:null});setStatus('AI lokal gagal memberi keputusan; periksa logika model/prompt.')}
    finally{inferenceRef.current=false}
  }
  return <SafeAreaView style={styles.root}>
    <StatusBar backgroundColor="#080d20" barStyle="light-content"/>
    <View style={styles.head}>
      <Text style={styles.title}>PROJECT WINGMATE</Text><Text style={styles.status}>{status}</Text>
      <TouchableOpacity style={styles.btn} onPress={loadModel} disabled={busy}><Text style={styles.btnText}>{busy?'Memproses model…':ready?'Ganti model GGUF':'Pilih model GGUF'}</Text></TouchableOpacity>
    </View>
    {ready?<WebView ref={webRef} style={styles.game} source={{uri:'file:///android_asset/index.html'}} javaScriptEnabled domStorageEnabled allowFileAccess originWhitelist={['*']} onMessage={onGameMessage} onLoadEnd={()=>webRef.current?.injectJavaScript('window.__wingmateAIReady=true; true;')}/>:<View style={styles.loader}>
      {busy?<ActivityIndicator size="large" color="#5ee7ff"/>:<Text style={styles.emoji}>✈️</Text>}
      <Text style={styles.loaderTitle}>{busy?'Menyiapkan model lokal…':'Aktifkan AI Wingmate'}</Text>
      <Text style={styles.loaderText}>Pilih model GGUF yang tersimpan di HP. Game hanya dibuka setelah model lokal berhasil dimuat dan memberi respons tes. Model tidak dibundel ke APK.</Text>
    </View>}
  </SafeAreaView>
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#080d20'},head:{backgroundColor:'#101a32',padding:12},title:{fontSize:20,fontWeight:'bold',color:'#5ee7ff'},status:{color:'#e7efff',marginVertical:7},btn:{backgroundColor:'#13637b',padding:10,borderRadius:8,alignItems:'center'},btnText:{color:'#fff',fontWeight:'bold'},game:{flex:1},loader:{flex:1,alignItems:'center',justifyContent:'center',padding:28},emoji:{fontSize:48,marginBottom:12},loaderTitle:{fontSize:20,fontWeight:'bold',color:'#e7efff',marginBottom:10},loaderText:{textAlign:'center',color:'#c0cde8',lineHeight:22}});
