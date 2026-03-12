import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Activity } from 'lucide-react';

export function PitchTuner() {
  const [isListening, setIsListening] = useState(false);
  const [note, setNote] = useState<string>('--');
  const [frequency, setFrequency] = useState<number>(0);
  const [cents, setCents] = useState<number>(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const requestRef = useRef<number | null>(null);

  const noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  const getNote = (frequency: number) => {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
  };

  const getFrequencyFromNote = (note: number) => {
    return 440 * Math.pow(2, (note - 69) / 12);
  };

  const getCents = (frequency: number, note: number) => {
    return Math.floor(1200 * Math.log(frequency / getFrequencyFromNote(note)) / Math.log(2));
  };

  const autoCorrelate = (buf: Float32Array, sampleRate: number) => {
    // Implements the ACF2+ algorithm
    let SIZE = buf.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      const val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) // not enough signal
      return -1;

    let r1 = 0, r2 = SIZE - 1, thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++)
      if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++)
      if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

    buf = buf.slice(r1, r2);
    SIZE = buf.length;

    const c = new Array(SIZE).fill(0);
    for (let i = 0; i < SIZE; i++)
      for (let j = 0; j < SIZE - i; j++)
        c[i] = c[i] + buf[j] * buf[j + i];

    let d = 0; while (c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < SIZE; i++) {
      if (c[i] > maxval) {
        maxval = c[i];
        maxpos = i;
      }
    }
    let T0 = maxpos;

    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) T0 = T0 - b / (2 * a);

    return sampleRate / T0;
  };

  const updatePitch = () => {
    if (!analyserRef.current || !audioContextRef.current) return;
    
    const bufferLength = 2048;
    const buffer = new Float32Array(bufferLength);
    analyserRef.current.getFloatTimeDomainData(buffer);
    
    const ac = autoCorrelate(buffer, audioContextRef.current.sampleRate);

    if (ac !== -1) {
      const pitch = ac;
      const noteNum = getNote(pitch);
      const noteName = noteStrings[noteNum % 12];
      const octave = Math.floor(noteNum / 12) - 1;
      const detune = getCents(pitch, noteNum);
      
      setFrequency(Math.round(pitch));
      setNote(`${noteName}${octave}`);
      setCents(detune);
    }

    requestRef.current = requestAnimationFrame(updatePitch);
  };

  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      
      sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      sourceRef.current.connect(analyserRef.current);
      
      setIsListening(true);
      updatePitch();
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("마이크 접근 권한이 필요합니다.");
    }
  };

  const stopListening = () => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    if (sourceRef.current) sourceRef.current.disconnect();
    if (analyserRef.current) analyserRef.current.disconnect();
    if (audioContextRef.current) audioContextRef.current.close();
    
    setIsListening(false);
    setNote('--');
    setFrequency(0);
    setCents(0);
  };

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  return (
    <div className="w-full bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[400px]">
      <div className="relative w-64 h-64 mb-8 flex items-center justify-center">
        {/* Outer Ring */}
        <div className="absolute inset-0 rounded-full border-4 border-neutral-800"></div>
        
        {/* Cent Indicator */}
        <div 
            className="absolute top-0 w-1 h-4 bg-emerald-500 left-1/2 -translate-x-1/2 transition-transform duration-100 origin-bottom"
            style={{ 
                height: '100%', 
                background: 'transparent',
                transform: `rotate(${cents * 1.8}deg)` // Map -50..50 cents to -90..90 degrees
            }}
        >
            <div className={`w-1.5 h-6 mx-auto rounded-full ${Math.abs(cents) < 5 ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 'bg-neutral-600'}`}></div>
        </div>

        {/* Center Display */}
        <div className="flex flex-col items-center z-10">
            <span className={`text-6xl font-bold tracking-tighter mb-2 ${isListening && Math.abs(cents) < 5 ? 'text-emerald-400' : 'text-white'}`}>
                {note}
            </span>
            <span className="text-neutral-500 font-mono text-lg">
                {frequency > 0 ? `${frequency} Hz` : '-- Hz'}
            </span>
        </div>
        
        {/* Scale Markers */}
        <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-[10px] text-neutral-600 font-medium">0</div>
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[10px] text-neutral-600 font-medium">-50</div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-neutral-600 font-medium">+50</div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2 mb-4">
            <div className={`w-2 h-2 rounded-full ${Math.abs(cents) < 5 && frequency > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-800'}`}></div>
            <span className={`text-xs font-medium ${Math.abs(cents) < 5 && frequency > 0 ? 'text-emerald-500' : 'text-neutral-600'}`}>
                {Math.abs(cents) < 5 && frequency > 0 ? 'IN TUNE' : 'TUNING...'}
            </span>
        </div>

        <button
            onClick={isListening ? stopListening : startListening}
            className={`flex items-center gap-3 px-8 py-4 rounded-full transition-all duration-300 ${
                isListening 
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/50' 
                : 'bg-white text-black hover:bg-neutral-200 border border-transparent shadow-[0_0_20px_rgba(255,255,255,0.1)]'
            }`}
        >
            {isListening ? (
                <>
                    <MicOff size={20} />
                    <span className="font-bold tracking-wide text-sm">STOP LISTENING</span>
                </>
            ) : (
                <>
                    <Mic size={20} />
                    <span className="font-bold tracking-wide text-sm">START TUNER</span>
                </>
            )}
        </button>
      </div>
    </div>
  );
}
