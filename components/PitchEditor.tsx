import React, { useState, useRef, useEffect } from 'react';
import * as Tone from 'tone';
import { Play, Pause, Upload, Loader2, Music, Settings2, RefreshCw, Wand2 } from 'lucide-react';

// Scale Definitions
const SCALES = {
    'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Pentatonic Major': [0, 2, 4, 7, 9],
    'Pentatonic Minor': [0, 3, 5, 7, 10]
};

const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function PitchEditor() {
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pitchData, setPitchData] = useState<{ time: number; frequency: number; note: number }[]>([]);
  const [correctedPitchData, setCorrectedPitchData] = useState<{ time: number; frequency: number; note: number }[]>([]);
  const [semitones, setSemitones] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);

  // Auto-tune Settings
  const [selectedKey, setSelectedKey] = useState("C");
  const [selectedScale, setSelectedScale] = useState("Chromatic");
  const [isAutoTuneEnabled, setIsAutoTuneEnabled] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Tone.Player | null>(null);
  const pitchShiftRef = useRef<Tone.PitchShift | null>(null);
  const animationRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playbackIndexRef = useRef<number>(0);

  // Note names for piano roll
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  
  // Pitch detection algorithm (ACF2+)
  const autoCorrelate = (buf: Float32Array, sampleRate: number) => {
    let SIZE = buf.length;
    let rms = 0;

    for (let i = 0; i < SIZE; i++) {
      const val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return -1;

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

  const getNote = (frequency: number) => {
    const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
    return Math.round(noteNum) + 69;
  };

  const getFrequencyFromNote = (note: number) => {
    return 440 * Math.pow(2, (note - 69) / 12);
  };

  // Find closest note in the selected scale
  const getClosestScaleNote = (noteNum: number) => {
    const keyIndex = KEYS.indexOf(selectedKey);
    const scaleIntervals = SCALES[selectedScale as keyof typeof SCALES];
    
    // Create array of valid notes in one octave
    const validNotes = scaleIntervals.map(interval => (keyIndex + interval) % 12);
    
    let minDiff = Infinity;
    let closestNote = noteNum;

    // Search nearby notes
    for (let i = -6; i <= 6; i++) {
        const target = noteNum + i;
        const targetNoteNameIndex = target % 12;
        
        if (validNotes.includes(targetNoteNameIndex)) {
            const diff = Math.abs(target - noteNum);
            if (diff < minDiff) {
                minDiff = diff;
                closestNote = target;
            }
        }
    }
    return closestNote;
  };

  const setupAudio = async (buffer: AudioBuffer) => {
      setAudioBuffer(buffer);
      setDuration(buffer.duration);
      
      // Setup Tone.js Player
      if (playerRef.current) playerRef.current.dispose();
      if (pitchShiftRef.current) pitchShiftRef.current.dispose();

      playerRef.current = new Tone.Player(buffer).toDestination();
      pitchShiftRef.current = new Tone.PitchShift(0).toDestination();
      playerRef.current.disconnect();
      playerRef.current.connect(pitchShiftRef.current);
      
      // Analyze Pitch
      analyzePitch(buffer);
  };


  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    
    try {
      await Tone.start();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await Tone.context.decodeAudioData(arrayBuffer);
      setupAudio(audioBuffer);
    } catch (error) {
      console.error("Error loading file:", error);
      alert("파일을 불러오는 중 오류가 발생했습니다.");
      setIsAnalyzing(false);
    }
  };

  const loadTestTone = async () => {
    setIsAnalyzing(true);
    setAnalysisProgress(0);
    try {
        await Tone.start();
        const duration = 3;
        const sampleRate = Tone.context.sampleRate;
        const buffer = Tone.context.createBuffer(1, duration * sampleRate, sampleRate);
        const data = buffer.getChannelData(0);
        
        // Generate Sine Sweep (C3 to C5)
        for (let i = 0; i < data.length; i++) {
            const t = i / sampleRate;
            // Frequency sweep from 130Hz to 523Hz
            const freq = 130 + (393 * t / duration); 
            data[i] = Math.sin(2 * Math.PI * freq * t) * 0.5;
        }
        
        setupAudio(buffer);
    } catch (error) {
        console.error("Error generating test tone:", error);
        setIsAnalyzing(false);
    }
  };

  const analyzePitch = (buffer: AudioBuffer) => {
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const windowSize = 4096; 
    const hopSize = 1024; 
    const results: { time: number; frequency: number; note: number }[] = [];

    const totalSteps = Math.floor((channelData.length - windowSize) / hopSize);
    let currentStep = 0;

    const processChunk = () => {
        const startTime = performance.now();
        // Process for 16ms (1 frame)
        while (currentStep < totalSteps && performance.now() - startTime < 16) {
            const i = currentStep * hopSize;
            const chunk = channelData.slice(i, i + windowSize);
            const frequency = autoCorrelate(chunk, sampleRate);
            
            // Filter vocal range (approx 50Hz - 1000Hz)
            if (frequency !== -1 && frequency > 50 && frequency < 1000) {
                results.push({
                    time: i / sampleRate,
                    frequency,
                    note: getNote(frequency)
                });
            }
            currentStep++;
        }

        if (currentStep < totalSteps) {
            setAnalysisProgress(Math.round((currentStep / totalSteps) * 100));
            requestAnimationFrame(processChunk);
        } else {
            setPitchData(results);
            setIsAnalyzing(false);
            setAnalysisProgress(100);
        }
    };

    requestAnimationFrame(processChunk);
  };

  // Process Auto-tune
  useEffect(() => {
    if (pitchData.length === 0) return;

    if (!isAutoTuneEnabled) {
        setCorrectedPitchData([]);
        return;
    }

    const corrected = pitchData.map(point => {
        const closestNote = getClosestScaleNote(Math.round(point.note));
        const correctedFreq = getFrequencyFromNote(closestNote);
        return {
            time: point.time,
            frequency: correctedFreq,
            note: closestNote
        };
    });

    setCorrectedPitchData(corrected);

  }, [pitchData, isAutoTuneEnabled, selectedKey, selectedScale]);

  const togglePlay = async () => {
    if (!playerRef.current || !audioBuffer) return;

    if (isPlaying) {
      playerRef.current.stop();
      setIsPlaying(false);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      // Reset pitch shift
      if (pitchShiftRef.current) pitchShiftRef.current.pitch = semitones;
    } else {
      await Tone.start();
      // Reset index if starting from beginning
      if (currentTime === 0) {
          playbackIndexRef.current = 0;
      } else {
          // Find closest index if resuming
          playbackIndexRef.current = pitchData.findIndex(p => p.time >= currentTime);
          if (playbackIndexRef.current === -1) playbackIndexRef.current = 0;
      }
      
      playerRef.current.start(0, currentTime);
      setIsPlaying(true);
      requestAnimationFrame(updatePlayback);
    }
  };

  const updatePlayback = () => {
    if (!playerRef.current || playerRef.current.state !== 'started') {
      setIsPlaying(false);
      return;
    }
    
    // Auto-tune Logic during playback
    if (isAutoTuneEnabled && pitchData.length > 0 && pitchShiftRef.current) {
        // Use index tracking for performance
        let currentIndex = playbackIndexRef.current;
        
        // Advance index to match current time
        while (currentIndex < pitchData.length - 1 && pitchData[currentIndex + 1].time <= currentTime) {
            currentIndex++;
        }
        playbackIndexRef.current = currentIndex;
        
        const currentPoint = pitchData[currentIndex];
        
        // Only apply if point is close to current time (within 100ms)
        if (currentPoint && Math.abs(currentPoint.time - currentTime) < 0.1) {
            const closestNote = getClosestScaleNote(Math.round(currentPoint.note));
            const targetFreq = getFrequencyFromNote(closestNote);
            
            // Calculate pitch difference in semitones
            const ratio = targetFreq / currentPoint.frequency;
            const correctionSemitones = 12 * (Math.log(ratio) / Math.log(2));
            
            // Apply correction + global shift
            const totalShift = semitones + correctionSemitones;
            
            // Limit shift to avoid extreme artifacts
            if (Math.abs(totalShift) < 12) {
                 pitchShiftRef.current.pitch = totalShift;
            }
        } else {
            pitchShiftRef.current.pitch = semitones;
        }
    } else if (pitchShiftRef.current) {
        pitchShiftRef.current.pitch = semitones;
    }

    setCurrentTime(prev => {
        const next = prev + 0.016; // approx 60fps
        if (next >= duration) {
            setIsPlaying(false);
            return 0;
        }
        return next;
    });

    animationRef.current = requestAnimationFrame(updatePlayback);
  };

  // Reset playback when stopped
  useEffect(() => {
    if (!isPlaying) {
        // Reset logic if needed
    }
  }, [isPlaying]);

  const handlePitchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setSemitones(val);
    // If auto-tune is off, apply immediately. If on, updatePlayback handles it.
    if (!isAutoTuneEnabled && pitchShiftRef.current) {
      pitchShiftRef.current.pitch = val;
    }
  };

  // Draw Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas
    const container = canvas.parentElement;
    if (container) {
        canvas.width = container.clientWidth;
        canvas.height = 400;
    }

    // Clear
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Piano Roll Background
    const noteHeight = 10;
    const minNote = 36; // C2
    const maxNote = 84; // C6
    const totalNotes = maxNote - minNote;
    
    // Adjust scale
    const yScale = canvas.height / totalNotes;
    
    for (let i = 0; i < totalNotes; i++) {
        const note = maxNote - i;
        const isBlackKey = [1, 3, 6, 8, 10].includes(note % 12);
        
        // Highlight scale notes if auto-tune enabled
        let isScaleNote = false;
        if (isAutoTuneEnabled) {
            const keyIndex = KEYS.indexOf(selectedKey);
            const scaleIntervals = SCALES[selectedScale as keyof typeof SCALES];
            const validNotes = scaleIntervals.map(interval => (keyIndex + interval) % 12);
            if (validNotes.includes(note % 12)) {
                isScaleNote = true;
            }
        }

        if (isAutoTuneEnabled && isScaleNote) {
            ctx.fillStyle = isBlackKey ? '#1e293b' : '#334155'; // Highlighted scale
        } else {
            ctx.fillStyle = isBlackKey ? '#1a1a1a' : '#222';
        }
        
        ctx.fillRect(0, i * yScale, canvas.width, yScale);
        
        // Draw lines
        ctx.strokeStyle = '#333';
        ctx.beginPath();
        ctx.moveTo(0, i * yScale);
        ctx.lineTo(canvas.width, i * yScale);
        ctx.stroke();

        // Note Labels (C only)
        if (note % 12 === 0) {
            ctx.fillStyle = '#555';
            ctx.font = '10px monospace';
            ctx.fillText(`C${Math.floor(note / 12) - 1}`, 5, i * yScale + yScale - 2);
            
            ctx.strokeStyle = '#444';
            ctx.beginPath();
            ctx.moveTo(0, i * yScale);
            ctx.lineTo(canvas.width, i * yScale);
            ctx.stroke();
        }
    }

    if (!audioBuffer || pitchData.length === 0) {
        // Draw placeholder text
        ctx.fillStyle = '#444';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('보컬 파일을 업로드하여 분석을 시작하세요', canvas.width / 2, canvas.height / 2);
        return;
    }

    // X scale: time
    const xScale = canvas.width / duration;

    // Draw Original Pitch Data (Dimmed if corrected exists)
    ctx.fillStyle = isAutoTuneEnabled ? '#10b98140' : '#10b981'; // Emerald 500
    ctx.strokeStyle = isAutoTuneEnabled ? '#10b98140' : '#10b981';
    ctx.lineWidth = 2;
    
    ctx.beginPath();
    let started = false;

    pitchData.forEach((point, index) => {
        const x = point.time * xScale;
        const y = (maxNote - point.note) * yScale;
        
        if (y < 0 || y > canvas.height) return;

        ctx.fillRect(x, y, 2, 4); 
        
        if (!started) {
            ctx.moveTo(x, y + 2);
            started = true;
        } else {
            const prev = pitchData[index - 1];
            if (point.time - prev.time < 0.1) { 
                ctx.lineTo(x, y + 2);
            } else {
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x, y + 2);
            }
        }
    });
    ctx.stroke();

    // Draw Corrected Pitch Data
    if (isAutoTuneEnabled && correctedPitchData.length > 0) {
        ctx.fillStyle = '#34d399'; // Emerald 400 (Brighter)
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        let startedCorrected = false;

        correctedPitchData.forEach((point, index) => {
            const x = point.time * xScale;
            const y = (maxNote - point.note) * yScale;
            
            if (y < 0 || y > canvas.height) return;

            ctx.fillRect(x, y, 2, 4); 
            
            if (!startedCorrected) {
                ctx.moveTo(x, y + 2);
                startedCorrected = true;
            } else {
                const prev = correctedPitchData[index - 1];
                if (point.time - prev.time < 0.1) { 
                    ctx.lineTo(x, y + 2);
                } else {
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x, y + 2);
                }
            }
        });
        ctx.stroke();
    }

    // Draw Playhead
    const playheadX = currentTime * xScale;
    ctx.strokeStyle = '#ef4444'; // Red
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvas.height);
    ctx.stroke();

  }, [audioBuffer, pitchData, correctedPitchData, currentTime, duration, isAutoTuneEnabled, selectedKey, selectedScale]);

  return (
    <div className="w-full bg-[#0a0a0a] border border-neutral-900 rounded-2xl overflow-hidden flex flex-col">
      {/* Header / Controls */}
      <div className="p-4 border-b border-neutral-900 flex items-center justify-between bg-[#0f0f0f]">
        <div className="flex items-center gap-4">
            <input 
                type="file" 
                accept="audio/*" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
            />
            <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium transition-colors"
                disabled={isAnalyzing}
            >
                {isAnalyzing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                <span>파일 업로드</span>
            </button>

            <button 
                onClick={loadTestTone}
                className="flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs font-medium transition-colors"
                disabled={isAnalyzing}
            >
                <RefreshCw size={14} />
                <span>테스트 톤</span>
            </button>

            {audioBuffer && (
                <button 
                    onClick={togglePlay}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                        isPlaying 
                        ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' 
                        : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                    }`}
                >
                    {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                    <span>{isPlaying ? '정지' : '재생'}</span>
                </button>
            )}
        </div>

        <div className="flex items-center gap-4">
            {/* Auto-tune Controls */}
            <div className="flex items-center gap-3 bg-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-800">
                <Wand2 size={14} className={isAutoTuneEnabled ? "text-emerald-500" : "text-neutral-500"} />
                <div className="flex items-center gap-2">
                    <select 
                        value={selectedKey}
                        onChange={(e) => setSelectedKey(e.target.value)}
                        className="bg-neutral-800 text-white text-[10px] rounded px-1 py-0.5 border-none outline-none cursor-pointer"
                    >
                        {KEYS.map(key => <option key={key} value={key}>{key}</option>)}
                    </select>
                    <select 
                        value={selectedScale}
                        onChange={(e) => setSelectedScale(e.target.value)}
                        className="bg-neutral-800 text-white text-[10px] rounded px-1 py-0.5 border-none outline-none cursor-pointer w-20"
                    >
                        {Object.keys(SCALES).map(scale => <option key={scale} value={scale}>{scale}</option>)}
                    </select>
                    <button
                        onClick={() => setIsAutoTuneEnabled(!isAutoTuneEnabled)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded transition-colors ${
                            isAutoTuneEnabled 
                            ? 'bg-emerald-500 text-black' 
                            : 'bg-neutral-700 text-neutral-400 hover:bg-neutral-600'
                        }`}
                    >
                        AI TUNE
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-3 bg-neutral-900 px-3 py-1.5 rounded-lg border border-neutral-800">
                <Settings2 size={14} className="text-neutral-500" />
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Shift</span>
                    <input 
                        type="range" 
                        min="-12" 
                        max="12" 
                        step="1" 
                        value={semitones}
                        onChange={handlePitchChange}
                        className="w-16 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <span className="text-xs font-mono text-emerald-400 w-6 text-right">{semitones > 0 ? `+${semitones}` : semitones}</span>
                </div>
            </div>
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="relative w-full h-[400px] bg-[#111] overflow-hidden group">
        <canvas ref={canvasRef} className="w-full h-full block" />
        
        {/* Overlay Info */}
        {!audioBuffer && !isAnalyzing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="w-16 h-16 rounded-full bg-neutral-800/50 flex items-center justify-center text-neutral-600 mb-4">
                    <Music size={32} />
                </div>
                <p className="text-neutral-500 text-sm">보컬 오디오 파일을 업로드해주세요</p>
                <p className="text-neutral-600 text-xs mt-2">WAV, MP3, M4A 지원</p>
            </div>
        )}
        
        {isAnalyzing && (
             <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm z-10">
                <Loader2 size={32} className="text-emerald-500 animate-spin mb-4" />
                <p className="text-white text-sm font-medium">오디오 분석 중... {analysisProgress}%</p>
                <p className="text-neutral-400 text-xs mt-1">잠시만 기다려주세요</p>
            </div>
        )}
      </div>
      
      {/* Footer Info */}
      <div className="px-4 py-2 bg-[#0f0f0f] border-t border-neutral-900 flex justify-between items-center text-[10px] text-neutral-500">
        <span>Melodyne-style Pitch Correction Demo</span>
        <span>Powered by Tone.js</span>
      </div>
    </div>
  );
}
