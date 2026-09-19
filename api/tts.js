const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const VOICES = {
  thiha: 'my-MM-ThihaNeural',
  nilar: 'my-MM-NilarNeural'
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { text, voice } = req.body || {};
    if (!text) return res.status(400).json({ error: 'No text provided' });

    const voiceName = VOICES[voice] || VOICES.thiha;
    const result = await edgeTTS(text, voiceName);
    return res.status(200).json(result);
  } catch (e) {
    console.error('TTS Error:', e);
    return res.status(500).json({ error: e.message });
  }
};

async function edgeTTS(text, voiceName) {
  const { WebSocket } = require('ws');
  const crypto = require('crypto');

  const secMsGec = generateSecMsGec(crypto);
  const connectionId = crypto.randomUUID().replace(/-/g, '');
  const requestId = crypto.randomUUID().replace(/-/g, '');

  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-130.0.2849.68&ConnectionId=${connectionId}`;

  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='my-MM'>
    <voice name='${voiceName}'>
      <prosody rate='+30%' pitch='+0Hz'>${escapeXml(text)}</prosody>
    </voice>
  </speak>`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const audioChunks = [];
    const srtLines = [];
    let srtIndex = 1;

    const timeout = setTimeout(() => {
      try { ws.close(); } catch (e) {}
      reject(new Error('TTS timeout'));
    }, 30000);

    ws.on('open', () => {
      const configMsg = `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"true","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
      ws.send(configMsg);

      const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toString()}Z\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buf = Buffer.from(data);
        const headerLen = buf.readUInt16BE(0);
        const audio = buf.slice(2 + headerLen);
        if (audio.length > 0) audioChunks.push(audio);
      } else {
        const msg = data.toString();

        if (msg.includes('Path:audio.metadata')) {
          try {
            const jsonStart = msg.indexOf('{');
            const meta = JSON.parse(msg.substring(jsonStart));
            if (meta.Metadata) {
              meta.Metadata.forEach(m => {
                if (m.Type === 'SentenceBoundary' && m.Data) {
                  const offsetSec = m.Data.Offset / 10000000;
                  const durationSec = m.Data.Duration / 10000000;
                  const textVal = m.Data.text?.Text || m.Data.text || '';
                  if (textVal) {
                    srtLines.push({
                      index: srtIndex++,
                      start: offsetSec,
                      end: offsetSec + durationSec,
                      text: textVal
                    });
                  }
                }
              });
            }
          } catch (e) {}
        }

        if (msg.includes('Path:turn.end')) {
          clearTimeout(timeout);
          ws.close();

          const merged = Buffer.concat(audioChunks);
          resolve({
            audio: merged.toString('base64'),
            srt: srtLines.length > 0 ? formatSrt(srtLines) : null
          });
        }
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', () => clearTimeout(timeout));
  });
}

function generateSecMsGec(crypto) {
  const WIN_EPOCH = 11644473600n;
  const S_TO_NS = 10000000n;
  let ticks = BigInt(Math.floor(Date.now() / 1000)) + WIN_EPOCH;
  ticks = ticks * S_TO_NS;
  const rounded = (ticks / (300n * S_TO_NS)) * (300n * S_TO_NS);
  const str = rounded.toString() + TRUSTED_CLIENT_TOKEN;
  return crypto.createHash('sha256').update(str).digest('hex').toUpperCase();
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
}

function formatSrt(lines) {
  return lines.map(l =>
    `${l.index}\n${fmt(l.start)} --> ${fmt(l.end)}\n${l.text}\n`
  ).join('\n');
}

function fmt(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(ms)}`;
}

function pad(n) { return String(n).padStart(2, '0'); }
function pad3(n) { return String(n).padStart(3, '0'); }
