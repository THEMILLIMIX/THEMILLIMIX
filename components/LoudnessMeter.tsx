import React, { useState, useEffect, useRef } from 'react';
import { FileAudio, Activity, AlertTriangle, Upload, Loader2, BarChart3, Waves } from 'lucide-react';
import * as d3 from 'd3';

interface SpectrogramData {
  left: Uint8Array;
  right: Uint8Array | null;
  width: number;
  height: number;
}

interface AnalysisResults {
  rms: number;
  peak: number;
  integrated: number;
  shortTerm: number;
  spectrogram: SpectrogramData;
  cutoffFreq: number;
  qualityScore: 'lossless' | 'high-lossy' | 'low-lossy' | 'unknown';
  bitrate: number;
  sampleRate: number;
  channels: number;
  formatDescription: string;
  phaseCorrelation: number;
  isClipping: boolean;
}

export const LoudnessMeter: React.FC = () => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResults | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getFormatDescription = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'wav': return 'WAV : 무압축 무손실';
      case 'mp3': return 'MP3 : 손실 압축';
      case 'flac': return 'FLAC : 무손실 압축';
      case 'm4a': return 'M4A : 손실 압축';
      case 'alac': return 'ALAC : 무손실 압축';
      default: return 'Unknown Format';
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validExtensions = ['wav', 'mp3', 'flac', 'm4a', 'alac'];
    const fileExt = file.name.split('.').pop()?.toLowerCase();

    if (!fileExt || !validExtensions.includes(fileExt)) {
      setError('지원하지 않는 파일 형식입니다. (WAV, MP3, FLAC, M4A, ALAC 지원)');
      return;
    }

    setFileName(file.name);
    setIsAnalyzing(true);
    setError(null);
    setResults(null);

    // Allow UI to update before heavy processing
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      await analyzeAudio(audioBuffer, file.size, getFormatDescription(file.name));
    } catch (err) {
      console.error('Error analyzing audio:', err);
      setError('파일 분석 중 오류가 발생했습니다. 파일이 손상되었거나 브라우저에서 지원하지 않는 형식일 수 있습니다.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeAudio = async (buffer: AudioBuffer, fileSize: number, formatDescription: string) => {
    try {
      const numChannels = buffer.numberOfChannels;
      const length = buffer.length;
      const sampleRate = buffer.sampleRate;
      const duration = buffer.duration;
      
      const bitrate = Math.round((fileSize * 8) / duration / 1000);
      const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

      // --- ITU-R BS.1770-4 Implementation ---

      // 1. K-Weighting Filter Coefficients
      const applyKWeighting = (channelData: Float32Array): Float32Array => {
        const output = new Float32Array(channelData.length);
        
        // Coefficients for 48kHz (Standard)
        let a0 = 1.0, a1 = -1.69065929318241, a2 = 0.73248077421585;
        let b0 = 1.53512485958697, b1 = -2.69169618940638, b2 = 1.19839281085285;
        
        if (Math.abs(sampleRate - 44100) < 1000) {
           // Coefficients for 44.1kHz
           a1 = -1.66365511325602; a2 = 0.71259542807323;
           b0 = 1.56252873860534; b1 = -2.64758836750346; b2 = 1.13398934399769;
        }

        // Apply Stage 1 (High-shelf)
        const stage1 = new Float32Array(channelData.length);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < channelData.length; i++) {
          const x0 = channelData[i];
          const y0 = b0*x0 + b1*x1 + b2*x2 - a1*y1 - a2*y2;
          stage1[i] = y0;
          x2 = x1; x1 = x0;
          y2 = y1; y1 = y0;
        }

        // Coefficients for Stage 2 (High-pass)
        let a0_hp = 1.0, a1_hp = -1.99004745483398, a2_hp = 0.99007225036621;
        let b0_hp = 1.0, b1_hp = -2.0, b2_hp = 1.0;
        
        if (Math.abs(sampleRate - 44100) < 1000) {
            a1_hp = -1.98916967448773; a2_hp = 0.98920197637845;
        }

        // Apply Stage 2
        x1 = 0; x2 = 0; y1 = 0; y2 = 0;
        for (let i = 0; i < stage1.length; i++) {
          const x0 = stage1[i];
          const y0 = b0_hp*x0 + b1_hp*x1 + b2_hp*x2 - a1_hp*y1 - a2_hp*y2;
          output[i] = y0;
          x2 = x1; x1 = x0;
          y2 = y1; y1 = y0;
        }
        
        return output;
      };

      // Process channels
      const channels = [];
      for (let i = 0; i < numChannels; i++) {
        channels.push(applyKWeighting(buffer.getChannelData(i)));
        await yieldToMain();
      }

      // 2. Gated Loudness Calculation (Integrated)
      const blockSize = Math.floor(0.4 * sampleRate);
      const stepSize = Math.floor(0.1 * sampleRate);
      const numBlocks = Math.floor((length - blockSize) / stepSize);
      
      const blockEnergies: number[] = [];
      
      // Process blocks in chunks
      const blockChunkSize = 2000;
      for (let b = 0; b < numBlocks; b += blockChunkSize) {
        const endBlock = Math.min(b + blockChunkSize, numBlocks);
        
        for (let currentBlock = b; currentBlock < endBlock; currentBlock++) {
          const start = currentBlock * stepSize;
          let sumEnergy = 0;
          
          for (let ch = 0; ch < numChannels; ch++) {
            let channelSum = 0;
            const data = channels[ch];
            for (let i = 0; i < blockSize; i++) {
              const sample = data[start + i];
              channelSum += sample * sample;
            }
            sumEnergy += channelSum; 
          }
          
          const meanSquare = sumEnergy / blockSize;
          const loudness = -0.691 + 10 * Math.log10(meanSquare || 1e-10);
          blockEnergies.push(loudness);
        }
        await yieldToMain();
      }

      // Absolute Gating (-70 LKFS)
      const absoluteThreshold = -70;
      const blocksAboveAbsolute = blockEnergies.filter(l => l > absoluteThreshold);
      
      // Calculate relative threshold
      let relativeThreshold = -70;
      if (blocksAboveAbsolute.length > 0) {
          let sumPower = 0;
          for (const l of blocksAboveAbsolute) {
              sumPower += Math.pow(10, (l + 0.691) / 10);
          }
          const avgLoudness = -0.691 + 10 * Math.log10(sumPower / blocksAboveAbsolute.length);
          relativeThreshold = avgLoudness - 10;
      }

      // Apply Relative Gate
      const finalBlocks = blockEnergies.filter(l => l > relativeThreshold && l > absoluteThreshold);
      
      let integratedLoudness = -70;
      if (finalBlocks.length > 0) {
          let sumPower = 0;
          for (const l of finalBlocks) {
              sumPower += Math.pow(10, (l + 0.691) / 10);
          }
          integratedLoudness = -0.691 + 10 * Math.log10(sumPower / finalBlocks.length);
      }

      // 3. Short-term Loudness (3s window)
      const shortTermWindowBlocks = 30; // 30 * 100ms = 3s
      let maxShortTerm = -70;
      
      const blockPowers = blockEnergies.map(l => Math.pow(10, (l + 0.691) / 10));
      
      for (let i = 0; i <= blockPowers.length - shortTermWindowBlocks; i++) {
          let sumWindow = 0;
          for (let j = 0; j < shortTermWindowBlocks; j++) {
              sumWindow += blockPowers[i + j];
          }
          const stLoudness = -0.691 + 10 * Math.log10(sumWindow / shortTermWindowBlocks);
          if (stLoudness > maxShortTerm) maxShortTerm = stLoudness;
      }

      await yieldToMain();

      // 4. True Peak (Simplified 4x Oversampling)
      let maxTruePeak = 0;
      let isClipping = false;
      
      const tpChunkSize = 200000;
      for (let ch = 0; ch < numChannels; ch++) {
          const data = buffer.getChannelData(ch);
          for (let i = 0; i < length; i += tpChunkSize) {
              const end = Math.min(i + tpChunkSize, length);
              for (let j = i; j < end; j++) {
                  const abs = Math.abs(data[j]);
                  if (abs > maxTruePeak) maxTruePeak = abs;
                  
                  // Check for inter-sample peaks only if significant
                  if (abs > 0.5 && j > 1 && j < length - 2) {
                      // Cubic interpolation
                      const y0 = data[j-1];
                      const y1 = data[j];
                      const y2 = data[j+1];
                      const y3 = data[j+2];
                      
                      // Check at offset 0.5
                      const a = -0.5*y0 + 1.5*y1 - 1.5*y2 + 0.5*y3;
                      const b = y0 - 2.5*y1 + 2*y2 - 0.5*y3;
                      const c = -0.5*y0 + 0.5*y2;
                      const d = y1;
                      
                      const t = 0.5;
                      const val = Math.abs(a*t*t*t + b*t*t + c*t + d);
                      if (val > maxTruePeak) maxTruePeak = val;
                  }
              }
              await yieldToMain();
          }
      }
      
      if (maxTruePeak >= 1.0) isClipping = true;
      const peakDb = 20 * Math.log10(maxTruePeak || 1e-10);

      // 5. Phase Correlation
      let phaseCorrelation = 0;
      if (numChannels >= 2) {
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        let sumLR = 0;
        let sumLL = 0;
        let sumRR = 0;
        
        const pcChunkSize = 200000;
        for (let i = 0; i < length; i += pcChunkSize) {
          const end = Math.min(i + pcChunkSize, length);
          for (let j = i; j < end; j++) {
            sumLR += left[j] * right[j];
            sumLL += left[j] * left[j];
            sumRR += right[j] * right[j];
          }
          await yieldToMain();
        }
        
        const denominator = Math.sqrt(sumLL * sumRR);
        if (denominator > 1e-10) {
          phaseCorrelation = sumLR / denominator;
        }
      }

      // 6. Spectrogram Generation
      const fftSize = 1024;
      const bins = fftSize / 2;
      const targetWidth = 800; // Fixed width for visualization
      const step = Math.floor(length / targetWidth);
      
      const leftSpectrogram = new Uint8Array(targetWidth * bins);
      const rightSpectrogram = numChannels >= 2 ? new Uint8Array(targetWidth * bins) : null;
      
      // Pre-calculate Hann window
      const window = new Float32Array(fftSize);
      for (let i = 0; i < fftSize; i++) {
        window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (fftSize - 1)));
      }

      const leftData = buffer.getChannelData(0);
      const rightData = numChannels >= 2 ? buffer.getChannelData(1) : null;
      
      // Accumulate for average spectrum (for quality detection)
      const avgSpectrum = new Float32Array(bins).fill(0);
      let spectrumCount = 0;

      for (let x = 0; x < targetWidth; x++) {
        const start = x * step;
        if (start + fftSize > length) break;

        // Process Left
        const leftChunk = new Float32Array(fftSize);
        for(let i=0; i<fftSize; i++) leftChunk[i] = leftData[start + i] * window[i];
        const leftMags = performFFT(leftChunk);
        
        for (let i = 0; i < bins; i++) {
          const val = leftMags[i];
          // Convert to dB and map to 0-255
          // Range: -100dB to 0dB
          const db = 20 * Math.log10(val + 1e-10);
          const norm = Math.max(0, Math.min(255, (db + 100) * 2.55));
          leftSpectrogram[x * bins + (bins - 1 - i)] = norm; // Store inverted Y for easier drawing
          
          avgSpectrum[i] += val;
        }

        // Process Right if exists
        if (rightData && rightSpectrogram) {
          const rightChunk = new Float32Array(fftSize);
          for(let i=0; i<fftSize; i++) rightChunk[i] = rightData[start + i] * window[i];
          const rightMags = performFFT(rightChunk);
          
          for (let i = 0; i < bins; i++) {
            const val = rightMags[i];
            const db = 20 * Math.log10(val + 1e-10);
            const norm = Math.max(0, Math.min(255, (db + 100) * 2.55));
            rightSpectrogram[x * bins + (bins - 1 - i)] = norm;
            
             avgSpectrum[i] += val;
          }
        }
        
        spectrumCount += (numChannels >= 2 ? 2 : 1);

        if (x % 50 === 0) await yieldToMain();
      }

      // 7. Quality Detection (using average spectrum)
      const finalSpectrum = Array.from(avgSpectrum).map(v => {
        const val = v / spectrumCount;
        return 20 * Math.log10(val + 1e-10);
      });

      let cutoffIdx = bins - 1;
      const specThreshold = -60; // dB threshold
      for (let i = bins - 1; i >= 0; i--) {
        if (finalSpectrum[i] > specThreshold) {
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
        peak: Math.max(-120, peakDb),
        rms: Math.max(-120, integratedLoudness),
        integrated: Math.max(-120, integratedLoudness),
        shortTerm: Math.max(-120, maxShortTerm),
        spectrogram: {
          left: leftSpectrogram,
          right: rightSpectrogram,
          width: targetWidth,
          height: bins
        },
        cutoffFreq,
        qualityScore: quality,
        bitrate,
        sampleRate,
        channels: numChannels,
        formatDescription,
        phaseCorrelation,
        isClipping
      });
    } catch (e) {
      console.error("Analysis failed", e);
      setError("분석 중 오류가 발생했습니다. 파일이 너무 크거나 손상되었을 수 있습니다.");
    }
  };

  // Optimized FFT
  const performFFT = (inputData: Float32Array): Float32Array => {
    const n = inputData.length;
    const m = Math.log2(n);
    
    // Precompute bit reversal table if needed, but for now simple swap
    const real = new Float32Array(inputData);
    const imag = new Float32Array(n).fill(0);

    // Bit reversal
    let j = 0;
    for (let i = 0; i < n - 1; i++) {
      if (i < j) {
        const tr = real[j]; real[j] = real[i]; real[i] = tr;
        const ti = imag[j]; imag[j] = imag[i]; imag[i] = ti;
      }
      let k = n >> 1;
      while (k <= j) {
        j -= k;
        k >>= 1;
      }
      j += k;
    }

    // Butterfly
    for (let l = 1; l <= m; l++) {
      const len = 1 << l;
      const halfLen = len >> 1;
      const u1 = 1.0;
      const u2 = 0.0;
      const theta = -Math.PI / halfLen;
      const w1 = Math.cos(theta);
      const w2 = Math.sin(theta);
      
      let uReal = 1.0;
      let uImag = 0.0;

      for (let j = 0; j < halfLen; j++) {
        for (let i = j; i < n; i += len) {
          const ip = i + halfLen;
          const tempReal = real[ip] * uReal - imag[ip] * uImag;
          const tempImag = real[ip] * uImag + imag[ip] * uReal;
          
          real[ip] = real[i] - tempReal;
          imag[ip] = imag[i] - tempImag;
          real[i] += tempReal;
          imag[i] += tempImag;
        }
        const tempUReal = uReal * w1 - uImag * w2;
        uImag = uReal * w2 + uImag * w1;
        uReal = tempUReal;
      }
    }

    // Magnitude
    const magnitudes = new Float32Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    return magnitudes;
  };

  useEffect(() => {
    if (!results || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const parent = canvas.parentElement;
    if (!parent) return;

    const render = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width: srcWidth, height, left, right } = results.spectrogram;
        
        // Layout constants
        const margin = { left: 30, right: 40, top: 10, bottom: 10, gap: 20 };
        const channelHeight = 200; // Fixed display height per channel
        
        // Calculate responsive width
        // Parent has p-4 (16px * 2 = 32px padding). 
        // We use parent.clientWidth which includes padding, so we subtract it to get content width.
        // However, simpler is to use getComputedStyle or just subtract a safe amount.
        const availableWidth = parent.clientWidth - 32; 
        const totalWidth = Math.max(availableWidth, 300); // Minimum width safety
        const graphWidth = totalWidth - margin.left - margin.right;
        
        const totalHeight = (results.channels >= 2 ? channelHeight * 2 + margin.gap : channelHeight) + margin.top + margin.bottom;

        // High DPI Scaling
        const dpr = window.devicePixelRatio || 1;
        canvas.width = totalWidth * dpr;
        canvas.height = totalHeight * dpr;
        canvas.style.width = `${totalWidth}px`;
        canvas.style.height = `${totalHeight}px`;

        ctx.scale(dpr, dpr);
        ctx.imageSmoothingEnabled = false; // Keep spectrogram pixelated

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        // Helper to draw a channel's spectrogram data into an ImageData object
        const createChannelImage = (src: Uint8Array) => {
            const img = new ImageData(srcWidth, height);
            const data = img.data;
            
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < srcWidth; x++) {
                    const val = src[x * height + y]; 
                    
                    // Color mapping (Magma-like palette)
                    let r=0, g=0, b=0;
                    if (val < 64) { // Black to Purple
                        r = val * 2; b = val * 4; 
                    } else if (val < 128) { // Purple to Red
                        r = 128 + (val-64)*2; b = 255 - (val-64)*4;
                    } else if (val < 192) { // Red to Yellow
                        r = 255; g = (val-128)*4;
                    } else { // Yellow to White
                        r = 255; g = 255; b = (val-192)*4;
                    }

                    const idx = (y * srcWidth + x) * 4;
                    data[idx] = r;
                    data[idx + 1] = g;
                    data[idx + 2] = b;
                    data[idx + 3] = 255;
                }
            }
            return img;
        };

        // Helper to render ImageData to canvas via temp canvas (for scaling support)
        const renderImageData = (imgData: ImageData, x: number, y: number, w: number, h: number) => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = srcWidth;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            if (tempCtx) {
                tempCtx.putImageData(imgData, 0, 0);
                ctx.drawImage(tempCanvas, 0, 0, srcWidth, height, x, y, w, h);
            }
        };

        // Draw Left Channel
        const leftImg = createChannelImage(left);
        renderImageData(leftImg, margin.left, margin.top, graphWidth, channelHeight);

        // Draw Right Channel
        if (right && results.channels >= 2) {
            const rightImg = createChannelImage(right);
            renderImageData(rightImg, margin.left, margin.top + channelHeight + margin.gap, graphWidth, channelHeight);
        }

        // Draw UI Elements (Grid, Labels)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.font = '500 12px Inter, system-ui, sans-serif'; 
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e5e5e5';

        // Draw Frequency Labels & Grid (Right Side)
        const drawFreqs = (offsetY: number) => {
            const targetFreqs = [20000, 15000, 10000, 5000];
            const nyquist = results.sampleRate / 2;

            targetFreqs.forEach(freq => {
                if (freq >= nyquist) return;

                const y = channelHeight * (1 - freq / nyquist);
                const drawY = offsetY + y;
                
                // Grid line
                ctx.beginPath();
                ctx.moveTo(margin.left, drawY);
                ctx.lineTo(margin.left + graphWidth, drawY);
                ctx.stroke();

                // Label (Outside Right)
                ctx.fillText(`${freq/1000}k`, totalWidth - 5, drawY);
            });
        };

        drawFreqs(margin.top);
        if (results.channels >= 2) {
            drawFreqs(margin.top + channelHeight + margin.gap);
        }

        // Draw Channel Labels (Left Side)
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 14px Inter, system-ui, sans-serif';
        
        // L Label
        ctx.fillText('L', margin.left / 2, margin.top + channelHeight / 2);

        // R Label
        if (results.channels >= 2) {
            ctx.fillText('R', margin.left / 2, margin.top + channelHeight + margin.gap + channelHeight / 2);
        }

        // Time Axis Grid
        const numTimeLabels = 10;
        for (let i = 0; i <= numTimeLabels; i++) {
            const x = (graphWidth / numTimeLabels) * i;
            const drawX = margin.left + x;
            
            ctx.beginPath();
            ctx.moveTo(drawX, margin.top);
            ctx.lineTo(drawX, totalHeight - margin.bottom);
            ctx.stroke();
        }
    };

    // Initial render
    render();

    // Responsive resize
    const observer = new ResizeObserver(() => {
        window.requestAnimationFrame(render);
    });
    observer.observe(parent);

    return () => observer.disconnect();

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

  const getBitrateQuality = (bitrate: number) => {
    if (bitrate >= 1000) return { text: '음질 매우 우수', color: 'text-emerald-500' };
    if (bitrate > 256) return { text: '음질 우수', color: 'text-emerald-400' };
    if (bitrate > 128) return { text: '음질 보통', color: 'text-yellow-500' };
    return { text: '음질 나쁨', color: 'text-orange-500' };
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
            accept=".wav,.mp3,.flac,.m4a,.alac,audio/*" 
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
                  <p className="text-neutral-500 text-[10px]">WAV, MP3, FLAC, M4A, ALAC 지원 (최대 100MB 권장)</p>
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
          {/* Integrated & Short-term Loudness */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Integrated LUFS</span>
                <p className="text-neutral-400 text-[10px]">전체 평균 음압 (Long-term)</p>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-mono font-bold ${results.integrated > -14 ? 'text-white' : 'text-neutral-400'}`}>
                  {results.integrated.toFixed(1)} <span className="text-xs font-normal text-neutral-600">LUFS</span>
                </span>
              </div>
            </div>

            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Short-term LUFS</span>
                <p className="text-neutral-400 text-[10px]">최대 구간 음압 (Max Short-term)</p>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-mono font-bold ${results.shortTerm > -9 ? 'text-red-500' : 'text-white'}`}>
                  {results.shortTerm.toFixed(1)} <span className="text-xs font-normal text-neutral-600">LUFS</span>
                </span>
              </div>
            </div>
          </div>

          {/* Quality & Peak */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">주파수 대역 품질</span>
                <p className="text-neutral-400 text-[10px]">주파수 컷오프 분석: {Math.round(results.cutoffFreq / 100) / 10}kHz</p>
              </div>
              <div className="text-right">
                <span className={`text-sm font-bold px-3 py-1 rounded-full uppercase tracking-tighter ${
                  results.qualityScore === 'lossless' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                  results.qualityScore === 'high-lossy' ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' :
                  'bg-red-500/10 text-red-500 border border-red-500/20'
                }`}>
                  {results.qualityScore === 'lossless' ? '주파수 무손실' :
                   results.qualityScore === 'high-lossy' ? '주파수 일부 손실' :
                   '주파수 완전 손실'}
                </span>
              </div>
            </div>

            <div className="bg-[#111] p-6 rounded-2xl border border-neutral-800 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">True Peak</span>
                <p className="text-neutral-400 text-[10px]">최대 피크 레벨</p>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-mono font-bold ${results.peak > -1.0 ? 'text-red-500' : 'text-white'}`}>
                  {results.peak.toFixed(1)} <span className="text-xs font-normal text-neutral-600">dBTP</span>
                </span>
              </div>
            </div>
          </div>

          {/* File Info: Bitrate, Sample Rate, Channels */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#111] p-4 rounded-xl border border-neutral-800 text-center">
              <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase block mb-1">Format</span>
              <span className="text-white font-mono font-bold text-xs">{results.formatDescription}</span>
            </div>
            <div className="bg-[#111] p-4 rounded-xl border border-neutral-800 text-center">
              <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase block mb-1">Bitrate</span>
              <div className="flex flex-col items-center">
                <span className="text-white font-mono font-bold">{results.bitrate} <span className="text-neutral-500 text-xs">kbps</span></span>
                <span className={`text-[10px] mt-1 font-medium ${getBitrateQuality(results.bitrate).color}`}>
                  {getBitrateQuality(results.bitrate).text}
                </span>
              </div>
            </div>
            <div className="bg-[#111] p-4 rounded-xl border border-neutral-800 text-center">
              <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase block mb-1">Sample Rate</span>
              <span className="text-white font-mono font-bold">{results.sampleRate / 1000} <span className="text-neutral-500 text-xs">kHz</span></span>
            </div>
            <div className="bg-[#111] p-4 rounded-xl border border-neutral-800 text-center relative overflow-hidden">
              <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase block mb-1">Channels</span>
              <span className="text-white font-mono font-bold block mb-2">
                {results.channels === 1 ? 'Mono' : results.channels === 2 ? 'Stereo' : `${results.channels} Ch`}
              </span>
              
              {results.channels >= 2 && (
                <div className="mt-2 pt-2 border-t border-neutral-800">
                  <div className="flex justify-between text-[9px] text-neutral-600 mb-1 px-1">
                    <span>-1</span>
                    <span>0</span>
                    <span>+1</span>
                  </div>
                  <div className="w-full h-1.5 bg-neutral-800 rounded-full relative">
                    {/* Center Marker */}
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-600 transform -translate-x-1/2"></div>
                    
                    {/* Indicator */}
                    <div 
                      className={`absolute top-0 bottom-0 w-2 h-2 -mt-0.5 rounded-full shadow-sm transition-all duration-500 ${
                        results.phaseCorrelation < 0 ? 'bg-red-500 shadow-red-500/50' : 'bg-emerald-500 shadow-emerald-500/50'
                      }`}
                      style={{ 
                        left: `${((results.phaseCorrelation + 1) / 2) * 100}%`,
                        transform: 'translateX(-50%)'
                      }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-[9px] text-neutral-500">Phase</span>
                    <span className={`text-[9px] font-mono ${results.phaseCorrelation < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {results.phaseCorrelation.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Clipping Warning */}
          {results.isClipping && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-3 animate-pulse">
              <AlertTriangle size={16} className="text-red-500" />
              <div>
                <h4 className="text-red-500 text-xs font-bold">CLIPPING DETECTED</h4>
                <p className="text-red-400/80 text-[10px]">오디오 신호가 0dBFS를 초과하여 클리핑이 발생했습니다. 볼륨을 줄이거나 리미터를 확인하세요.</p>
              </div>
            </div>
          )}

          {/* Spectrogram */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Waves size={14} className="text-neutral-500" />
              <span className="text-neutral-500 text-[10px] font-bold tracking-widest uppercase">Spectrogram</span>
            </div>
            <div className="bg-[#050505] rounded-xl border border-neutral-900 p-4 overflow-hidden">
              <canvas ref={canvasRef} className="w-full h-auto" style={{ imageRendering: 'pixelated' }} />
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
            <div className="p-4 bg-neutral-900/30 rounded-xl border border-neutral-800/50 space-y-3">
              <p className="text-neutral-500 text-[14px] leading-relaxed">
                업로드된 오디오 데이터를 스캔하여 정확한 피크값과 평균 음압 및 주파수 분포를 계산합니다. 
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-neutral-400 text-[12px] font-bold mb-1">LUFS (Loudness Units Full Scale)</h4>
                  <p className="text-neutral-400 text-[10px]">
                    사람이 실제로 느끼는 음량을 측정하는 표준 단위입니다.
                  </p>
                </div>
                <div>
                  <h4 className="text-neutral-400 text-[12px] font-bold mb-1">True Peak</h4>
                  <p className="text-neutral-400 text-[10px]">
                    디지털 샘플 사이의 실제 아날로그 피크를 예측한 값입니다.<br />
                    0dBTP를 넘으면 DAC 변환 시 클리핑(왜곡)이 발생할 수 있습니다.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
