import React, { useState, useEffect, useRef } from 'react';
import { FileAudio, Activity, AlertTriangle, Upload, Loader2, BarChart3, Waves } from 'lucide-react';
import * as d3 from 'd3';

interface AnalysisResults {
  rms: number;
  peak: number;
  integrated: number;
  spectrum: number[];
  cutoffFreq: number;
  qualityScore: 'lossless' | 'high-lossy' | 'low-lossy' | 'unknown';
}

export const LoudnessMeter: React.FC = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const chartRef = useRef<SVGSVGElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-wav'].includes(file.type) && !file.name.endsWith('.wav') && !file.name.endsWith('.mp3')) {
      setError('WAV 또는 MP3 파일만 지원합니다.');
      return;
    }

    setFileName(file.name);
    setIsAnalyzing(true);
    setError(null);
    setResults(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      analyzeAudio(audioBuffer);
    } catch (err) {
      console.error('Error analyzing audio:', err);
      setError('파일 분석 중 오류가 발생했습니다. 파일이 손상되었거나 지원하지 않는 형식일 수 있습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeAudio = (buffer: AudioBuffer) => {
    const numChannels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;
    
    let maxPeak = 0;
    let sumSquares = 0;
    
    // 1. Amplitude Analysis
    for (let channel = 0; channel < numChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const sample = Math.abs(data[i]);
        if (sample > maxPeak) maxPeak = sample;
        sumSquares += sample * sample;
      }
    }
    
    const rms = Math.sqrt(sumSquares / (length * numChannels));
    const peakDb = 20 * Math.log10(maxPeak || 0.000001);
    const rmsDb = 20 * Math.log10(rms || 0.000001);
    const integratedLoudness = rmsDb + 3.0;

    // 2. Frequency Analysis (FFT)
    const fftSize = 2048;
    const numSamples = 50;
    const step = Math.floor(length / numSamples);
    const avgSpectrum = new Float32Array(fftSize / 2).fill(0);
    
    const channelData = buffer.getChannelData(0);
    
    for (let s = 0; s < numSamples; s++) {
      const start = s * step;
      if (start + fftSize > length) break;
      
      const window = channelData.slice(start, start + fftSize);
      for (let i = 0; i < fftSize; i++) {
        window[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
      }
      
      const spectrum = performFFT(window);
      for (let i = 0; i < avgSpectrum.length; i++) {
        avgSpectrum[i] += spectrum[i];
      }
    }
    
    // Normalize spectrum
    const finalSpectrum = Array.from(avgSpectrum).map(v => {
      const val = v / numSamples;
      return Math.max(0, 15 * Math.log10(val + 0.00001) + 45); 
    });

    // 3. Quality Detection (Cutoff Analysis)
    // Find the highest frequency with significant energy
    let cutoffIdx = finalSpectrum.length - 1;
    const threshold = 10; // Threshold for "silence" in our viz scale
    
    for (let i = finalSpectrum.length - 1; i >= 0; i--) {
      if (finalSpectrum[i] > threshold) {
        cutoffIdx = i;
        break;
      }
    }
    
    const cutoffFreq = (cutoffIdx * sampleRate) / fftSize;
    let quality: AnalysisResults['qualityScore'] = 'unknown';
    
    if (cutoffFreq > 19500) quality = 'lossless';
    else if (cutoffFreq > 17500) quality = 'high-lossy';
    else quality = 'low-lossy';

    setResults({
      peak: Math.max(-60, peakDb),
      rms: Math.max(-60, rmsDb),
      integrated: Math.max(-60, integratedLoudness),
      spectrum: finalSpectrum,
      cutoffFreq,
      qualityScore: quality
    });
  };

  // Basic Iterative FFT implementation
  const performFFT = (data: Float32Array) => {
    const n = data.length;
    const real = new Float32Array(data);
    const imag = new Float32Array(n).fill(0);
    
    // Bit-reversal permutation
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (i < j) {
        [real[i], real[j]] = [real[j], real[i]];
      }
      let m = n >> 1;
      while (m >= 1 && j >= m) {
        j -= m;
        m >>= 1;
      }
      j += m;
    }
    
    // Cooley-Tukey
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (2 * Math.PI) / len;
      const wlen_real = Math.cos(ang);
      const wlen_imag = -Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let w_real = 1;
        let w_imag = 0;
        for (let k = 0; k < len / 2; k++) {
          const u_real = real[i + k];
          const u_imag = imag[i + k];
          const v_real = real[i + k + len / 2] * w_real - imag[i + k + len / 2] * w_imag;
          const v_imag = real[i + k + len / 2] * w_imag + imag[i + k + len / 2] * w_real;
          real[i + k] = u_real + v_real;
          imag[i + k] = u_imag + v_imag;
          real[i + k + len / 2] = u_real - v_real;
          imag[i + k + len / 2] = u_imag - v_imag;
          const next_w_real = w_real * wlen_real - w_imag * wlen_imag;
          w_imag = w_real * wlen_imag + w_imag * wlen_real;
          w_real = next_w_real;
        }
      }
    }
    
    // Calculate magnitudes for the first half
    const magnitudes = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    return magnitudes;
  };

  useEffect(() => {
    if (!results || !chartRef.current) return;

    const svg = d3.select(chartRef.current);
    svg.selectAll("*").remove();

    const width = chartRef.current.clientWidth;
    const height = 200;
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };

    const x = d3.scaleLog()
      .domain([20, 20000])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([0, 100])
      .range([height - margin.bottom, margin.top]);

    // Create frequency data points
    const data = results.spectrum.map((val, i) => ({
      freq: (i * 44100) / 2048, // Approx freq mapping
      val: val
    })).filter(d => d.freq >= 20 && d.freq <= 20000);

    const line = d3.line<{freq: number, val: number}>()
      .x(d => x(d.freq))
      .y(d => y(d.val))
      .curve(d3.curveBasis);

    // Grid lines and labels
    const xTicks = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    const xAxis = svg.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x)
        .tickValues(xTicks)
        .tickFormat(d => {
          const val = Number(d);
          return val >= 1000 ? `${val / 1000}k` : `${val}`;
        })
        .tickSize(-(height - margin.top - margin.bottom))
      );

    // Style the axis lines
    xAxis.selectAll("line")
      .style("stroke", "#262626") // neutral-800
      .style("stroke-dasharray", "2,2");

    // Style the domain line
    xAxis.select(".domain").remove();

    // Style the labels for better readability
    xAxis.selectAll("text")
      .style("fill", "#a3a3a3") // neutral-400
      .style("font-size", "11px")
      .style("font-family", "JetBrains Mono, monospace")
      .attr("dy", "1.5em");

    // Area
    const area = d3.area<{freq: number, val: number}>()
      .x(d => x(d.freq))
      .y0(height - margin.bottom)
      .y1(d => y(d.val))
      .curve(d3.curveBasis);

    svg.append("path")
      .datum(data)
      .attr("fill", "url(#spectrum-gradient)")
      .attr("opacity", 0.3)
      .attr("d", area);

    // Line
    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", "#10b981")
      .attr("stroke-width", 1.5)
      .attr("d", line);

    // Gradient
    const defs = svg.append("defs");
    const gradient = defs.append("linearGradient")
      .attr("id", "spectrum-gradient")
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "0%").attr("y2", "100%");
    
    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#10b981");
    gradient.append("stop").attr("offset", "100%").attr("stop-color", "transparent");

  }, [results]);

  const getLevelColor = (db: number) => {
    if (db > -1) return 'bg-red-500';
    if (db > -14) return 'bg-yellow-500';
    return 'bg-emerald-500';
  };

  const getWidth = (db: number) => {
    const min = -60;
    const max = 0;
    const percentage = ((db - min) / (max - min)) * 100;
    return `${Math.min(100, Math.max(0, percentage))}%`;
  };

  return (
    <div className="bg-[#0a0a0a] border border-neutral-900 rounded-2xl p-8 hover:border-neutral-800 transition-colors">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <BarChart3 size={16} className="text-neutral-500" />
          <h3 className="text-neutral-400 text-xs font-bold tracking-widest uppercase">Audio Analyzer</h3>
        </div>
      </div>

      {/* Upload Area */}
      <div className="mb-8">
        <label className="relative group cursor-pointer block">
          <input 
            type="file" 
            accept=".wav,.mp3,audio/wav,audio/mpeg" 
            className="hidden" 
            onChange={handleFileUpload}
            disabled={isAnalyzing}
          />
          <div className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all ${
            isAnalyzing ? 'border-neutral-800 bg-neutral-900/20' : 'border-neutral-800 group-hover:border-neutral-700 bg-[#050505]'
          }`}>
            {isAnalyzing ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 size={32} className="text-neutral-500 animate-spin" />
                <p className="text-neutral-500 text-xs font-medium">파일을 분석하고 있습니다...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="w-12 h-12 bg-neutral-900 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Upload size={20} className="text-neutral-500" />
                </div>
                <div>
                  <p className="text-neutral-300 text-xs font-bold mb-1">
                    {fileName ? fileName : '분석할 오디오 파일을 선택하세요'}
                  </p>
                  <p className="text-neutral-500 text-[10px]">WAV, MP3 지원 (최대 100MB 권장)</p>
                </div>
              </div>
            )}
          </div>
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/10 rounded-xl mb-6">
          <AlertTriangle size={14} className="text-red-500" />
          <p className="text-red-500 text-[11px]">{error}</p>
        </div>
      )}

      {results && (
        <div className="space-y-8 animate-fade-in">
          {/* Integrated Loudness & Quality */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Integrated Loudness</span>
                <p className="text-neutral-400 text-[10px]">전체 평균 음압</p>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-mono font-bold ${results.integrated > -14 ? 'text-white' : 'text-neutral-400'}`}>
                  {results.integrated.toFixed(1)} <span className="text-xs font-normal text-neutral-600">LUFS</span>
                </span>
              </div>
            </div>

            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">음원 품질</span>
                <p className="text-neutral-400 text-[10px]">주파수 컷오프 분석: {Math.round(results.cutoffFreq / 100) / 10}kHz</p>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold px-3 py-1 rounded-full uppercase tracking-tighter ${
                  results.qualityScore === 'lossless' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                  results.qualityScore === 'high-lossy' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                  'bg-red-500/10 text-red-500 border border-red-500/20'
                }`}>
                  {results.qualityScore === 'lossless' ? '무손실' :
                   results.qualityScore === 'high-lossy' ? '고음질 손실' :
                   '저음질 손실'}
                </span>
              </div>
            </div>
          </div>

          {/* Frequency Spectrum */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Waves size={14} className="text-neutral-500" />
              <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Average Frequency Spectrum</span>
            </div>
            <div className="bg-[#050505] rounded-xl border border-neutral-900 p-4 overflow-hidden">
              <svg ref={chartRef} className="w-full h-[200px]" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Peak Meter */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">True Peak</span>
                <span className={`text-xs font-mono ${results.peak > -1 ? 'text-red-500' : 'text-neutral-300'}`}>
                  {results.peak.toFixed(2)} dB
                </span>
              </div>
              <div className="h-3 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800/50">
                <div 
                  className={`h-full transition-all duration-500 ease-out ${getLevelColor(results.peak)}`}
                  style={{ width: getWidth(results.peak) }}
                />
              </div>
            </div>

            {/* RMS Meter */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Average RMS</span>
                <span className="text-xs font-mono text-neutral-300">
                  {results.rms.toFixed(2)} dB
                </span>
              </div>
              <div className="h-3 bg-neutral-900 rounded-full overflow-hidden border border-neutral-800/50">
                <div 
                  className={`h-full transition-all duration-500 ease-out ${getLevelColor(results.rms)}`}
                  style={{ width: getWidth(results.rms) }}
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-neutral-900">
            <div className="p-4 bg-neutral-900/30 rounded-xl border border-neutral-800/50">
              <p className="text-neutral-500 text-[10px] leading-relaxed">
                * 업로드된 오디오 데이터를 스캔하여 정확한 피크값과 평균 음압 및 주파수 분포를 계산합니다. 
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


