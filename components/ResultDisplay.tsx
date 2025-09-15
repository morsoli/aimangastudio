import React, { useState, useCallback, useRef } from 'react';
import type { GeneratedContent, AnalysisResult, Character } from '../types';
import { useLocalization } from '../hooks/useLocalization';
import { RedoAltIcon, SparklesIcon, UploadIcon, XIcon, BrushIcon, ReturnIcon, WandIcon, CheckCircleIcon } from './icons';

interface ResultDisplayProps {
  isLoading: boolean;
  isColoring: boolean;
  generatedContent: GeneratedContent | null;
  error: string | null;
  isMonochromeResult: boolean;
  onColorize: () => void;
  onRegenerate: () => void;
  onEdit: (prompt: string, refImages: string[] | null) => void;
  onStartMasking: () => void;
  mask: string | null;
  onClearMask: () => void;
  onReturnToEditor: () => void;
  isAnalyzing: boolean;
  analysisResult: AnalysisResult | null;
  onAnalyze: () => void;
  onApplyCorrection: () => void;
  onClearAnalysis: () => void;
  characters: Character[];
}

const LoadingMessage = () => {
    const { t } = useLocalization();
    const messages = [
        t('loadingSketching'),
        t('loadingInking'),
        t('loadingBubbles'),
        t('loadingScreentones'),
        t('loadingFinalizing'),
    ];
    const [message, setMessage] = React.useState(messages[0]);

    React.useEffect(() => {
        let index = 0;
        const intervalId = setInterval(() => {
            index = (index + 1) % messages.length;
            setMessage(messages[index]);
        }, 2500);

        return () => clearInterval(intervalId);
    }, [messages]);

    return <p className="text-gray-500 mt-4">{message}</p>
};

