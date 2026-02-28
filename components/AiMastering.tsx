import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, Pause, Download, Music, Settings2, Sparkles, Loader2, RefreshCw } from 'lucide-react';

export const AiMastering = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isProcessed, setIsProcessed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [preset, setPreset] = useState<'balanced' | 'warm' | 'bright' | 'punchy'>('balanced');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const originalBufferRef = useRef<AudioBuffer | null>(null);
  const processedBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessed(false);
    setIsPlaying(false);
    
    // Initialize Audio Context
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    audioContextRef.current = ctx;

    const arrayBuffer = await selectedFile.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    originalBufferRef.current = audioBuffer;
    setDuration(audioBuffer.duration);
  };

  const processAudio = async () => {
    if (!originalBufferRef.current || !audioContextRef.current) return;

    setIsProcessing(true);

    // Simulate AI Processing time
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Simple Web Audio API processing simulation
    // In a real app, this would be more complex or server-side
    const ctx = audioContextRef.current;
    const originalBuffer = originalBufferRef.current;
    
    // Create offline context for rendering
    const offlineCtx = new OfflineAudioContext(
      originalBuffer.numberOfChannels,
      originalBuffer.length,
      originalBuffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = originalBuffer;

    // Chain: Source -> EQ -> Compressor -> Limiter -> Destination
    
    // 1. EQ (BiquadFilter)
    const lowShelf = offlineCtx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 100;

    const highShelf = offlineCtx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 10000;

    // Apply presets
    switch (preset) {
      case 'warm':
        lowShelf.gain.value = 3;
        highShelf.gain.value = -2;
        break;
      case 'bright':
        lowShelf.gain.value = -2;
        highShelf.gain.value = 4;
        break;
      case 'punchy':
        lowShelf.gain.value = 4;
        highShelf.gain.value = 3;
        break;
      default: // balanced
        lowShelf.gain.value = 1;
        highShelf.gain.value = 1;
    }

    // 2. Compressor
    const compressor = offlineCtx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    // 3. Gain (Makeup)
    const gainNode = offlineCtx.createGain();
    gainNode.gain.value = 1.5; // Simple makeup gain

    source.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(compressor);
    compressor.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    source.start();

    const renderedBuffer = await offlineCtx.startRendering();
    processedBufferRef.current = renderedBuffer;
    
    setIsProcessing(false);
    setIsProcessed(true);
  };

  const togglePlay = () => {
    if (!audioContextRef.current || !processedBufferRef.current) return;

    if (isPlaying) {
      sourceNodeRef.current?.stop();
      setIsPlaying(false);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    } else {
      const ctx = audioContextRef.current;
      const source = ctx.createBufferSource();
      source.buffer = processedBufferRef.current;
      source.connect(ctx.destination);
      
      source.start(0, currentTime);
      startTimeRef.current = ctx.currentTime - currentTime;
      sourceNodeRef.current = source;
      setIsPlaying(true);

      const updateTime = () => {
        setCurrentTime(ctx.currentTime - startTimeRef.current);
        animationFrameRef.current = requestAnimationFrame(updateTime);
      };
      updateTime();

      source.onended = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      };
    }
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto animate-fade-in">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-light text-white mb-4 tracking-tight">AI Mix Mastering</h2>
        <p className="text-neutral-500 text-sm font-light">
          AI 기반의 즉각적인 마스터링 솔루션으로 당신의 음악을 완성하세요.
        </p>
      </div>

      <div className="bg-[#0a0a0a] border border-neutral-900 rounded-3xl p-8 md:p-12">
        {!file ? (
          <div className="border-2 border-dashed border-neutral-800 rounded-2xl p-12 text-center hover:border-neutral-700 transition-colors relative group">
            <input 
              type="file" 
              accept="audio/*"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="w-16 h-16 bg-neutral-900 rounded-full flex items-center justify-center mx-auto mb-6 text-neutral-500 group-hover:text-white group-hover:scale-110 transition-all duration-300">
              <Upload size={24} />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">Audio File Upload</h3>
            <p className="text-neutral-500 text-xs">WAV, MP3, AIFF supported (Max 50MB)</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* File Info */}
            <div className="flex items-center justify-between p-4 bg-neutral-900/50 rounded-xl border border-neutral-800">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-500">
                  <Music size={20} />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{file.name}</p>
                  <p className="text-xs text-neutral-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setFile(null);
                  setIsProcessed(false);
                  setIsPlaying(false);
                  setCurrentTime(0);
                }}
                className="p-2 hover:bg-neutral-800 rounded-lg text-neutral-500 hover:text-white transition-colors"
              >
                <RefreshCw size={16} />
              </button>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-2">
                  <Settings2 size={12} />
                  Mastering Style
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(['balanced', 'warm', 'bright', 'punchy'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setPreset(style)}
                      className={`p-3 rounded-xl text-xs font-medium border transition-all ${
                        preset === style 
                          ? 'bg-white text-black border-white' 
                          : 'bg-[#111] text-neutral-400 border-neutral-800 hover:border-neutral-600'
                      }`}
                    >
                      {style.charAt(0).toUpperCase() + style.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col justify-end">
                <button
                  onClick={processAudio}
                  disabled={isProcessing || isProcessed}
                  className={`w-full py-4 rounded-xl font-bold text-sm tracking-wide transition-all flex items-center justify-center gap-2 ${
                    isProcessed 
                      ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 cursor-default'
                      : isProcessing
                        ? 'bg-neutral-800 text-neutral-400 cursor-wait'
                        : 'bg-white text-black hover:bg-neutral-200'
                  }`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      AI Mastering in progress...
                    </>
                  ) : isProcessed ? (
                    <>
                      <Sparkles size={16} />
                      Mastering Complete
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Start AI Mastering
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Player */}
            {isProcessed && (
              <div className="bg-[#111] rounded-2xl p-6 border border-neutral-800 space-y-4 animate-fade-in-up">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-neutral-500 tracking-widest uppercase">Preview</span>
                  <span className="text-xs font-mono text-neutral-400">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
                
                {/* Progress Bar */}
                <div className="h-1 bg-neutral-800 rounded-full overflow-hidden cursor-pointer" onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pos = (e.clientX - rect.left) / rect.width;
                  const newTime = pos * duration;
                  setCurrentTime(newTime);
                  startTimeRef.current = (audioContextRef.current?.currentTime || 0) - newTime;
                  if (isPlaying && sourceNodeRef.current) {
                    sourceNodeRef.current.stop();
                    togglePlay(); // Restart at new time
                  }
                }}>
                  <div 
                    className="h-full bg-white relative"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" />
                  </div>
                </div>

                <div className="flex items-center justify-center gap-6 pt-2">
                  <button 
                    onClick={togglePlay}
                    className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform"
                  >
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
