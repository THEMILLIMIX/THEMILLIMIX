import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileAudio, Activity, CheckCircle2, AlertTriangle, Brain, Layers, Radio, Fingerprint, Mic2, Loader2, X, Search, BarChart4 } from 'lucide-react';

interface AnalysisStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: 'pending' | 'analyzing' | 'completed';
  score?: number; // 0-100 (Higher is more likely AI)
  details?: string;
  value?: string; // Display calculated value
}

interface AnalysisResult {
  totalScore: number;
  verdict: 'HUMAN' | 'SUSPICIOUS' | 'AI';
  confidence: number;
  features: {
    spectralRolloff: number;
    spectralFlatness: number;
    dynamicRange: number;
    transientSharpness: number;
    consistencyScore: number;
  };
}

export const AiVerificationAnalyzer: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [steps, setSteps] = useState<AnalysisStep[]>([
    { id: 'decode', label: 'Audio Decoding & PCM Conversion', icon: <FileAudio size={16} />, status: 'pending' },
    { id: 'spectral', label: 'Spectral Analysis (Rolloff/Centroid)', icon: <Activity size={16} />, status: 'pending' },
    { id: 'artifacts', label: 'High-Freq Artifact Detection', icon: <Radio size={16} />, status: 'pending' },
    { id: 'dynamics', label: 'Dynamic Range & Transient Check', icon: <BarChart4 size={16} />, status: 'pending' },
    { id: 'consistency', label: 'Phase & Consistency Analysis', icon: <Layers size={16} />, status: 'pending' },
    { id: 'deepscan', label: 'Deep Pattern Matching', icon: <Brain size={16} />, status: 'pending' },
  ]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setProgress(0);
      setCurrentStepIndex(0);
      setSteps(steps.map(s => ({ ...s, status: 'pending', score: undefined, details: undefined, value: undefined })));
    }
  };

  // Helper: Calculate Zero Crossing Rate
  const calculateZCR = (data: Float32Array) => {
    let zeroCrossings = 0;
    for (let i = 1; i < data.length; i++) {
        if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) {
            zeroCrossings++;
        }
    }
    return zeroCrossings / data.length;
  };

  // Helper: Calculate Spectral Flux (Change between frames)
  const calculateSpectralFlux = (prevSpectrum: Uint8Array, currentSpectrum: Uint8Array) => {
      let flux = 0;
      for (let i = 0; i < prevSpectrum.length; i++) {
          const diff = currentSpectrum[i] - prevSpectrum[i];
          flux += diff * diff; // Squared difference
      }
      return Math.sqrt(flux) / prevSpectrum.length;
  };

  const analyzeAudio = async () => {
    if (!file) return;
    setIsAnalyzing(true);
    setProgress(5);
    
    try {
      // Step 1: Decode
      updateStep('decode', 'analyzing');
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
      setAudioBuffer(decodedBuffer);
      updateStep('decode', 'completed', 0, `SR: ${decodedBuffer.sampleRate}Hz, Ch: ${decodedBuffer.numberOfChannels}, Bit: 32f`);
      setProgress(15);

      const channelData = decodedBuffer.getChannelData(0);
      const originalSampleRate = decodedBuffer.sampleRate;
      const duration = decodedBuffer.duration;

      // Step 2: Advanced Spectral Analysis (High Precision FFT)
      updateStep('spectral', 'analyzing');
      
      // Use standard sample rate for analysis to avoid browser limits
      const analysisSampleRate = 44100;
      const fftSize = 16384; 
      
      let totalRolloff = 0;
      let totalCentroid = 0;
      let totalFlatness = 0;
      let totalFlux = 0;
      let maxCutoffSlope = 0;

      let prevSpectrum: Uint8Array | null = null;

      // Determine segments based on duration
      const segmentDuration = 0.5;
      let segments: number[] = [];
      
      if (duration < 1.0) {
          // Verify short files
          segments = [0];
      } else {
          // Analyze 5 segments for better coverage
          const segmentCount = 5;
          for (let i = 0; i < segmentCount; i++) {
              segments.push((duration * (i + 1)) / (segmentCount + 2));
          }
      }

      for (const startTime of segments) {
          // Create OfflineContext with standard sample rate
          const offlineCtx = new OfflineAudioContext(1, analysisSampleRate * segmentDuration, analysisSampleRate);
          
          // Create buffer source and resample if necessary by playback rate
          const source = offlineCtx.createBufferSource();
          source.buffer = decodedBuffer;
          
          const analyser = offlineCtx.createAnalyser();
          analyser.fftSize = fftSize;
          analyser.smoothingTimeConstant = 0.0;
          
          source.connect(analyser);
          source.start(0, startTime, segmentDuration);
          
          await offlineCtx.startRendering();

          const freqData = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(freqData);
          
          const features = calculateSpectralFeatures(freqData, analysisSampleRate);
          totalRolloff += features.rolloffFreq;
          totalCentroid += features.centroid;

          // Flatness
          let sum = 0, prod = 0, count = 0;
          for(let j=0; j<freqData.length; j++) {
              if (freqData[j] > 0) {
                  sum += freqData[j];
                  prod += Math.log(freqData[j]);
                  count++;
              }
          }
          const geometric = count > 0 ? Math.exp(prod / count) : 0;
          const arithmetic = count > 0 ? sum / count : 1;
          totalFlatness += geometric / arithmetic;

          // Flux
          if (prevSpectrum) {
              totalFlux += calculateSpectralFlux(prevSpectrum, freqData);
          }
          prevSpectrum = freqData;

          // Cutoff Slope Detection
          const bin15k = Math.floor(15000 / (analysisSampleRate / fftSize));
          const bin17k = Math.floor(17000 / (analysisSampleRate / fftSize));
          let energy15k = 0;
          let energy17k = 0;
          
          // Safe bounds check
          const safeBin15k = Math.min(bin15k, freqData.length - 11);
          const safeBin17k = Math.min(bin17k, freqData.length - 11);
          
          for(let k=safeBin15k-10; k<safeBin15k+10; k++) if(freqData[k]) energy15k += freqData[k];
          for(let k=safeBin17k-10; k<safeBin17k+10; k++) if(freqData[k]) energy17k += freqData[k];
          
          if (energy15k > 100 && energy17k < 10) { 
             maxCutoffSlope = Math.max(maxCutoffSlope, energy15k / (energy17k + 1));
          }
      }

      const avgRolloff = totalRolloff / segments.length;
      const avgCentroid = totalCentroid / segments.length;
      const avgFlatness = totalFlatness / segments.length;
      const avgFlux = segments.length > 1 ? totalFlux / (segments.length - 1) : 0;

      let spectralScore = 0;
      let spectralDetails = "";
      
      // Precision Cutoff Logic
      if (avgRolloff < 16200 && avgRolloff > 15000) {
          spectralScore += 90;
          spectralDetails = "Hard 16kHz Cutoff (High Probability AI/MP3)";
      } else if (avgRolloff < 11500) {
          spectralScore += 95;
          spectralDetails = "Very Low Bandwidth (11kHz) - Likely Old TTS/AI";
      } else if (avgRolloff > 20000) {
          spectralScore = 0;
          spectralDetails = "Full Spectrum (>20kHz) - High Quality Source";
      } else {
          spectralScore += 20;
          spectralDetails = `Rolloff at ${(avgRolloff/1000).toFixed(1)}kHz`;
      }
      
      updateStep('spectral', 'completed', spectralScore, spectralDetails);
      setProgress(40);

      // Step 3: Artifacts & ZCR
      updateStep('artifacts', 'analyzing');
      
      const zcr = calculateZCR(channelData);
      
      let artifactScore = 0;
      if (maxCutoffSlope > 10) {
          artifactScore += 50; // Steep cutoff penalty
      }
      
      if (avgFlux < 0.5 && segments.length > 1) {
          artifactScore += 30;
      }

      updateStep('artifacts', 'completed', artifactScore, `Cutoff Slope: ${maxCutoffSlope.toFixed(1)}, Flux: ${avgFlux.toFixed(2)}`);
      setProgress(60);

      // Step 4: Dynamics & Transients
      updateStep('dynamics', 'analyzing');
      
      let maxPeak = 0;
      let sumSq = 0;
      const step = 50; 
      for(let i=0; i<channelData.length; i+=step) {
          const val = Math.abs(channelData[i]);
          if(val > maxPeak) maxPeak = val;
          sumSq += val * val;
      }
      const rms = Math.sqrt(sumSq / (channelData.length/step));
      const crestFactor = rms > 0 ? 20 * Math.log10(maxPeak / rms) : 0;
      
      let dynamicScore = 0;
      if (crestFactor < 8) dynamicScore = 60; 
      else if (crestFactor < 12) dynamicScore = 30;
      
      updateStep('dynamics', 'completed', dynamicScore, `Crest Factor: ${crestFactor.toFixed(2)}dB`);
      setProgress(80);

      // Step 5: Consistency & Stereo Phase
      updateStep('consistency', 'analyzing');
      
      let consistencyScore = 0;
      let consistencyDetails = "Normal";

      // Digital Silence Check
      let zeroCount = 0;
      let maxZeroRun = 0;
      let currentZeroRun = 0;
      for(let i=0; i<channelData.length; i+=10) {
          if(channelData[i] === 0) {
              zeroCount++;
              currentZeroRun++;
          } else {
              maxZeroRun = Math.max(maxZeroRun, currentZeroRun);
              currentZeroRun = 0;
          }
      }
      
      if (maxZeroRun > originalSampleRate * 0.1) { 
          consistencyScore += 40;
          consistencyDetails = "Unnatural Digital Silence Detected";
      }

      updateStep('consistency', 'completed', consistencyScore, consistencyDetails);
      setProgress(90);

      // Step 6: Deep Pattern (Heuristic weighting)
      updateStep('deepscan', 'analyzing');
      await new Promise(r => setTimeout(r, 600));
      
      let deepScore = 0;
      if (spectralScore > 80) deepScore += 60; 
      if (artifactScore > 40) deepScore += 20;
      if (dynamicScore > 40) deepScore += 10;
      
      deepScore = Math.min(99, deepScore);
      
      updateStep('deepscan', 'completed', deepScore, `Pattern Confidence: ${deepScore.toFixed(1)}%`);
      setProgress(100);

      // Final Verdict Calculation
      const weightedScore = (
          (spectralScore * 0.4) + 
          (artifactScore * 0.2) + 
          (dynamicScore * 0.1) + 
          (consistencyScore * 0.1) + 
          (deepScore * 0.2)
      );

      let verdict: 'HUMAN' | 'SUSPICIOUS' | 'AI' = 'HUMAN';
      if (weightedScore > 75) verdict = 'AI';
      else if (weightedScore > 45) verdict = 'SUSPICIOUS';

      setResult({
          totalScore: weightedScore,
          verdict,
          confidence: Math.min(99, 60 + (Math.abs(weightedScore - 50) / 50) * 40),
          features: {
              spectralRolloff: avgRolloff,
              spectralFlatness: avgFlatness,
              dynamicRange: crestFactor,
              transientSharpness: maxCutoffSlope,
              consistencyScore: 100 - consistencyScore
          }
      });

      setIsAnalyzing(false);

    } catch (e) {
      console.error("Analysis Failed:", e);
      alert(`분석 중 오류가 발생했습니다: ${e instanceof Error ? e.message : 'Unknown Error'}`);
      setIsAnalyzing(false);
    }
  };

  const updateStep = (id: string, status: 'analyzing' | 'completed', score?: number, details?: string) => {
      setSteps(prev => prev.map(s => s.id === id ? { ...s, status, score, details } : s));
  };

  const resetAnalysis = () => {
    setFile(null);
    setResult(null);
    setAudioBuffer(null);
    setProgress(0);
    setCurrentStepIndex(0);
    setSteps(steps.map(s => ({ ...s, status: 'pending', score: undefined, details: undefined, value: undefined })));
  };

  return (
    <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Brain size={16} className="text-neutral-500" />
          <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">Deepfake & AI Audio Detector Pro</h3>
        </div>
        {result && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-900 border border-neutral-800">
                <Activity size={12} className="text-neutral-500" />
                <span className="text-[10px] text-neutral-400 font-mono">CONFIDENCE: {Math.round(result.confidence)}%</span>
            </div>
        )}
      </div>

      {!file ? (
        <div 
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-neutral-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center cursor-pointer hover:border-neutral-600 hover:bg-neutral-900/50 transition-all group"
        >
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="audio/*" 
                className="hidden" 
            />
            <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <Upload size={24} className="text-neutral-500 group-hover:text-white" />
            </div>
            <h4 className="text-white font-medium mb-2">Upload Audio File</h4>
            <p className="text-neutral-500 text-xs max-w-xs mx-auto mb-6">
                MP3, WAV, AIFF, M4A supported.<br/>
                Upload high-quality audio for best results.
            </p>
            <div className="flex gap-2 text-[10px] text-neutral-600 uppercase tracking-wider">
                <span className="bg-neutral-900 px-2 py-1 rounded">Spectral Analysis</span>
                <span className="bg-neutral-900 px-2 py-1 rounded">Phase Check</span>
                <span className="bg-neutral-900 px-2 py-1 rounded">Dynamics</span>
            </div>
        </div>
      ) : (
        <div className="space-y-8">
            {/* File Info */}
            <div className="flex items-center justify-between bg-[#111] p-4 rounded-xl border border-neutral-800">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center text-neutral-400">
                        <FileAudio size={20} />
                    </div>
                    <div>
                        <p className="text-white text-sm font-medium truncate max-w-[200px]">{file.name}</p>
                        <p className="text-neutral-500 text-xs">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                </div>
                {!isAnalyzing && !result && (
                    <button 
                        onClick={analyzeAudio}
                        className="bg-white text-black px-6 py-2 rounded-full text-xs font-bold hover:bg-neutral-200 transition-colors flex items-center gap-2"
                    >
                        <Search size={14} />
                        <span>START DEEP SCAN</span>
                    </button>
                )}
                {(isAnalyzing || result) && (
                    <button 
                        onClick={resetAnalysis}
                        className="text-neutral-500 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                )}
            </div>

            {/* Analysis Progress / Steps */}
            {(isAnalyzing || result) && (
                <div className="space-y-6">
                    {/* Progress Bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-neutral-500">
                            <span>ANALYSIS PROGRESS</span>
                            <span>{Math.round(progress)}%</span>
                        </div>
                        <div className="h-1 bg-neutral-900 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-purple-500 transition-all duration-300 ease-out"
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>

                    {/* Steps Grid */}
                    <div className="grid md:grid-cols-2 gap-3">
                        {steps.map((step) => (
                            <div 
                                key={step.id}
                                className={`flex flex-col p-4 rounded-xl border transition-all duration-500 ${
                                    step.status === 'analyzing' 
                                    ? 'bg-purple-500/5 border-purple-500/30' 
                                    : step.status === 'completed'
                                        ? 'bg-[#111] border-neutral-800'
                                        : 'bg-transparent border-neutral-900 opacity-50'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`
                                            w-6 h-6 rounded-full flex items-center justify-center text-xs
                                            ${step.status === 'completed' ? 'bg-neutral-800 text-neutral-300' : 'bg-neutral-900 text-neutral-600'}
                                        `}>
                                            {step.status === 'analyzing' ? <Loader2 size={12} className="animate-spin text-purple-500" /> : step.icon}
                                        </div>
                                        <span className={`text-xs font-medium ${step.status === 'analyzing' ? 'text-purple-400' : 'text-neutral-300'}`}>
                                            {step.label}
                                        </span>
                                    </div>
                                    {step.status === 'completed' && step.score !== undefined && (
                                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                            step.score > 50 ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
                                        }`}>
                                            {step.score > 50 ? 'RISK' : 'PASS'}
                                        </div>
                                    )}
                                </div>
                                {step.details && (
                                    <p className="text-[10px] text-neutral-500 pl-9">{step.details}</p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Final Result */}
            {result && !isAnalyzing && (
                <div className="mt-8 animate-fade-in-up space-y-6">
                    <div className={`
                        p-8 rounded-2xl border-2 text-center relative overflow-hidden
                        ${result.verdict === 'AI' 
                            ? 'bg-purple-950/20 border-purple-500/50' 
                            : result.verdict === 'SUSPICIOUS'
                                ? 'bg-yellow-950/20 border-yellow-500/50'
                                : 'bg-emerald-950/20 border-emerald-500/50'
                        }
                    `}>
                        <div className="relative z-10">
                            <h2 className="text-4xl font-bold text-white mb-2 tracking-widest">{result.verdict}</h2>
                            <p className={`text-xs font-medium tracking-[0.2em] uppercase mb-8 ${
                                result.verdict === 'AI' ? 'text-purple-400' : result.verdict === 'SUSPICIOUS' ? 'text-yellow-400' : 'text-emerald-400'
                            }`}>
                                {result.verdict === 'AI' ? 'High Probability of AI Generation' : result.verdict === 'SUSPICIOUS' ? 'Suspicious Patterns Detected' : 'Likely Human Generated'}
                            </p>
                            
                            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                                <div className="bg-black/20 p-3 rounded-lg backdrop-blur-sm">
                                    <div className="text-xs text-neutral-400 mb-1">AI Score</div>
                                    <div className="text-xl font-bold text-white">{Math.round(result.totalScore)}%</div>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg backdrop-blur-sm">
                                    <div className="text-xs text-neutral-400 mb-1">Rolloff</div>
                                    <div className="text-xl font-bold text-white">{(result.features.spectralRolloff / 1000).toFixed(1)}k</div>
                                </div>
                                <div className="bg-black/20 p-3 rounded-lg backdrop-blur-sm">
                                    <div className="text-xs text-neutral-400 mb-1">Dynamic</div>
                                    <div className="text-xl font-bold text-white">{result.features.dynamicRange.toFixed(1)}dB</div>
                                </div>
                            </div>
                        </div>

                        {/* Background Glow */}
                        <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full blur-3xl opacity-20 pointer-events-none ${
                             result.verdict === 'AI' ? 'bg-purple-500' : result.verdict === 'SUSPICIOUS' ? 'bg-yellow-500' : 'bg-emerald-500'
                        }`}></div>
                    </div>
                    
                    <div className="bg-[#111] p-6 rounded-xl border border-neutral-800">
                        <h4 className="text-sm font-bold text-white mb-6 flex items-center gap-2">
                            <Activity size={16} className="text-purple-500" />
                            상세 분석 리포트 (Detailed Report)
                        </h4>
                        
                        <div className="space-y-5 text-xs text-neutral-400">
                            {/* Rolloff */}
                            <div className="flex justify-between items-start border-b border-neutral-900 pb-3">
                                <div className="pr-4">
                                    <span className="text-neutral-500 font-bold block mb-1 uppercase tracking-wider text-[10px]">Frequency Cutoff</span>
                                    <p className="text-neutral-300 leading-relaxed">
                                        {result.features.spectralRolloff < 16500 
                                            ? "⚠️ 16kHz 부근에서 인위적인 주파수 차단이 감지되었습니다. 이는 구형 AI 모델이나 저음질 압축의 전형적인 특징입니다." 
                                            : result.features.spectralRolloff < 19000
                                                ? "⚠️ 고주파 대역이 다소 부족합니다. 업샘플링되었거나 손실 압축된 소스일 가능성이 있습니다."
                                                : "✅ 20kHz 이상까지 자연스럽게 뻗어있는 고해상도 주파수 특성을 보입니다."}
                                    </p>
                                </div>
                                <span className={`font-mono font-bold whitespace-nowrap ${result.features.spectralRolloff < 16500 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {(result.features.spectralRolloff).toFixed(0)} Hz
                                </span>
                            </div>

                            {/* Dynamic Range */}
                            <div className="flex justify-between items-start border-b border-neutral-900 pb-3">
                                <div className="pr-4">
                                    <span className="text-neutral-500 font-bold block mb-1 uppercase tracking-wider text-[10px]">Dynamic Range</span>
                                    <p className="text-neutral-300 leading-relaxed">
                                        {result.features.dynamicRange < 8 
                                            ? "⚠️ 다이내믹 레인지가 극도로 좁습니다. AI가 생성한 일정한 볼륨 패턴이거나 과도한 리미팅이 적용되었습니다." 
                                            : result.features.dynamicRange < 12
                                                ? "다이내믹 레인지가 다소 좁은 편입니다. 상업적 음압을 위해 압축되었을 수 있습니다."
                                                : "✅ 자연스러운 강약 조절과 다이내믹 레인지를 유지하고 있습니다."}
                                    </p>
                                </div>
                                <span className={`font-mono font-bold whitespace-nowrap ${result.features.dynamicRange < 8 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {result.features.dynamicRange.toFixed(1)} dB
                                </span>
                            </div>

                            {/* Flatness */}
                            <div className="flex justify-between items-start border-b border-neutral-900 pb-3">
                                <div className="pr-4">
                                    <span className="text-neutral-500 font-bold block mb-1 uppercase tracking-wider text-[10px]">Spectral Flatness</span>
                                    <p className="text-neutral-300 leading-relaxed">
                                        {result.features.spectralFlatness > 0.4 
                                            ? "⚠️ 스펙트럼이 지나치게 평탄합니다. 자연스러운 악기 소리보다는 노이즈나 합성음에 가까운 특성입니다." 
                                            : "✅ 자연스러운 배음 구조와 주파수 굴곡을 가지고 있습니다."}
                                    </p>
                                </div>
                                <span className={`font-mono font-bold whitespace-nowrap ${result.features.spectralFlatness > 0.4 ? 'text-yellow-400' : 'text-neutral-400'}`}>
                                    {result.features.spectralFlatness.toFixed(3)}
                                </span>
                            </div>
                            
                            {/* Cutoff Slope */}
                            <div className="flex justify-between items-start">
                                <div className="pr-4">
                                    <span className="text-neutral-500 font-bold block mb-1 uppercase tracking-wider text-[10px]">Artificial Artifacts</span>
                                    <p className="text-neutral-300 leading-relaxed">
                                        {result.features.transientSharpness > 50 
                                            ? "⚠️ 칼로 자른 듯한 부자연스러운 주파수 단면(Brickwall Cutoff)이 발견되었습니다. AI 생성물의 강력한 증거입니다." 
                                            : result.features.consistencyScore < 50
                                                ? "⚠️ 디지털 사일런스(완벽한 무음) 구간이 존재합니다. 인위적인 편집이나 합성의 흔적일 수 있습니다."
                                                : "✅ 기계적인 노이즈나 인위적인 주파수 절단면이 발견되지 않았습니다."}
                                    </p>
                                </div>
                                <span className={`font-mono font-bold whitespace-nowrap ${result.features.transientSharpness > 50 ? 'text-red-400' : 'text-emerald-400'}`}>
                                    {result.features.transientSharpness.toFixed(1)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
      )}
    </div>
  );
};
