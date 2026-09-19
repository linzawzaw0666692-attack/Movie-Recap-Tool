// Vercel Serverless Function — Edge TTS
// https://your-app.vercel.app/api/tts

const { EdgeTTS } = require('edge-tts-api');

const VOICE_MAP = {
  thiha: 'my-MM-ThihaNeural',
  nilar: 'my-MM-NilarNeural'
};

const RATE = '+30%'; // 1.3x speed

function srtTime(seconds) {
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  const ms = String(Math.floor((seconds % 1) * 1000)).padStart(3, '0');
  return `${h}:${m}:${s},${ms}`;
}

function buildSrt(segments) {
  let srt = '';
  let index = 1;
  for (const seg of segments) {
    srt += `${index}\n${srtTime(seg.start)} --> ${srtTime(seg.end)}\n${seg.text}\n\n`;
    index++;
  }
  return srt;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    const { text, voice } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'စာသား ထည့်ပါ' });
    }

    const voiceName = VOICE_MAP[voice] || VOICE_MAP.thiha;

    // စာကြောင်းခွဲ
    const lines = text
      .split(/(?<=[။!?\n])/g)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length === 0) {
      return res.status(400).json({ error: 'စာကြောင်း မရှိပါ' });
    }

    const audioBuffers = [];
    const segments = [];
    let currentTime = 0;

    for (const line of lines) {
      const tts = new EdgeTTS(line, voiceName, {
        rate: RATE,
        pitch: '+0Hz',
        volume: '+0%'
      });

      const { audio, subtitle } = await tts.synthesize();
      audioBuffers.push(Buffer.from(audio));

      let duration = 0;
      if (subtitle && subtitle.length > 0) {
        const last = subtitle[subtitle.length - 1];
        const first = subtitle[0];
        duration = (last.offset + last.duration - first.offset) / 10000000;
      } else {
        duration = Math.max(line.length / 5, 1);
      }

      segments.push({
        start: currentTime,
        end: currentTime + duration,
        text: line
      });
      currentTime += duration;
    }

    const finalAudio = Buffer.concat(audioBuffers);
    const srt = buildSrt(segments);

    res.status(200).json({
      audio: finalAudio.toString('base64'),
      srt: srt,
      audioMime: 'audio/mpeg',
      duration: currentTime
    });

  } catch (err) {
    console.error('TTS Error:', err);
    res.status(500).json({ error: err.message || 'အသံထုတ်ခြင်း မအောင်မြင်ပါ' });
  }
};
