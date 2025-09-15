import React from 'react';
import { useLocalization } from '../hooks/useLocalization';
import { LightbulbIcon } from './icons';

interface StoryInputProps {
  story: string;
  onStoryChange: (story: string) => void;
  onSuggestStory: () => void;
}

export function StoryInput({ story, onStoryChange, onSuggestStory }: StoryInputProps): React.ReactElement {
  const { t } = useLocalization();

  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-md font-semibold text-gray-700">{t('sceneNotes')}</h2>
        <button
          onClick={onSuggestStory}
          className="flex items-center gap-2 bg-yellow-400 text-yellow-900 font-bold py-1.5 px-3 rounded-lg hover:bg-yellow-500 transition-colors text-xs disabled:bg-gray-300"
        >
          <LightbulbIcon className="w-4 h-4" />
          {t('getAiSuggestions')}
        </button>
      </div>
      <textarea
        value={story}
        onChange={(e) => onStoryChange(e.target.value)}
        placeholder={t('sceneNotesPlaceholder')}
        className="w-full h-48 bg-gray-50 border border-gray-300 rounded-md p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition resize-y"
        aria-label="Scene notes input"
      />
    </div>
  );
}