export function ResultDisplay({ 
    isLoading, 
    isColoring, 
    generatedContent, 
    error, 
    isMonochromeResult, 
    onColorize,
    onRegenerate,
    onEdit,
    onStartMasking,
    mask,
    onClearMask,
    onReturnToEditor,
    isAnalyzing,
    analysisResult,
    onAnalyze,
    onApplyCorrection,
    onClearAnalysis,
    characters
}: ResultDisplayProps): React.ReactElement {
  const { t } = useLocalization();
  const [editPrompt, setEditPrompt] = useState('');
  const [editRefImages, setEditRefImages] = useState<string[]>([]);
  const [editRefCharacterIds, setEditRefCharacterIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleApplyEdits = () => {
    if (editPrompt) {
        const selectedCharSheets = characters
            .filter(c => editRefCharacterIds.has(c.id))
            .map(c => c.sheetImage);

        const allRefImages = [...editRefImages, ...selectedCharSheets];

        onEdit(editPrompt, allRefImages.length > 0 ? allRefImages : null);
        setEditPrompt('');
        setEditRefImages([]);
        setEditRefCharacterIds(new Set());
    }
  };

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const fileArray = Array.from(files);
      const remainingSlots = 8 - editRefImages.length;
      if (remainingSlots <= 0) return;

      const filesToProcess = fileArray.slice(0, remainingSlots);
      
      filesToProcess.forEach(file => {
          const reader = new FileReader();
          reader.onloadend = () => {
              setEditRefImages(prev => [...prev, reader.result as string]);
          };
          reader.readAsDataURL(file);
      });
    }
  }, [editRefImages]);
  
  const handleRemoveRefImage = (index: number) => {
      setEditRefImages(prev => prev.filter((_, i) => i !== index));
  }

  const toggleRefChar = (charId: string) => {
    setEditRefCharacterIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(charId)) {
            newSet.delete(charId);
        } else {
            newSet.add(charId);
        }
        return newSet;
    });
  };

  if (isLoading || isColoring || isAnalyzing) {
    return (
        <div className="bg-white rounded-xl h-full flex flex-col items-center justify-center p-6 text-center">
            <svg className="animate-spin h-10 w-10 text-indigo-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-lg font-semibold mt-4">{isAnalyzing ? t('analyzing') : (isLoading && !isColoring ? t('editing') : '')}</p>
            {isColoring ? <p className="text-gray-500 mt-1">{t('coloringPage')}</p> : isAnalyzing ? null : <LoadingMessage />}
        </div>
    );
  }

  return (
    <div className="bg-white rounded-xl h-full flex flex-col">
      <div className="px-6 pt-6 pb-2 flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-800">{t('result')}</h2>
        <button 
          onClick={onReturnToEditor}
          className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
        >
          <ReturnIcon className="w-5 h-5" />
          {t('returnToEditor')}
        </button>
      </div>

      <div className="flex-grow bg-gray-50 rounded-b-xl flex flex-col p-4 gap-4 overflow-y-auto">
        {error ? (
            <div className="text-red-700 bg-red-100 p-4 rounded-lg border border-red-300 text-sm m-2">{error}</div>
        ) : generatedContent?.image ? (
            <>
                <div className="relative group">
                     <img src={generatedContent.image} alt="Generated manga page" className="w-full object-contain rounded-md shadow-lg border border-gray-200" />
                     {mask && (
                        <div className="absolute inset-0 bg-indigo-500/30 backdrop-blur-sm flex items-center justify-center rounded-md pointer-events-none">
                            <p className="text-white font-bold text-lg bg-black/50 px-4 py-2 rounded-lg">Mask Applied</p>
                        </div>
                     )}
                </div>

                <div className="flex flex-col gap-4 p-2">
                    <div className="grid grid-cols-2 gap-2">
                        {isMonochromeResult && (
                            <button onClick={onColorize} disabled={isColoring} className="col-span-2 w-full bg-teal-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-teal-600 transition-colors flex items-center justify-center text-sm">
                                {t('colorizePage')}
                            </button>
                        )}
                         <button onClick={onRegenerate} className="w-full bg-gray-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-gray-500 transition-colors flex items-center justify-center gap-2 text-sm">
                            <RedoAltIcon className="w-4 h-4" /> {t('regenerate')}
                        </button>
                        <button onClick={onStartMasking} className="w-full bg-purple-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-purple-500 transition-colors flex items-center justify-center gap-2 text-sm">
                           <BrushIcon className="w-4 h-4" /> {t('editWithMask')}
                        </button>
                    </div>
                    
                    <button 
                        onClick={onAnalyze} 
                        className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-500 transition-colors flex items-center justify-center gap-2 text-sm">
                        <WandIcon className="w-4 h-4" /> {t('analyzeResult')}
                    </button>

                    {analysisResult && (
                        <div className="border-t border-gray-200 pt-4 animate-fade-in">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-md font-semibold text-gray-700">{t('analysisReport')}</h3>
                                <button onClick={onClearAnalysis} className="p-1 rounded-full hover:bg-gray-200"><XIcon className="w-4 h-4 text-gray-500" /></button>
                            </div>
                            <div className="bg-gray-100 p-3 rounded-md border border-gray-200 text-sm">
                                <p className="text-gray-800">{analysisResult.analysis}</p>
                                {analysisResult.has_discrepancies ? (
                                    <button
                                        onClick={onApplyCorrection}
                                        className="w-full mt-3 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-500 transition-colors flex items-center justify-center gap-2 text-sm"
                                    >
                                        <SparklesIcon className="w-5 h-5" /> {t('applyCorrection')}
                                    </button>
                                ) : (
                                    <div className="mt-3 flex items-center justify-center gap-2 text-green-600 font-semibold">
                                        <CheckCircleIcon className="w-5 h-5" />
                                        <span>{t('noCorrectionsNeeded')}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="border-t border-gray-200 pt-4">
                        <h3 className="text-md font-semibold text-gray-700 mb-2">{t('editResult')}</h3>
                        {mask && (
                            <div className="mb-2 flex justify-between items-center bg-indigo-50 p-2 rounded-md border border-indigo-200">
                                <p className="text-xs font-semibold text-indigo-700">Mask is active for this edit.</p>
                                <button onClick={onClearMask} className="text-xs text-indigo-500 hover:underline font-bold">{t('clearMask')}</button>
                            </div>
                        )}
                        <textarea
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            placeholder={t('editPromptPlaceholder')}
                            className="w-full h-20 bg-white border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition resize-y"
                        />
                         <div className="mt-2">
                             <h4 className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">{t('uploadReference')}</h4>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" id="edit-ref-upload" multiple />
                            <div className="grid grid-cols-4 gap-2">
                                {editRefImages.map((img, index) => (
                                    <div key={index} className="relative group aspect-square">
                                        <img src={img} alt={`Ref ${index + 1}`} className="w-full h-full object-cover rounded-md border border-gray-200" />
                                        <button onClick={() => handleRemoveRefImage(index)} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"><XIcon className="w-3 h-3" /></button>
                                    </div>
                                ))}
                                {editRefImages.length < 8 && (
                                    <label htmlFor="edit-ref-upload" className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-gray-300 text-gray-500 rounded-md cursor-pointer hover:border-indigo-500 hover:text-indigo-600">
                                        <UploadIcon className="w-5 h-5" />
                                        <span className="text-xs mt-1">{t('uploadReference')}</span>
                                        <span className="text-xs text-gray-400">({editRefImages.length}/8)</span>
                                    </label>
                                )}
                            </div>
                         </div>
                         <div className="mt-2">
                            <h4 className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wider">{t('characters')}</h4>
                            {characters.length > 0 ? (
                                <div className="grid grid-cols-4 gap-2">
                                    {characters.map(char => (
                                        <div key={char.id} onClick={() => toggleRefChar(char.id)} className="relative group aspect-square cursor-pointer">
                                            <img src={char.sheetImage} alt={char.name} className={`w-full h-full object-cover rounded-md border-2 ${editRefCharacterIds.has(char.id) ? 'border-indigo-500' : 'border-transparent'}`} />
                                             {editRefCharacterIds.has(char.id) && (
                                                <div className="absolute inset-0 bg-indigo-600/60 rounded-sm flex items-center justify-center">
                                                    <CheckCircleIcon className="w-6 h-6 text-white" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400 text-center bg-gray-100 p-2 rounded-md">{t('createCharacterPrompt')}</p>
                            )}
                         </div>

                        <button
                            onClick={handleApplyEdits}
                            disabled={!editPrompt}
                            className="w-full mt-3 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                            <SparklesIcon className="w-5 h-5" /> {t('applyEdits')}
                        </button>
                    </div>
                </div>
            </>
        ) : null}
      </div>
    </div>
  );
}