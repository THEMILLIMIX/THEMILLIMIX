import React, { useState, useEffect, useRef } from 'react';

const App: React.FC = () => {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const visualizerRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      source.connect(analyser);
      analyser.fftSize = 256;
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      setIsListening(true);
      setError(null);
      visualize();
    } catch (err) {
      setError('마이크에 접근할 수 없습니다. 권한을 확인해주세요.');
      console.error('Error accessing microphone:', err);
    }
  };

  const stopMic = () => {
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsListening(false);
  };

  const visualize = () => {
    if (!analyserRef.current || !visualizerRef.current) return;

    const canvas = visualizerRef.current;
    const canvasCtx = canvas.getContext('2d');
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      if (!canvasCtx) return;

      canvasCtx.fillStyle = 'rgb(17 24 39)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

      const barWidth = (canvas.width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i];
        canvasCtx.fillStyle = `rgb(50, ${barHeight + 100}, 50)`;
        canvasCtx.fillRect(x, canvas.height - barHeight / 2, barWidth, barHeight / 2);
        x += barWidth + 1;
      }
    };

    draw();
  };

  useEffect(() => {
    return () => {
      stopMic();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-gray-800 rounded-2xl shadow-lg p-8 space-y-6">
        <h1 className="text-4xl font-bold text-center text-green-400">Live 마이크 체크</h1>
        <p className="text-center text-gray-400">Anydesk 원격 지원을 위한 마이크 설정 도우미</p>
        
        <div className="bg-gray-900 rounded-lg p-4 h-64 flex items-center justify-center">
          <canvas ref={visualizerRef} className="w-full h-full" />
        </div>

        {error && <p className="text-red-500 text-center">{error}</p>}

        <div className="flex justify-center space-x-4">
          {!isListening ? (
            <button 
              onClick={startMic} 
              className="px-8 py-3 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors duration-300"
            >
              마이크 시작
            </button>
          ) : (
            <button 
              onClick={stopMic} 
              className="px-8 py-3 bg-red-500 text-white font-semibold rounded-lg hover:bg-red-600 transition-colors duration-300"
            >
              마이크 중지
            </button>
          )}
        </div>

        <div className="text-sm text-gray-500 text-center pt-4">
          <p>마이크가 정상적으로 작동하면 위 영역에 시각적인 파형이 표시됩니다.</p>
          <p>문제가 지속되면 시스템의 마이크 설정을 확인해주세요.</p>
        </div>
      </div>
    </div>
  );
};

export default App;
