import React, {useEffect, useRef, useState} from 'react';
import {SafeAreaView, StatusBar, Text, View, TouchableOpacity, ActivityIndicator, Alert, StyleSheet} from 'react-native';
import {pick, types, keepLocalCopy} from '@react-native-documents/picker';
import {WebView} from 'react-native-webview';
import {initLlama} from 'llama.rn';

export default function App() {
  const [ctx, setCtx] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Pilih model Gemma 3 1B (.gguf). Game baru dibuka setelah AI lolos tes.');
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
      setStatus('Menyiapkan Gemma di HP…');
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
      setStatus('Gemma siap · Gemma membuat komentar Sari · gerak Sari diatur game');
    } catch (e) {
      const code = String(e?.code || '').toLowerCase();
      if (code.includes('cancel')) {
        setStatus(ready ? 'Gemma tetap aktif.' : 'Pemilihan model dibatalkan. Pilih file .gguf untuk melanjutkan.');
      } else {
        setStatus('Model belum siap. Periksa file .gguf dan coba lagi.');
        Alert.alert('Gemma belum siap', String(e?.message || e));
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
    if (message?.type !== 'sari_comment_request') return;
    if (!ctx || inferenceRef.current) {
      sendDecision({action: null, dialogue: ''});
      return;
    }

    inferenceRef.current = true;
    try {
      const context = message.context || {};
      const prompt =
        'Kamu adalah Sari, teman serumah dalam game simulasi kehidupan Rumah Mungil. ' +
        'Tugasmu HANYA mengucapkan satu komentar pendek dalam bahasa Indonesia berdasarkan kondisi yang diberikan. ' +
        'Komentar harus alami, terasa spontan, sesuai kebutuhan, aktivitas, waktu, dan kejadian saat ini. ' +
        'Buat variasi baru dan jangan mengulang komentar terbaru yang tercantum. Panjang 3 sampai 10 kata. ' +
        'Jangan memberi instruksi, jangan menyebut data atau angka kebutuhan, jangan mengarang kejadian, dan jangan memilih atau menyarankan aksi game. ' +
        'Balas hanya kalimat komentar, tanpa tanda kutip, label, JSON, atau penjelasan.\nKONDISI SARI: ' + JSON.stringify(context);
      const result = await ctx.completion({
        prompt,
        n_predict: 40,
        temperature: 0.85,
        top_p: 0.9,
      });
      const raw = String(result?.text || '').trim();
      const line = raw.split(/\\n|[.!?](?:\\s|$)/)[0].replace(/^["'“”*\s]+|["'“”*\s]+$/g, '').trim();
      sendDecision({dialogue: line.slice(0, 90)});
    } catch (e) {
      sendDecision({action: null, dialogue: ''});
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
          <Text style={styles.loaderText}>Pilih model Gemma 3 1B GGUF yang tersimpan di HP. Game hanya dibuka setelah model berhasil dimuat dan memberi respons tes. Model tidak dibundel ke APK.</Text>
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
