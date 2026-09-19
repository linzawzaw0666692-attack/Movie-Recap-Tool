from http.server import BaseHTTPRequestHandler
import json
import base64
import re
import io
from gtts import gTTS

# gTTS မှာ my (Myanmar) language support ရှိသည်
LANG_MAP = {
    "thiha": "my",   # မြန်မာ (gTTS က gender မခွဲပါ)
    "nilar": "my"
}

def srt_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('content-length', 0))
            body = json.loads(self.rfile.read(length))
            
            text = body.get("text", "").strip()
            voice_key = body.get("voice", "thiha")
            lang = LANG_MAP.get(voice_key, "my")
            
            if not text:
                self._json_response(400, {"error": "စာသား ထည့်ပါ"})
                return
            
            lines = [l.strip() for l in re.split(r'(?<=[။!?\n])', text) if l.strip()]
            
            if not lines:
                self._json_response(400, {"error": "စာကြောင်း မရှိပါ"})
                return
            
            audio_all = io.BytesIO()
            segments = []
            current = 0
            
            for line in lines:
                # gTTS က slow=False → ပုံမှန် speed
                # Fast vibe အတွက် frontend မှာ audio playback rate ချိန်
                tts = gTTS(text=line, lang=lang, slow=False)
                buf = io.BytesIO()
                tts.write_to_fp(buf)
                buf.seek(0)
                audio_all.write(buf.read())
                
                # Duration ခန့်မှန်း
                char_count = len(line.replace(" ", ""))
                duration = max(char_count / 6.0, 1.2)
                
                segments.append({
                    "start": current,
                    "end": current + duration,
                    "text": line
                })
                current += duration
            
            srt = ""
            for i, seg in enumerate(segments, 1):
                srt += f"{i}\n{srt_time(seg['start'])} --> {srt_time(seg['end'])}\n{seg['text']}\n\n"
            
            audio_bytes = audio_all.getvalue()
            
            self._json_response(200, {
                "audio": base64.b64encode(audio_bytes).decode(),
                "srt": srt,
                "duration": current,
                "speed": 1.3  # frontend က playback rate 1.3x သတ်မှတ်ရန်
            })
        
        except Exception as e:
            self._json_response(500, {"error": str(e)})
    
    def _json_response(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
