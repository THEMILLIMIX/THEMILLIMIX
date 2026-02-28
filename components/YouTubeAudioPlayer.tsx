import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Music } from 'lucide-react';

export const YouTubeAudioPlayer: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const playerRef = useRef<any>(null);
  const containerId = 'youtube-player-container';

  useEffect(() => {
    // Load YouTube IFrame API
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      playerRef.current = new (window as any).YT.Player(containerId, {
        height: '1', // Must be non-zero for some browsers
        width: '1',
        videoId: '3V-pYCGx0C4',
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          origin: window.location.origin, // Important for security
        },
        events: {
          onReady: () => setIsReady(true),
          onStateChange: (event: any) => {
            if (event.data === (window as any).YT.PlayerState.PLAYING) {
              setIsPlaying(true);
            } else {
              setIsPlaying(false);
            }
          },
          onError: (e: any) => {
            console.error('YouTube Player Error:', e);
          }
        },
      });
    };

    if ((window as any).YT && (window as any).YT.Player) {
      initPlayer();
    } else {
      (window as any).onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      // Clean up if needed, but usually destroying player on unmount is enough
      // However, with strict mode in React 18, double invocation might cause issues
      // if not handled carefully. For this simple case, we'll keep it simple.
    };
  }, []);

  const togglePlay = () => {
    if (!playerRef.current || !isReady) return;
    
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
  };

  return (
    <div className="fixed bottom-8 left-8 z-50">
      <div className="bg-[#111] border border-neutral-800 rounded-full p-2 flex items-center gap-3 shadow-2xl backdrop-blur-xl">
        <div id={containerId} className="hidden"></div>
        
        <div className="flex items-center gap-3 pl-2 pr-1">
          <div className={`p-2 rounded-full ${isPlaying ? 'bg-emerald-500/10 text-emerald-500' : 'bg-neutral-900 text-neutral-500'}`}>
            <Music size={14} className={isPlaying ? 'animate-pulse' : ''} />
          </div>
          
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest leading-none">Background</span>
            <span className="text-[9px] text-neutral-600 font-medium">3V-pYCGx0C4</span>
          </div>

          <button
            onClick={togglePlay}
            disabled={!isReady}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
              isPlaying 
                ? 'bg-white text-black hover:scale-105' 
                : 'bg-neutral-800 text-white hover:bg-neutral-700'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
