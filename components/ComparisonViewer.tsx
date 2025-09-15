import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';
import { useLocalization } from '../hooks/useLocalization';

interface ComparisonViewerProps {
  beforeImage: string;
  afterImage: string;
  isMonochromeResult: boolean;
  onColorize: () => void;
  isColoring: boolean;
}

export function ComparisonViewer({ beforeImage, afterImage, isMonochromeResult, onColorize, isColoring }: ComparisonViewerProps): React.ReactElement {
  const { t } = useLocalization();
  const [sliderPosition, setSliderPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const percent = (x / rect.width) * 100;
    setSliderPosition(percent);
  }, []);
  
  const handleMouseDown = useCallback(() => { isDragging.current = true; }, []);
  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging.current) handleMove(e.clientX);
  }, [handleMove]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (isDragging.current) handleMove(e.touches[0].clientX);
  }, [handleMove]);
  
  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, handleTouchMove]);

  return (
    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm h-full flex flex-col items-center justify-center">
        <div className="w-full flex justify-between items-center mb-4 px-2">
            <h2 className="text-lg font-semibold text-gray-700">{t('compareResult')}</h2>
            {isMonochromeResult && (
                <button
                    onClick={onColorize}
                    disabled={isColoring}
                    className="bg-teal-500 text-white font-bold py-2 px-5 rounded-lg hover:bg-teal-600 transition-colors disabled:bg-gray-400"
                >
                    {isColoring ? t('colorizing') : t('colorizePage')}
                </button>
            )}
        </div>
        <div className="flex-grow w-full h-full flex items-center justify-center bg-gray-100 rounded-lg overflow-hidden p-4">
            <div 
                ref={containerRef}
                className="relative w-full max-w-[600px] max-h-full rounded-lg overflow-hidden select-none shadow-lg border border-gray-300"
            >
                <img src={beforeImage} alt="Before - Panel Layout" className="block w-full h-auto object-contain pointer-events-none" draggable={false}/>
                <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none" style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`}}>
                    <img src={afterImage} alt="After - Generated Manga" className="absolute inset-0 w-full h-full object-contain" draggable={false}/>
                </div>
                <div
                    className="absolute top-0 bottom-0 w-1 bg-white/70 cursor-ew-resize backdrop-blur-sm" style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
                    onMouseDown={handleMouseDown} onTouchStart={handleMouseDown}
                >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 bg-white rounded-full p-1.5 shadow-lg border-2 border-indigo-500">
                        <div className="flex items-center text-indigo-600">
                            <ChevronLeftIcon className="w-5 h-5" />
                            <ChevronRightIcon className="w-5 h-5" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
}