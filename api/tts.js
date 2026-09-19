// ============ Voice Generation (Vercel Serverless Backend) ============
async function generateVoice() {
  const text = sourceText.value.trim();

  if (!text) {
    setStatus('⚠️ အသံထုတ်ရန် စာသား ထည့်ပါ', 'error');
    sourceText.focus();
    return;
  }

  const voiceBtn = document.getElementById('voiceBtn');
  voiceBtn.disabled = true;
  setStatus('<span class="spinner"></span> အသံထုတ်နေသည်... (ခဏစောင့်ပါ)', 'loading');
  resultText.value = '';
  document.getElementById('audioResult').classList.remove('visible');

  // ရှေးဟောင်း audio ရပ်
  if (audioData.url) {
    URL.revokeObjectURL(audioData.url);
    audioData.url = null;
  }
  audioData.base64 = null;
  audioData.srt = null;
  audioData.blob = null;

  try {
    const response = await fetch(TTS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        voice: selectedVoice
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.audio) throw new Error('အသံဖိုင် မရရှိပါ');

    // Base64 → Blob
    audioData.base64 = data.audio;
    audioData.srt = data.srt || generateSrtFromText(text);
    audioData.blob = base64ToBlob(data.audio, 'audio/mpeg');

    // SRT preview
    resultText.value = audioData.srt;
    resultCount.textContent = audioData.srt.length + ' လုံး';

    // Audio player
    audioData.url = URL.createObjectURL(audioData.blob);
    const player = document.getElementById('audioPlayer');
    player.src = audioData.url;
    player.style.display = 'block';
    player.playbackRate = 1.3;
    player.addEventListener('loadedmetadata', () => {
      player.playbackRate = 1.3;
    });

    document.getElementById('audioResult').classList.add('visible');

    // MP3 download button ဖွင့်
    const mp3Btn = document.getElementById('downloadMp3Btn');
    if (mp3Btn) mp3Btn.disabled = false;

    setStatus('✅ အသံထုတ်ပြီးပါပြီ · MP3 + SRT အဆင်သင့် · Speed 1.3x', 'success');

  } catch (error) {
    console.error('TTS Error:', error);
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      setStatus('❌ Backend server မရနိုင်ပါ။ Vercel deploy စစ်ပါ။', 'error');
    } else {
      setStatus('❌ Error: ' + error.message, 'error');
    }
  } finally {
    voiceBtn.disabled = false;
  }
}
