import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { BrushIcon, TrashIcon, XIcon, UndoIcon } from './icons';

interface MaskingModalProps {
  baseImage: string;
  onClose: () => void;
  onSave: (maskDataUrl: string) => void;
}

export function MaskingModal({ baseImage, onClose, onSave }: MaskingModalProps) {
  const { t } = useLocalization();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushSize, setBrushSize] = useState(40);
  const [history, setHistory] = useState<ImageData[]>([]);

  const getCanvasContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }, []);
  
  // Set custom brush cursor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cursorCanvas = document.createElement('canvas');
    const size = brushSize;
    const center = size / 2 + 1;
    cursorCanvas.width = size + 2;
    cursorCanvas.height = size + 2;
    const ctx = cursorCanvas.getContext('2d');
    if (ctx) {
        ctx.beginPath();
        ctx.arc(center, center, size / 2, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
    const dataUrl = cursorCanvas.toDataURL('image/png');
    canvas.style.cursor = `url(${dataUrl}) ${center} ${center}, crosshair`;
  }, [brushSize]);

  const saveToHistory = useCallback(() => {
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    setHistory(prev => [...prev, ctx.getImageData(0, 0, canvas.width, canvas.height)]);
  }, [getCanvasContext]);

  const handleImageLoad = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    const ctx = getCanvasContext();
    if (!img || !canvas || !ctx) return;
    
    // Set canvas resolution to image's natural resolution
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

    // Match canvas display size to the image's rendered size to avoid distortion
    const { clientWidth, clientHeight } = img;
    canvas.style.width = `${clientWidth}px`;
    canvas.style.height = `${clientHeight}px`;
    
    // Draw initial black background for the mask
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveToHistory();
  }, [getCanvasContext, saveToHistory]);
  
  const handleUndo = () => {
    const ctx = getCanvasContext();
    if (!ctx || history.length <= 1) return;
    
    const newHistory = history.slice(0, -1);
    const lastState = newHistory[newHistory.length - 1];
    if (lastState) {
        ctx.putImageData(lastState, 0, 0);
    }
    setHistory(newHistory);
  };


  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) / rect.width * canvas.width,
      y: (clientY - rect.top) / rect.height * canvas.height,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = getCanvasContext();
    if (!ctx) return;
    setIsDrawing(true);
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const ctx = getCanvasContext();
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = 'white'; // Draw white on a black background
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };

  const stopDrawing = () => {
    const ctx = getCanvasContext();
    if (!ctx) return;
    ctx.closePath();
    setIsDrawing(false);
    saveToHistory();
  };

  const handleClear = () => {
    const ctx = getCanvasContext();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveToHistory();
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      onSave(canvas.toDataURL('image/png'));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-gray-800">{t('maskingModalTitle')}</h3>
                    <p className="text-sm text-gray-500">{t('maskingModalDescription')}</p>
                </div>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><XIcon className="w-5 h-5 text-gray-600" /></button>
            </div>
            <div className="p-4 flex-grow flex items-center justify-center bg-gray-100 relative min-h-0">
                <div className="absolute top-2 left-2 z-10 bg-white shadow-lg rounded-full border border-gray-200 p-2 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <BrushIcon className="w-5 h-5 text-gray-600" />
                        <input type="range" min="5" max="150" value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-32" />
                        <span className="text-sm font-semibold text-gray-700 w-8 text-center">{brushSize}</span>
                    </div>
                    <div className="h-6 w-px bg-gray-200"></div>
                    <button onClick={handleUndo} className="p-2 hover:bg-gray-200 rounded-full" title={t('undo')} disabled={history.length <= 1}><UndoIcon className="w-5 h-5 text-gray-700" /></button>
                    <button onClick={handleClear} className="p-2 hover:bg-red-100 rounded-full" title={t('clearCanvas')}><TrashIcon className="w-5 h-5 text-red-500" /></button>
                </div>

                <div className="relative flex items-center justify-center">
                    <img 
                        ref={imageRef} 
                        src={baseImage} 
                        onLoad={handleImageLoad}
                        alt="Base for masking" 
                        className="max-w-full max-h-full object-contain pointer-events-none select-none"
                        style={{ maxHeight: 'calc(95vh - 150px)' }}
                    />
                    <canvas
                        ref={canvasRef}
                        className="absolute opacity-50"
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                    />
                </div>
            </div>
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                <button onClick={onClose} className="bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-5 rounded-lg hover:bg-gray-100 transition-colors text-sm">{t('cancel')}</button>
                <button onClick={handleSave} className="bg-indigo-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-indigo-500 transition-colors text-sm">{t('saveMask')}</button>
            </div>
        </div>
    </div>
  );
}