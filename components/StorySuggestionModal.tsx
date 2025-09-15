import React, { useState } from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { LightbulbIcon, XIcon } from './icons';
import type { StorySuggestion } from '../types';

interface StorySuggestionModalProps {
  onClose: () => void;
  onGenerate: (premise: string, shouldContinue: boolean) => void;
  isLoading: boolean;
  suggestion: StorySuggestion | null;
  onApply: (script: string) => void;
}

export function StorySuggestionModal({
  onClose,
  onGenerate,
  isLoading,
  suggestion,
  onApply,
}: StorySuggestionModalProps) {
  const { t } = useLocalization();
  const [premise, setPremise] = useState('');
  const [shouldContinue, setShouldContinue] = useState(true);

  const handleGenerate = () => {
    onGenerate(premise, shouldContinue);
  };

  const handleApply = () => {
    if (!suggestion) return;
    const formattedScript = suggestion.panels
      .map(p => {
        const dialogue = p.dialogue ? `\n${p.dialogue}` : '';
        return `Panel ${p.panel}: ${p.description}${dialogue}`;
      })
      .join('\n\n');
    onApply(formattedScript);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <LightbulbIcon className="w-6 h-6 text-yellow-500" />
            <div>
              <h3 className="text-lg font-bold text-gray-800">{t('storySuggestionTitle')}</h3>
              <p className="text-sm text-gray-500">{t('storySuggestionDescription')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <XIcon className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        
        <div className="p-4 flex-grow overflow-y-auto grid grid-cols-2 gap-4">
          {/* Left: Input */}
          <div className="flex flex-col gap-4 pr-4 border-r border-gray-200">
            <div>
              <label htmlFor="story-idea" className="block text-sm font-semibold text-gray-600 mb-1">{t('storyIdea')}</label>
              <textarea
                id="story-idea"
                value={premise}
                onChange={(e) => setPremise(e.target.value)}
                placeholder={t('storyIdeaPlaceholder')}
                className="w-full h-32 bg-gray-50 border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition resize-y"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="continue-story"
                type="checkbox"
                checked={shouldContinue}
                onChange={(e) => setShouldContinue(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="continue-story" className="text-sm font-medium text-gray-700">{t('continueFromPrevious')}</label>
            </div>
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="w-full bg-yellow-400 text-yellow-900 font-bold py-2.5 px-4 rounded-lg hover:bg-yellow-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? t('storySuggesting') : t('generateSuggestion')}
            </button>
          </div>

          {/* Right: Output */}
          <div className="flex flex-col">
            <h4 className="text-sm font-semibold text-gray-600 mb-2">{t('aiSuggestion')}</h4>
            <div className="flex-grow bg-gray-50 rounded-md border p-3 overflow-y-auto">
              {isLoading ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  <span>{t('storySuggesting')}</span>
                </div>
              ) : suggestion ? (
                <div className="space-y-4 text-sm">
                  {suggestion.panels.map((panel) => (
                    <div key={panel.panel}>
                      <p className="font-bold text-gray-800">{t('panel')} {panel.panel}</p>
                      <p className="text-gray-600 pl-2 border-l-2 border-gray-200 ml-1 mt-1">
                        <strong className="font-semibold">{t('description')}:</strong> {panel.description}
                      </p>
                      {panel.dialogue && (
                        <p className="text-gray-600 pl-2 border-l-2 border-gray-200 ml-1 mt-1">
                          <strong className="font-semibold">{t('dialogue')}:</strong> <em>{panel.dialogue}</em>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center text-xs py-10">{t('aiSuggestion')} will appear here.</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-5 rounded-lg hover:bg-gray-100 transition-colors text-sm">{t('cancel')}</button>
          <button
            onClick={handleApply}
            disabled={!suggestion}
            className="bg-indigo-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-indigo-500 transition-colors text-sm disabled:bg-gray-400"
          >
            {t('applyToScript')}
          </button>
        </div>
      </div>
    </div>
  );
}