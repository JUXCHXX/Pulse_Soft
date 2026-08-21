import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Mic, Send, Loader2, Volume2, Keyboard } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function Asistente() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const hasSpeechRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, [recording]);

  async function sendToAssistant(text: string) {
    if (!text.trim() || loading) return;
    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/asistente-ia`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ text, history: messages }),
      });

      if (!response.ok) {
        throw new Error(`Error del servidor (${response.status})`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      const assistantMsg: ChatMessage = { role: 'assistant', content: data.text ?? 'Sin respuesta' };
      setMessages((prev) => [...prev, assistantMsg]);

      if (data.audio) {
        const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
        audio.play().catch(() => {});
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al conectar con el asistente');
    } finally {
      setLoading(false);
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      hasSpeechRef.current = false;
      silenceStartRef.current = null;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (audioChunksRef.current.length === 0) return;
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size < 1000) return;

        setLoading(true);
        try {
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const arrayBuffer = ev.target?.result as ArrayBuffer;
            const base64 = arrayBufferToBase64(arrayBuffer);

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const response = await fetch(`${supabaseUrl}/functions/v1/asistente-ia`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({ audio: base64, history: messages }),
            });

            if (!response.ok) throw new Error(`Error (${response.status})`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            const transcribed = data.transcribed_text ?? '';
            if (transcribed) {
              setMessages((prev) => [...prev, { role: 'user', content: transcribed }]);
            }
            const assistantMsg: ChatMessage = { role: 'assistant', content: data.text ?? 'Sin respuesta' };
            setMessages((prev) => [...prev, assistantMsg]);

            if (data.audio) {
              const audio = new Audio(`data:audio/wav;base64,${data.audio}`);
              audio.play().catch(() => {});
            }
          };
          reader.readAsArrayBuffer(audioBlob);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Error de voz');
        } finally {
          setLoading(false);
        }
      };

      // VAD setup
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkAudio = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setAudioLevel(Math.min(1, rms * 3));

        const threshold = 0.02;
        if (rms > threshold) {
          hasSpeechRef.current = true;
          silenceStartRef.current = null;
        } else if (hasSpeechRef.current) {
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current > 1800) {
            stopRecording();
            return;
          }
        }
        animationRef.current = requestAnimationFrame(checkAudio);
      };
      checkAudio();

      mediaRecorder.start();
      setRecording(true);
    } catch {
      setError('No se pudo acceder al micrófono. Verifica los permisos del navegador.');
    }
  }

  const bars = Array.from({ length: 5 }, (_, i) => {
    const base = recording ? audioLevel : 0;
    return Math.max(0.15, base * (1 - i * 0.15) + (recording ? Math.random() * 0.2 : 0));
  });

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-caribbean-green/10 flex items-center justify-center mx-auto mb-3">
          <Sparkles className="w-8 h-8 text-caribbean-green" />
        </div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Asistente IA</h2>
        <p className="text-sm text-[var(--text-secondary)]">Habla o escribe. El asistente consulta y ejecuta acciones en Pulsesoft.</p>
      </div>

      {error && (
        <div className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-center">
          {error}
        </div>
      )}

      {/* Chat */}
      <div className="card p-4 min-h-64 max-h-[50vh] overflow-y-auto space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--text-secondary)] mb-3">Prueba: "¿qué consultor está atrasado?" o "¿cómo va el proyecto X?"</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
                msg.role === 'user'
                  ? 'bg-[var(--accent)] text-[var(--text-on-dark)] rounded-br-sm'
                  : 'bg-[var(--bg-base)] text-[var(--text-primary)] rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[var(--bg-base)] px-4 py-2.5 rounded-2xl rounded-bl-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-[var(--accent)] animate-spin" />
              <span className="text-sm text-[var(--text-secondary)]">Pensando…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Mic button */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={loading}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all disabled:opacity-50 ${
            recording
              ? 'bg-danger/20 text-danger scale-110'
              : 'bg-caribbean-green/15 text-caribbean-green hover:bg-caribbean-green/25 hover:scale-105'
          }`}
        >
          {recording ? (
            <div className="flex items-end gap-0.5 h-8">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="w-1.5 bg-danger rounded-full transition-all"
                  style={{ height: `${h * 100}%`, minHeight: '4px' }}
                />
              ))}
            </div>
          ) : (
            <Mic className="w-8 h-8" strokeWidth={2} />
          )}
        </button>
        <p className="text-xs text-[var(--text-secondary)]">
          {recording ? 'Escuchando… (silencio para enviar)' : 'Presiona para hablar'}
        </p>
      </div>

      {/* Text input */}
      <form
        onSubmit={(e) => { e.preventDefault(); sendToAssistant(input); }}
        className="flex items-center gap-2"
      >
        <div className="relative flex-1">
          <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu mensaje…"
            className="input-field !pl-9"
            disabled={loading}
          />
        </div>
        <button type="submit" disabled={loading || !input.trim()} className="btn-primary w-11 h-11 flex items-center justify-center !p-0 disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}
