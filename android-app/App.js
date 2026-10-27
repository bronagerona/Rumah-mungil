import React, {useRef, useState} from 'react';
import {
  SafeAreaView,
  StatusBar,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native';
import {WebView} from 'react-native-webview';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'openai/gpt-oss-20b';

export default function App() {
  const [keyInput, setKeyInput] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [gameVisible, setGameVisible] = useState(false);
  const [status, setStatus] = useState('Masukkan API key Groq untuk memulai.');
  const webRef = useRef(null);

  function sendDecision(result) {
    const js = 'window.__receiveSariAI(' + JSON.stringify(result) + '); true;';
    webRef.current?.injectJavaScript?.(js);
  }

  async function onGameMessage(event) {
    let message;
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch (_) {
      return;
    }
    if (message?.type !== 'sari_decision_request' && message?.type !== 'sari_dialogue_request') return;

    const dialogueOnly = message.type === 'sari_dialogue_request';
    const context = message.context || {};
    if (!apiKey) {
      sendDecision(dialogueOnly
        ? {kind: 'dialogue', dialogue: ''}
        : {kind: 'decision', action: null, dialogue: ''});
      setStatus('API key Groq belum diisi.');
      return;
    }

    setStatus('Sari sedang berpikir lewat Groq…');
    try {
      const system = [
        'Kamu adalah Sari, teman serumah Budi dalam game simulasi kehidupan Rumah Mungil.',
        'Balas dengan bahasa Indonesia yang benar, alami, hangat, dan mudah dipahami.',
        'Tulis satu kalimat utuh yang relevan dengan kondisi game dan riwayat percakapan.',
        'Jangan mengeluarkan kata acak, suku kata, kalimat terputus, atau teks setengah jadi.',
        'Ucapan maksimal 80 karakter. Gunakan ejaan dan tata bahasa Indonesia yang wajar.',
        'Jangan mengarang fakta, jangan mengambil alih Budi, dan jangan memakai markdown.',
        dialogueOnly
          ? 'Keluarkan hanya objek JSON valid dengan format {"dialogue":"kalimat utuh dalam bahasa Indonesia"}.'
          : 'Pilih satu aksi yang persis cocok dengan salah satu context.options[].key. Keluarkan hanya objek JSON valid dengan format {"action":"KEY_AKSI","dialogue":"kalimat utuh dalam bahasa Indonesia"}.'
      ].join(' ');
      const response = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            {role: 'system', content: system},
            {role: 'user', content: 'KONDISI GAME DAN RIWAYAT: ' + JSON.stringify(context) + '\nBuat ucapan Sari yang wajar dan lengkap. Jangan menyalin kata-kata dari instruksi.'},
          ],
          response_format: {type: 'json_object'},
          reasoning_effort: 'low',
          reasoning_format: 'hidden',
          max_completion_tokens: dialogueOnly ? 256 : 320,
          temperature: 0.2,
          stream: false,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = data?.error?.message || ('HTTP ' + response.status);
        throw new Error(detail);
      }
      const raw = String(data?.choices?.[0]?.message?.content || '');
      const startJson = raw.indexOf('{');
      const endJson = raw.lastIndexOf('}');
      if (startJson < 0 || endJson <= startJson) throw new Error('Respons AI bukan JSON lengkap.');
      const parsed = JSON.parse(raw.slice(startJson, endJson + 1));
      let dialogue = typeof parsed.dialogue === 'string'
        ? parsed.dialogue.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
        : '';
      // Hindari menampilkan keluaran yang tampak seperti potongan kalimat atau kata acak.
      if (dialogue.length > 80) dialogue = dialogue.slice(0, 80).replace(/\s+\S*$/, '').trim();
      if (dialogue && !/[.!?…😊🙂😄❤️]$/.test(dialogue)) dialogue += '.';
      if (dialogue && (dialogue.split(/\s+/).length < 2 || !/[a-zA-ZÀ-ÿ]/.test(dialogue))) dialogue = '';
      if (dialogueOnly) {
        sendDecision({kind: 'dialogue', dialogue});
      } else {
        const options = Array.isArray(context.options) ? context.options : [];
        const action = options.some(item => item.key === parsed.action) ? parsed.action : null;
        sendDecision({kind: 'decision', action, dialogue});
      }
      setStatus('Sari aktif · AI cloud Groq · Budi dikendalikan pemain');
    } catch (error) {
      const detail = String(error?.message || 'Gagal menghubungi Groq').slice(0, 100);
      setStatus('Groq: ' + detail);
      sendDecision(dialogueOnly
        ? {kind: 'dialogue', dialogue: ''}
        : {kind: 'decision', action: null, dialogue: ''});
    }
  }

  function activateKey() {
    const key = keyInput.trim();
    if (!key) {
      setStatus('Masukkan API key Groq terlebih dahulu.');
      return;
    }
    setApiKey(key);
    setGameVisible(true);
    setStatus('Terhubung ke AI cloud Groq.');
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar backgroundColor="#24352b" barStyle="light-content" />
      <View style={styles.head}>
        <Text style={styles.title}>Rumah Mungil · AI Cloud</Text>
        <Text style={styles.status}>{status}</Text>
        {gameVisible ? (
          <TouchableOpacity
            style={styles.btn}
            onPress={() => {
              setKeyInput(apiKey);
              setGameVisible(false);
              setStatus('API key hanya disimpan sementara selama aplikasi terbuka.');
            }}>
            <Text style={styles.btnText}>Ganti API key Groq</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.keyPanel}>
            <Text style={styles.help}>
              Buat API key di console.groq.com. Key tidak ditanam di APK dan tidak disimpan permanen oleh aplikasi ini.
            </Text>
            <TextInput
              style={styles.input}
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder="Tempel API key Groq"
              placeholderTextColor="#778078"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              textContentType="password"
              accessibilityLabel="API key Groq"
            />
            <TouchableOpacity style={styles.btn} onPress={activateKey}>
              <Text style={styles.btnText}>Hubungkan dan mulai game</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      {gameVisible ? (
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
          <Text style={styles.emoji}>☁️</Text>
          <Text style={styles.loaderTitle}>Sari memakai AI cloud</Text>
          <Text style={styles.loaderText}>
            Game memerlukan internet dan API key Groq. API key hanya berada di memori aplikasi selama sesi ini; masukkan key milikmu sendiri dan jangan bagikan kepada orang lain.
          </Text>
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
  keyPanel: {gap: 10},
  help: {color: '#fff', lineHeight: 20},
  input: {backgroundColor: '#fff', color: '#18221b', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10},
  btn: {backgroundColor: '#365c43', padding: 10, borderRadius: 8, alignItems: 'center'},
  btnText: {color: '#fff', fontWeight: 'bold'},
  game: {flex: 1},
  loader: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28},
  emoji: {fontSize: 48, marginBottom: 12},
  loaderTitle: {fontSize: 20, fontWeight: 'bold', color: '#24352b', marginBottom: 10},
  loaderText: {textAlign: 'center', color: '#4f5b51', lineHeight: 22},
});
