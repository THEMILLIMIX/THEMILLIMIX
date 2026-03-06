import React, { useState, useEffect, useRef } from 'react';
import { Mic, Activity, AlertTriangle, StopCircle, BarChart3, Waves, RefreshCw, Bot, User } from 'lucide-react';

interface AnalysisResults {
  shortTermLufs: number; // 3s average
  fiveSecondLufs: number; // 5s average
  integratedLufs: number; // Since start
  diffFromInitial: number; // Difference from initial LUFS
  peak: number; // Max Peak
  currentPeak: number; // Real-time Peak
  cutoffFreq: number;
  aiScore: number; // 0-100 probability
  sampleRate: number;
  channels: number;
  isClipping: boolean;
}

interface LiveAudioAnalyzerProps {
  mode?: 'meter' | 'verification' | 'calibration';
}

export const LiveAudioAnalyzer: React.FC<LiveAudioAnalyzerProps> = ({ mode = 'meter' }) => {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const [targetLufs, setTargetLufs] = useState(-14); // User-defined target
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lufsAnalyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  
  // Rolling buffers for visualizations
  const spectrogramDataRef = useRef<Uint8Array[]>([]);
  const maxSpectrogramHistory = 800; // Width of canvas
  const lufsBufferRef = useRef<{ value: number; time: number }[]>([]);
  const fiveSecondBufferRef = useRef<{ value: number; time: number }[]>([]);
  const longTermLufsBufferRef = useRef<{ value: number; time: number }[]>([]);
  const initialLufsRef = useRef<number | null>(null);

  const resetMeters = () => {
    setResults(prev => prev ? { ...prev, peak: -120, integratedLufs: -120 } : null);
    longTermLufsBufferRef.current = [];
  };

  const startListening = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            // @ts-ignore - Chrome specific constraints for raw audio
            googEchoCancellation: false,
            // @ts-ignore
            googAutoGainControl: false,
            // @ts-ignore
            googNoiseSuppression: false,
            // @ts-ignore
            googHighpassFilter: false,
            channelCount: 1
        } 
      });
      streamRef.current = stream;
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioContext.resume(); // Ensure context is running
      audioContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 4096; // Increased buffer size to ensure we capture all peaks between frames
      analyser.smoothingTimeConstant = 0.6;
      analyserRef.current = analyser;
      
      source.connect(analyser);

      // LUFS Chain (K-weighting)
      // Stage 1: High Shelf (Gain 4dB, Freq 1500Hz)
      const highShelf = audioContext.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 1500;
      highShelf.gain.value = 4;

      // Stage 2: High Pass (Freq ~38Hz) - Approximation of RLB filter
      const highPass = audioContext.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = 38;
      highPass.Q.value = 0; // Butterworth-ish

      const lufsAnalyser = audioContext.createAnalyser();
      lufsAnalyser.fftSize = 4096;
      lufsAnalyserRef.current = lufsAnalyser;

      source.connect(highShelf);
      highShelf.connect(highPass);
      highPass.connect(lufsAnalyser);
      
      setIsListening(true);
      analyzeStream();
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError(`마이크 접근 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const stopListening = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    setIsListening(false);
    setResults(null);
    spectrogramDataRef.current = [];
    lufsBufferRef.current = [];
    longTermLufsBufferRef.current = [];
    initialLufsRef.current = null;
  };



  const analyzeStream = () => {
    if (!analyserRef.current || !audioContextRef.current || !lufsAnalyserRef.current) return;

    const currentSampleRate = audioContextRef.current.sampleRate;
    const analyser = analyserRef.current;
    const lufsAnalyser = lufsAnalyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeDomainArray = new Float32Array(bufferLength);
    const lufsDataArray = new Float32Array(bufferLength);

    const draw = () => {
      // Check if context is still active
      if (!audioContextRef.current) return;

      analyser.getByteFrequencyData(dataArray);
      analyser.getFloatTimeDomainData(timeDomainArray);
      lufsAnalyser.getFloatTimeDomainData(lufsDataArray);

      // 1. Calculate Peak (from raw signal)
      let peak = 0;
      for (let i = 0; i < timeDomainArray.length; i++) {
        const amplitude = Math.abs(timeDomainArray[i]);
        if (amplitude > peak) peak = amplitude;
      }
      
      // 2. Calculate LUFS (from K-weighted signal)
      // Calculate Mean Square of the filtered signal
      let sumSquares = 0;
      for (let i = 0; i < lufsDataArray.length; i++) {
        sumSquares += lufsDataArray[i] * lufsDataArray[i];
      }
      const currentMeanSquare = sumSquares / lufsDataArray.length;
      
      const now = performance.now();
      lufsBufferRef.current.push({ value: currentMeanSquare, time: now });
      
      // Keep only last 3000ms (Short-term LUFS window)
      while(lufsBufferRef.current.length > 0 && now - lufsBufferRef.current[0].time > 3000) {
        lufsBufferRef.current.shift();
      }
      
      const totalMeanSquare = lufsBufferRef.current.reduce((acc, item) => acc + item.value, 0);
      const avgMeanSquare = totalMeanSquare / (lufsBufferRef.current.length || 1);
      
      // LUFS = -0.691 + 10 * log10(MeanSquare)
      // We add a small epsilon to avoid log(0)
      const shortTermLufs = -0.691 + 10 * Math.log10(avgMeanSquare || 1e-10);
      
      if (initialLufsRef.current === null && shortTermLufs > -100) {
        initialLufsRef.current = shortTermLufs;
      }
      const diffFromInitial = shortTermLufs - (initialLufsRef.current ?? shortTermLufs);
      
      // Calculate 5s Moving Average LUFS (for Calibration)
      fiveSecondBufferRef.current.push({ value: currentMeanSquare, time: now });
      
      // Keep only last 5000ms
      while(fiveSecondBufferRef.current.length > 0 && now - fiveSecondBufferRef.current[0].time > 5000) {
        fiveSecondBufferRef.current.shift();
      }

      const totalFiveSecondMeanSquare = fiveSecondBufferRef.current.reduce((acc, item) => acc + item.value, 0);
      const avgFiveSecondMeanSquare = totalFiveSecondMeanSquare / (fiveSecondBufferRef.current.length || 1);
      const fiveSecondLufs = -0.691 + 10 * Math.log10(avgFiveSecondMeanSquare || 1e-10);
      const integratedLufs = fiveSecondLufs; // Fallback to 5s average as a placeholder

      const peakDb = 20 * Math.log10(peak || 1e-10);

      // 3. Estimate Cutoff Frequency (Quality)
      // Find the highest frequency bin with significant energy
      let cutoffBin = 0;
      for (let i = bufferLength - 1; i >= 0; i--) {
        if (dataArray[i] > 10) { // Threshold
          cutoffBin = i;
          break;
        }
      }
      const nyquist = currentSampleRate / 2;
      const cutoffFreq = (cutoffBin / bufferLength) * nyquist;

      // 4. AI Detection Logic (Heuristic)
      // Based on High Frequency Cutoff and Spectral Characteristics
      // Many AI models have hard cutoffs around 16kHz or 11kHz
      let aiProbability = 0;
      
      // Factor 1: Cutoff Frequency
      if (cutoffFreq < 11000) aiProbability += 80; // Very low cutoff -> Likely AI/Low Quality
      else if (cutoffFreq < 16500) aiProbability += 60; // Common AI cutoff (~16kHz)
      else if (cutoffFreq < 18000) aiProbability += 30; // Suspicious
      else aiProbability += 0; // > 18kHz -> Likely Human/High Quality

      // Factor 2: Spectral Flatness (Variance) in high frequencies
      // AI generated audio often has different noise characteristics in high bands
      // (This is a simplified placeholder for more complex spectral analysis)
      
      // Smoothing the score
      const prevAiScore = results ? results.aiScore : 0;
      const currentAiScore = prevAiScore * 0.95 + aiProbability * 0.05;

      // 5. Update Results State
      setResults(prev => {
        const currentShortTermLufs = Math.max(-120, shortTermLufs);
        const currentFiveSecondLufs = Math.max(-120, fiveSecondLufs);
        const currentIntegratedLufs = Math.max(-120, integratedLufs);
        const currentDiffFromInitial = diffFromInitial;
        const currentPeak = Math.max(-120, peakDb);
        
        if (!prev) {
            return {
                shortTermLufs: currentShortTermLufs,
                fiveSecondLufs: currentFiveSecondLufs,
                integratedLufs: currentIntegratedLufs,
                diffFromInitial: currentDiffFromInitial,
                peak: currentPeak,
                currentPeak: currentPeak,
                cutoffFreq,
                aiScore: aiProbability,
                sampleRate: currentSampleRate,
                channels: 1,
                isClipping: peak >= 1.0
            };
        }

        return {
            shortTermLufs: currentShortTermLufs,
            fiveSecondLufs: currentFiveSecondLufs,
            integratedLufs: currentIntegratedLufs,
            diffFromInitial: currentDiffFromInitial,
            peak: Math.max(currentPeak, prev.peak), // Hold max peak
            currentPeak: currentPeak, // Real-time peak for reference
            cutoffFreq: Math.max(cutoffFreq, prev.cutoffFreq), // Hold max frequency
            aiScore: currentAiScore,
            sampleRate: currentSampleRate,
            channels: 1,
            isClipping: peak >= 1.0 || prev.isClipping // Hold clipping indicator
        };
      });

      // 4. Update Spectrogram Data
      // We only keep the relevant part of FFT (up to 20kHz usually, but here full range)
      // We'll store the full bin array to draw later
      spectrogramDataRef.current.push(new Uint8Array(dataArray));
      if (spectrogramDataRef.current.length > maxSpectrogramHistory) {
        spectrogramDataRef.current.shift();
      }

      // 5. Draw Canvas
      drawCanvas(dataArray);

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();
  };

  const drawCanvas = (currentFreqData: Uint8Array) => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // Draw Spectrogram
    const history = spectrogramDataRef.current;
    const bins = currentFreqData.length;
    
    // We draw the history from right to left
    // x=width is current time
    
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    // We map frequency bins (Y axis) to height
    // And history (X axis) to width
    
    for (let x = 0; x < width; x++) {
      // Get data from history. history[history.length - 1] is newest.
      // We want newest at right (x = width - 1)
      const historyIndex = history.length - 1 - (width - 1 - x);
      
      if (historyIndex >= 0 && historyIndex < history.length) {
        const freqData = history[historyIndex];
        
        for (let y = 0; y < height; y++) {
          // Map y (0 to height) to frequency bin (bins-1 to 0)
          // y=0 is top (high freq), y=height is bottom (low freq)
          const binIndex = Math.floor(((height - 1 - y) / height) * bins);
          
          if (binIndex >= 0 && binIndex < bins) {
             const val = freqData[binIndex];
             
             // Color mapping (Magma-like)
             let r=0, g=0, b=0;
             if (val < 10) { // Background noise floor
                 r=0; g=0; b=0;
             } else if (val < 64) { // Black to Purple
                 r = val * 2; b = val * 4; 
             } else if (val < 128) { // Purple to Red
                 r = 128 + (val-64)*2; b = 255 - (val-64)*4;
             } else if (val < 192) { // Red to Yellow
                 r = 255; g = (val-128)*4;
             } else { // Yellow to White
                 r = 255; g = 255; b = (val-192)*4;
             }

             const idx = (y * width + x) * 4;
             data[idx] = r;
             data[idx + 1] = g;
             data[idx + 2] = b;
             data[idx + 3] = 255;
          }
        }
      }
    }
    
    ctx.putImageData(imgData, 0, 0);

    // Draw Grid & Labels (Overlay)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px Inter';
    ctx.textAlign = 'right';
    
    // Frequency labels
    const freqs = [20000, 10000, 5000, 1000, 200];
    const nyquist = audioContextRef.current?.sampleRate ? audioContextRef.current.sampleRate / 2 : 24000;
    
    freqs.forEach(f => {
        if (f < nyquist) {
            const y = height - (f / nyquist) * height;
            ctx.fillText(`${f}Hz`, width - 5, y);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    });
  };

  useEffect(() => {
    // Resize canvas
    if (canvasRef.current && canvasRef.current.parentElement) {
        const parent = canvasRef.current.parentElement;
        canvasRef.current.width = parent.clientWidth;
        canvasRef.current.height = 300; // Fixed height
    }
    
    return () => stopListening();
  }, []);

  return (
    <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Activity size={16} className="text-neutral-500" />
          <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">Live Audio Analyzer</h3>
          {isListening && (
            <span className="flex h-2 w-2 relative ml-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
          )}
        </div>
        
        <button
            onClick={isListening ? stopListening : startListening}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                isListening 
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' 
                : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20'
            }`}
        >
            {isListening ? (
                <>
                    <StopCircle size={14} />
                    <span>STOP MONITORING</span>
                </>
            ) : (
                <>
                    <Mic size={14} />
                    <span>START MIC</span>
                </>
            )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/10 rounded-xl mb-6">
          <AlertTriangle size={14} className="text-red-500" />
          <p className="text-red-500 text-[11px]">{error}</p>
        </div>
      )}

      {/* Visualization Area */}
      <div className="mb-8 bg-black rounded-xl border border-neutral-900 overflow-hidden relative h-[300px]">
        {!isListening && !results && (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-600">
                <div className="text-center">
                    <Waves size={48} className="mx-auto mb-4 opacity-20" />
                    <p className="text-xs">마이크를 켜서 실시간 분석을 시작하세요</p>
                </div>
            </div>
        )}
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      {results && (
        <div className="space-y-8 animate-fade-in">
          {/* RMS & Peak - Only show in meter mode */}
          {mode === 'meter' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800 flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between">
                  <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Short 3sc</span>
                  <span className={`text-2xl font-mono font-bold ${results.shortTermLufs > -14 ? 'text-white' : 'text-neutral-400'}`}>
                    {results.shortTermLufs.toFixed(1)} <span className="text-xs font-normal text-neutral-600">LUFS</span>
                  </span>
              </div>
              <div className="w-full h-[1px] bg-neutral-800"></div>
              <div className="flex items-center justify-between">
                  <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Long 9sc</span>
                  <span className={`text-2xl font-mono font-bold ${results.integratedLufs > -14 ? 'text-white' : 'text-neutral-400'}`}>
                    {results.integratedLufs.toFixed(1)} <span className="text-xs font-normal text-neutral-600">LUFS</span>
                  </span>
              </div>
            </div>

            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800 flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Max Peak Level</span>
                    <button onClick={resetMeters} className="text-neutral-600 hover:text-neutral-400 transition-colors" title="Reset Meters">
                        <RefreshCw size={10} />
                    </button>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-mono font-bold ${results.peak > -1.0 ? 'text-red-500' : 'text-white'}`}>
                  {results.peak.toFixed(1)} <span className="text-xs font-normal text-neutral-600">dBTP</span>
                </span>
              </div>
            </div>
          </div>
          )}

          {/* AI Verification - Only show in verification mode */}
          {mode === 'verification' && (
          <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800">
             <div className="flex items-center justify-between mb-4">
                <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Source Verification (Beta)</span>
                <div className={`flex items-center gap-2 px-2 py-1 rounded text-[10px] font-bold uppercase ${
                    results.aiScore > 50 
                    ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' 
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                }`}>
                    {results.aiScore > 50 ? <Bot size={12} /> : <User size={12} />}
                    {results.aiScore > 50 ? 'Likely AI / Low Quality' : 'Likely Human / High Quality'}
                </div>
             </div>
             
             <div className="relative h-4 bg-neutral-900 rounded-full overflow-hidden">
                {/* Background Gradient */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 via-neutral-800 to-purple-500/20"></div>
                
                {/* Indicator */}
                <div 
                    className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] transition-all duration-300 ease-out"
                    style={{ left: `${Math.min(100, Math.max(0, results.aiScore))}%` }}
                ></div>
             </div>
             <div className="flex justify-between mt-2 text-[10px] text-neutral-500 font-mono">
                <span>HUMAN</span>
                <span>AI PROBABILITY: {Math.round(results.aiScore)}%</span>
                <span>AI</span>
             </div>
          </div>
          )}

          {/* Gain Calibration Assistant - Only show in calibration mode */}
          {mode === 'calibration' && (
          <div className="space-y-6">
            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800">
               <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Gain Calibration Assistant</span>
                    <button 
                        onClick={() => initialLufsRef.current = null}
                        className="text-xs text-neutral-400 hover:text-white underline font-bold"
                    >
                        Reset
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="text-neutral-500 text-[10px]">Target:</span>
                      <input 
                          type="number"
                          value={targetLufs}
                          onChange={(e) => setTargetLufs(Number(e.target.value))}
                          className="w-16 bg-black border border-neutral-800 rounded px-2 py-1 text-white text-xs font-mono focus:outline-none focus:border-neutral-600"
                      />
                      <span className="text-neutral-500 text-[10px]">LUFS</span>
                  </div>
               </div>
               
               {(() => {
                  const adjustment = targetLufs - results.fiveSecondLufs;
                  const isGood = Math.abs(adjustment) <= 1.0;
                  
                  return (
                      <div className="flex flex-col items-center gap-4">
                          <div className={`text-4xl font-mono font-bold ${isGood ? 'text-emerald-500' : 'text-white'}`}>
                              {adjustment > 0 ? '+' : ''}{adjustment.toFixed(1)} <span className="text-sm font-normal text-neutral-600">dB</span>
                          </div>
                          <div className="text-neutral-500 text-[10px] font-mono">
                              초기 볼륨 대비: {results.diffFromInitial > 0 ? '+' : ''}{results.diffFromInitial.toFixed(1)} dB
                          </div>
                          <div className="text-neutral-400 text-sm">
                              {isGood ? 'Perfect Level' : adjustment > 0 ? 'Increase gain by this amount' : 'Decrease gain by this amount'}
                          </div>
                      </div>
                  );
               })()}
            </div>

            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800">
               <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase mb-4 block">How to Use</span>
               <ul className="text-neutral-400 text-xs space-y-2 list-decimal list-inside">
                  <li>Target LUFS 설정 ( 예시 -20 )</li>
                  <li>표시된 dB만큼 마이크 게인(Gain)을 조정하세요.<br/>
                      <span className="text-neutral-500">( + 볼륨을 키워주세요 / - 볼륨을 낮춰주세요 )</span></li>
                  <li>±1dB 이내로 들어오면 'Perfect Level'입니다.</li>
                  <li>Reset 버튼을 클릭하면 초기 볼륨 기준(dB)이 초기화되어, 새로운 기준으로 다시 평균 음압을 측정할 수 있습니다.</li>
               </ul>
            </div>
          </div>
          )}

          {/* Quality & Info - Show in both modes but maybe simplified? Keeping for now */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Input Quality</span>
                <p className="text-neutral-400 text-[10px]">최대 주파수 응답: ~{Math.round(results.cutoffFreq / 100) / 10}kHz</p>
                <p className="text-neutral-400 text-[10px]">초기 볼륨 대비: {results.diffFromInitial > 0 ? '+' : ''}{results.diffFromInitial.toFixed(1)} dB</p>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold px-3 py-1 rounded-full uppercase tracking-tighter ${
                  results.cutoffFreq > 16000 ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                  'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20'
                }`}>
                  {results.cutoffFreq > 16000 ? 'High Quality' : 'Standard'}
                </span>
              </div>
            </div>

            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800 flex items-center justify-between">
               <div className="space-y-1">
                <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Sample Rate</span>
                <p className="text-neutral-400 text-[10px]">입력 샘플 레이트</p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-mono font-bold text-white">
                  {results.sampleRate / 1000} <span className="text-xs font-normal text-neutral-600">kHz</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
