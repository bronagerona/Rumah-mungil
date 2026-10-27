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
      setStatus('Model lokal siap · Gerakan Sari otomatis · Gemma untuk dialog');
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
    // Gemma hanya membuat dialog; keputusan dan gerakan Sari ditangani sistem game.
    if (message?.type !== 'sari_dialogue_request') return;
    if (inferenceRef.current) {
      sendDecision({kind: 'busy'});
      return;
    }
    if (!ctx) {
      sendDecision({kind: 'dialogue', dialogue: ''});
      return;
    }

    inferenceRef.current = true;
    try {
      const context = message.context || {};
      const prompt =
        'Kamu adalah Gemma, penulis ucapan Sari dalam game simulasi kehidupan Rumah Mungil. ' +
        'Tulis ucapan bahasa Indonesia sehari-hari yang alami, hangat, singkat, dan sesuai situasi. ' +
        'Maksimal satu kalimat, satu baris, paling banyak 100 karakter. ' +
        'Jangan menjelaskan proses berpikir, jangan menambahkan label pembicara, jangan memakai markdown, dan jangan menyalin mentah petunjuk situasi. ' +
        'Kamu hanya menulis dialog: jangan memilih aksi, mengendalikan gerakan, atau mengubah keadaan game. ' +
        'Balas hanya JSON valid dengan format {"dialogue":"ucapan singkat"}.\\nKONDISI: ' + JSON.stringify(context);
      const result = await ctx.completion({
        prompt,
        n_predict: 64,
        temperature: 0.45,
      });
      const raw = String(result?.text || '');
      const startJson = raw.indexOf('{');
      const endJson = raw.lastIndexOf('}');
      if (startJson < 0 || endJson <= startJson) throw new Error('Respons AI bukan JSON.');
      const parsed = JSON.parse(raw.slice(startJson, endJson + 1));
      const dialogue = typeof parsed.dialogue === 'string'
        ? parsed.dialogue.replace(/[\\r\\n]+/g, ' ').trim().slice(0, 100)
        : '';
      sendDecision({kind: 'dialogue', dialogue});
    } catch (e) {
      sendDecision({kind: 'dialogue', dialogue: ''});
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
