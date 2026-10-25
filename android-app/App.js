import React, {useEffect, useState} from 'react';
import {SafeAreaView, StatusBar, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, StyleSheet} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import {WebView} from 'react-native-webview';
import {initLlama} from 'llama.rn';

export default function App() {
 const [ctx,setCtx]=useState(null), [busy,setBusy]=useState(false), [status,setStatus]=useState('Pilih model GGUF untuk mengaktifkan NPC lokal.'), [question,setQuestion]=useState(''), [reply,setReply]=useState('');
 useEffect(()=>()=>{if(ctx?.release) ctx.release();},[ctx]);
 async function loadModel(){
  try {
   const file=await DocumentPicker.pickSingle({type:[DocumentPicker.types.allFiles],copyTo:'cachesDirectory'});
   if(!file.name?.toLowerCase().endsWith('.gguf')) {Alert.alert('Pilih file .gguf');return;}
   setBusy(true);setStatus('Memuat model. Tunggu sampai selesai…');
   if(ctx?.release) await ctx.release();
   const next=await initLlama({model:file.fileCopyUri||file.uri,n_ctx:2048,n_threads:4,n_gpu_layers:0,use_mmap:true});
   setCtx(next);setStatus('Model siap. NPC berjalan lokal di HP.');
  } catch(e) {if(!DocumentPicker.isCancel(e)) {setStatus('Gagal memuat model');Alert.alert('Model gagal dimuat',String(e?.message||e));}}
  finally {setBusy(false);}
 }
 async function chat(){
  if(!ctx||!question.trim()) return;
  setBusy(true);setReply('');
  try {const r=await ctx.completion({prompt:'Kamu NPC ramah di game simulasi kehidupan Rumah Mungil. Jawab singkat dalam bahasa Indonesia.\nPemain: '+question.trim()+'\nNPC:',n_predict:128,temperature:0.7});setReply(r.text?.trim()||'NPC tidak menjawab.');}
  catch(e){Alert.alert('Kesalahan NPC',String(e?.message||e));}
  finally{setBusy(false);}
 }
 return <SafeAreaView style={s.root}>
  <StatusBar backgroundColor="#24352b" barStyle="light-content"/>
  <View style={s.head}><Text style={s.title}>Rumah Mungil</Text><Text style={s.status}>{status}</Text><TouchableOpacity style={s.btn} onPress={loadModel} disabled={busy}><Text style={s.btnText}>{busy?'Memproses…':'Pilih model GGUF'}</Text></TouchableOpacity></View>
  <View style={s.game}><WebView source={{uri:'file:///android_asset/index.html'}} javaScriptEnabled domStorageEnabled allowFileAccess originWhitelist={['*']}/></View>
  <View style={s.chat}><Text style={s.label}>NPC AI lokal</Text><View style={s.row}><TextInput style={s.input} value={question} onChangeText={setQuestion} placeholder="Ngobrol dengan NPC…" placeholderTextColor="#666"/><TouchableOpacity style={s.btn} onPress={chat} disabled={busy||!ctx}><Text style={s.btnText}>Kirim</Text></TouchableOpacity></View>{busy?<ActivityIndicator/>:null}{reply?<Text style={s.reply}>{reply}</Text>:null}</View>
 </SafeAreaView>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#f5f1e6'},head:{backgroundColor:'#24352b',padding:12},title:{fontSize:20,fontWeight:'bold',color:'#fff'},status:{color:'#fff',marginVertical:6},btn:{backgroundColor:'#365c43',padding:10,borderRadius:8,alignItems:'center'},btnText:{color:'#fff',fontWeight:'bold'},game:{flex:1},chat:{padding:10,backgroundColor:'#e5e0d2'},label:{fontWeight:'bold',marginBottom:6},row:{flexDirection:'row',gap:8},input:{flex:1,backgroundColor:'#fff',borderRadius:8,paddingHorizontal:10},reply:{marginTop:8,color:'#222'}});
