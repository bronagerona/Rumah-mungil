import React, {useEffect, useRef, useState} from 'react';
import {SafeAreaView, StatusBar, Text, View, TouchableOpacity, ActivityIndicator, Alert, StyleSheet} from 'react-native';
import {pick, types, keepLocalCopy} from '@react-native-documents/picker';
import {WebView} from 'react-native-webview';
import {initLlama} from 'llama.rn';

export default function App() {
  const [ctx, setCtx] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Pilih model model lokal 3 1B (.gguf). Game baru dibuka setelah AI lolos tes.');
  const webRef = useRef(null);
  const inferenceRef = useRef(false);
  const ctxRef = useRef(null);

  useEffect(() => () => {
    if (ctxRef.current?.release) ctxRef.current.release();
  }, []);

  async function loadModel() {
    if (inferenceRef.current) {
      Alert.alert('AI sedang berpikir', 'Tunggu Sari menyelesaikan keputusan sebelum mengganti model.');
      return;
    }
    let next = null;
    try {
      setBusy(true);
      const picked = await pick({type: [types.allFiles]});
      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file?.name?.toLowerCase().endsWith('.gguf')) {
        Alert.alert('Format model salah', 'Pilih file model dengan ekstensi .gguf.');
        return;
      }
      setStatus('Menyalin model ke penyimpanan aplikasi…');
      const copies = await keepLocalCopy({
        files: [{uri: file.uri, fileName: file.name}],
        destination: 'cachesDirectory',
      });
      const localCopy = copies?.[0];
      if (localCopy?.status !== 'success' || !localCopy.localUri) {
        throw new Error(localCopy?.copyError || 'Tidak bisa menyalin file model ke penyimpanan aplikasi.');
      }
      setStatus('Menyiapkan model lokal di HP…');
      if (ctxRef.current?.release) {
        await ctxRef.current.release();
        ctxRef.current = null;
      }
      setCtx(null);
      setReady(false);
      next = await initLlama({
        model: localCopy.localUri,
        n_ctx: 2048,
        n_threads: 4,
        n_gpu_layers: 0,
        use_mmap: true,
      });
      setStatus('Menguji inferensi lokal…');
      const probe = await next.completion({
        prompt: 'Balas tepat satu kata: SIAP',
        n_predict: 12,
        temperature: 0,
      });
      if (!probe?.text?.trim()) throw new Error('Model tidak menghasilkan respons pada tes awal.');
      ctxRef.current = next;
      setCtx(next);
      next = null;
      setReady(true);
      setStatus('model lokal siap · Sari dikendalikan AI lokal · Budi dikendalikan pemain');
    } catch (e) {
      const code = String(e?.code || '').toLowerCase();
      if (code.includes('cancel')) {
        setStatus(ready ? 'model lokal tetap aktif.' : 'Pemilihan model dibatalkan. Pilih file .gguf untuk melanjutkan.');
      } else {
        setStatus('Model belum siap. Periksa file .gguf dan coba lagi.');
        Alert.alert('model lokal belum siap', String(e?.message || e));
      }
    } finally {
      if (next?.release) {
        try { await next.release(); } catch (_) {}
      }
      setBusy(false);
    }
  }

  function sendDecision(result) {
    const js = 'window.__receiveSariAI(' + JSON.stringify(result) + '); true;';
    webRef.current?.injectJavaScript(js);
  }

  async function onGameMessage(event) {
    let message;
    try { message = JSON.parse(event.nativeEvent.data); } catch (_) { return; }
    if (message?.type !== 'sari_decision_request' && message?.type !== 'sari_dialogue_request') return;
    const dialogueOnly = message.type === 'sari_dialogue_request';
    if (!ctx || inferenceRef.current) {
      sendDecision(dialogueOnly
        ? {kind: 'dialogue', dialogue: ''}
        : {kind: 'decision', action: null, dialogue: ''});
      return;
    }

    inferenceRef.current = true;
    try {
      const context = message.context || {};
      const common =
        'Kamu adalah Gemma, penulis ucapan Sari dalam game simulasi kehidupan Rumah Mungil. ' +
        'Tulis ucapan yang terdengar alami, hangat, singkat, dan sesuai kepribadian serta situasi Sari. ' +
        'Gunakan bahasa Indonesia sehari-hari. Maksimal satu kalimat dan satu baris, paling banyak 100 karakter. ' +
        'Jangan menjelaskan proses berpikir, jangan menambahkan label pembicara, jangan memakai markdown, dan jangan menyalin mentah petunjuk situasi. ' +
        'Petunjuk situasi hanya konteks, bukan teks yang harus diulang. ';
      const prompt = dialogueOnly
        ? common +
          'Tugas: hasilkan hanya ucapan Sari untuk situasi ini. Balas hanya JSON valid dengan format {"dialogue":"ucapan singkat"}. ' +
          'Jangan membuat aksi atau mengubah keadaan game.\nKONDISI: ' + JSON.stringify(context)
        : common +
          'Budi dikendalikan pemain; jangan mengambil alih Budi. Pilih tepat satu aksi dari daftar opsi yang diberikan, dengan mempertimbangkan kebutuhan, uang, waktu, lokasi, hubungan, dan permintaan Budi. ' +
          'Jangan mengarang aksi di luar daftar. Sertakan satu ucapan Sari yang cocok dengan situasi dan aksi yang dipilih. ' +
          'Balas hanya JSON valid dengan format {"action":"KUNCI_OPSI","dialogue":"ucapan singkat"}.\nKONDISI: ' + JSON.stringify(context);
      const result = await ctx.completion({
        prompt,
        n_predict: dialogueOnly ? 64 : 80,
        temperature: 0.45,
      });
      const raw = String(result?.text || '');
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start < 0 || end <= start) throw new Error('Respons AI bukan JSON.');
      const parsed = JSON.parse(raw.slice(start, end + 1));
      const dialogue = typeof parsed.dialogue === 'string'
        ? parsed.dialogue.replace(/[\r\n]+/g, ' ').trim().slice(0, 100)
        : '';
      if (dialogueOnly) {
        sendDecision({kind: 'dialogue', dialogue});
      } else {
        const options = Array.isArray(context.options) ? context.options : [];
        const action = options.some(item => item.key === parsed.action) ? parsed.action : null;
        sendDecision({kind: 'decision', action, dialogue});
      }
    } catch (e) {
      sendDecision(dialogueOnly
        ? {kind: 'dialogue', dialogue: ''}
        : {kind: 'decision', action: null, dialogue: ''});
    } finally {
      inferenceRef.current = false;
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar backgroundColor="#24352b" barStyle="light-content" />
      <View style={styles.head}>
        <Text style={styles.title}>Rumah Mungil</Text>
        <Text style={styles.status}>{status}</Text>
        <TouchableOpacity style={styles.btn} onPress={loadModel} disabled={busy}>
          <Text style={styles.btnText}>{busy ? 'Memproses model…' : ready ? 'Ganti model GGUF' : 'Pilih model GGUF'}</Text>
        </TouchableOpacity>
      </View>
      {ready ? (
        <WebView
          ref={webRef}
          style={styles.game}
          source={{uri: 'file:///android_asset/index.html'}}
          javaScriptEnabled
          domStorageEnabled
          allowFileAccess
          originWhitelist={['*']}
          onMessage={onGameMessage}
          onLoadEnd={() => webRef.current?.injectJavaScript('window.__sariAIReady=true; true;')}
        />
      ) : (
        <View style={styles.loader}>
          {busy ? <ActivityIndicator size="large" color="#365c43" /> : <Text style={styles.emoji}>🏡</Text>}
          <Text style={styles.loaderTitle}>{busy ? 'Menyiapkan teman serumah…' : 'Siapkan AI Sari'}</Text>
          <Text style={styles.loaderText}>Pilih model model lokal 3 1B GGUF yang tersimpan di HP. Game hanya dibuka setelah model berhasil dimuat dan memberi respons tes. Model tidak dibundel ke APK.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#f5f1e6'},
  head: {backgroundColor: '#24352b', padding: 12},
  title: {fontSize: 20, fontWeight: 'bold', color: '#fff'},
  status: {color: '#fff', marginVertical: 6},
  btn: {backgroundColor: '#365c43', padding: 10, borderRadius: 8, alignItems: 'center'},
  btnText: {color: '#fff', fontWeight: 'bold'},
  game: {flex: 1},
  loader: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28},
  emoji: {fontSize: 48, marginBottom: 12},
  loaderTitle: {fontSize: 20, fontWeight: 'bold', color: '#24352b', marginBottom: 10},
  loaderText: {textAlign: 'center', color: '#4f5b51', lineHeight: 22},
});
