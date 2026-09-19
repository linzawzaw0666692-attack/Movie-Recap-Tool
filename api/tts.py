from http.server import BaseHTTPRequestHandler
import json
import asyncio
import edge_tts
import base64
import re

VOICE_MAP = {
    "thiha": "my-MM-ThihaNeural",
    "nilar": "my-MM-NilarNeural"
}
RATE = "+30%"

def srt_time(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

async def synth_line(text, voice):
    communicate = edge_tts.Communicate(text, voice, rate=RATE)
    audio = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
    return audio

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
            voice = VOICE_MAP.get(voice_key, VOICE_MAP["thiha"])
            
            if not text:
                self._json_response(400, {"error": "စာသား ထည့်ပါ"})
                return
            
            lines = [l.strip() for l in re.split(r'(?<=[။!?\n])', text) if l.strip()]
            
            if not lines:
                self._json_response(400, {"error": "စာကြောင်း မရှိပါ"})
                return
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            audio_all = b""
            segments = []
            current = 0
            
            for line in lines:
                audio = loop.run_until_complete(synth_line(line, voice))
                audio_all += audio
                char_count = len(line.replace(" ", ""))
                duration = max(char_count / 6.5, 1.2)
                segments.append({"start": current, "end": current + duration, "text": line})
                current += duration
            
            loop.close()
            
            srt = ""
            for i, seg in enumerate(segments, 1):
                srt += f"{i}\n{srt_time(seg['start'])} --> {srt_time(seg['end'])}\n{seg['text']}\n\n"
            
            self._json_response(200, {
                "audio": base64.b64encode(audio_all).decode(),
                "srt": srt,
                "duration": current
            })
        
        except Exception as e:
            self._json_response(500, {"error": str(e)})
    
    def _json_response(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode('utf-8'))
