import React, { useState, useCallback, useRef } from 'react';
import type { Character } from '../types';
import { UploadIcon, XIcon, RedoAltIcon, SparklesIcon, PlusIcon, CheckCircleIcon } from './icons';
import { useLocalization } from '../hooks/useLocalization';
import { generateCharacterSheet, editCharacterSheet, generateCharacterFromReference } from '../services/geminiService';

interface CharacterGenerationModalProps {
  onClose: () => void;
  onSave: (character: Omit<Character, 'id'>) => void;
  characters: Character[];
}

type CharacterDraft = {
    id: number;
    name: string;
    description: string;
    concept: string;
    creationMode: 'new' | 'fromReference';
    referenceCharacterIds: string[];
    referenceImages: string[];
    sheetColorMode: 'color' | 'monochrome';
    generatedSheet: string | null;
    isGenerating: boolean;
    isEditing: boolean;
    error: string | null;
    editPrompt: string;
};

const createNewDraft = (): CharacterDraft => ({
  id: Date.now(),
  name: '',
  description: '',
  concept: '',
  creationMode: 'new',
  referenceCharacterIds: [],
  referenceImages: [],
  sheetColorMode: 'monochrome',
  generatedSheet: null,
  isGenerating: false,
  isEditing: false,
  error: null,
  editPrompt: '',
});

export function CharacterGenerationModal({ onClose, onSave, characters }: CharacterGenerationModalProps) {
  const { t } = useLocalization();
  const [drafts, setDrafts] = useState<CharacterDraft[]>([createNewDraft()]);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploaderId, setActiveUploaderId] = useState<number | null>(null);

  const handleUpdateDraft = (id: number, updates: Partial<CharacterDraft>) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  };
  
  const handleAddDraft = () => {
    setDrafts(prev => [...prev, createNewDraft()]);
  };
  
  const handleRemoveDraft = (id: number) => {
    setDrafts(prev => prev.filter(d => d.id !== id));
  };

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeUploaderId) return;
    const files = event.target.files;
    if (files) {
      const fileArray = Array.from(files);
      fileArray.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setDrafts(prev => prev.map(d => 
              d.id === activeUploaderId 
              ? { ...d, referenceImages: [...d.referenceImages, reader.result as string] }
              : d
          ));
        };
        reader.readAsDataURL(file);
      });
    }
  }, [activeUploaderId]);
  
  const triggerUploader = (id: number) => {
    setActiveUploaderId(id);
    fileInputRef.current?.click();
  };
  
  const handleGenerate = async (id: number) => {
    const draft = drafts.find(d => d.id === id);
    if (!draft || !draft.name) {
      handleUpdateDraft(id, { error: t('characterNamePlaceholder') });
      return;
    }
    handleUpdateDraft(id, { isGenerating: true, error: null, generatedSheet: null });
    
    try {
      let result: string;
      if (draft.creationMode === 'new') {
        if (draft.referenceImages.length === 0) throw new Error(t('characterNameAndImageError'));
        result = await generateCharacterSheet(draft.referenceImages, draft.name, draft.sheetColorMode);
      } else { // fromReference
        if (draft.referenceCharacterIds.length === 0) throw new Error(t('referenceCharacterError'));
        if (!draft.concept) throw new Error(t('characterConceptError'));
        const refChars = characters.filter(c => draft.referenceCharacterIds.includes(c.id));
        if (refChars.length === 0) throw new Error('Reference characters not found.');
        const refSheetImages = refChars.map(c => c.sheetImage);
        result = await generateCharacterFromReference(refSheetImages, draft.name, draft.concept, draft.sheetColorMode);
      }
      handleUpdateDraft(id, { generatedSheet: result, isGenerating: false });
    } catch (e) {
      handleUpdateDraft(id, { error: e instanceof Error ? e.message : "An unknown error occurred.", isGenerating: false });
    }
  };

  const handleBatchGenerate = async () => {
    setIsBatchGenerating(true);
    const draftsToGenerate = drafts.filter(d => !d.generatedSheet && d.name && (d.referenceImages.length > 0 || (d.creationMode === 'fromReference' && d.referenceCharacterIds.length > 0 && d.concept)));
    await Promise.all(draftsToGenerate.map(d => handleGenerate(d.id)));
    setIsBatchGenerating(false);
  };

  const handleEdit = async (id: number) => {
    const draft = drafts.find(d => d.id === id);
    if (!draft || !draft.generatedSheet || !draft.editPrompt) {
      handleUpdateDraft(id, { error: t('editPromptError') });
      return;
    }
    handleUpdateDraft(id, { isEditing: true, error: null });

    try {
        const result = await editCharacterSheet(draft.generatedSheet, draft.name, draft.editPrompt);
        handleUpdateDraft(id, { generatedSheet: result, editPrompt: '' });
    } catch (e) {
        handleUpdateDraft(id, { error: e instanceof Error ? e.message : "An unknown error occurred during update." });
    } finally {
        handleUpdateDraft(id, { isEditing: false });
    }
  };


  const handleSave = (id: number) => {
    const draft = drafts.find(d => d.id === id);
    if (draft && draft.generatedSheet && draft.name) {
      const characterToSave: Omit<Character, 'id'> = draft.creationMode === 'new'
        ? { name: draft.name, sheetImage: draft.generatedSheet, referenceImages: draft.referenceImages, description: draft.description }
        : { name: draft.name, sheetImage: draft.generatedSheet, referenceImages: [], description: draft.concept };
      
      if (draft.creationMode === 'new' && draft.referenceImages.length === 0) return;
      
      onSave(characterToSave);
      handleRemoveDraft(id);
    }
  };
  
  const handleSaveAllAndClose = () => {
    drafts.forEach(draft => {
        if (draft.generatedSheet && draft.name) {
            const characterToSave: Omit<Character, 'id'> = draft.creationMode === 'new'
              ? { name: draft.name, sheetImage: draft.generatedSheet, referenceImages: draft.referenceImages, description: draft.description }
              : { name: draft.name, sheetImage: draft.generatedSheet, referenceImages: [], description: draft.concept };
            if (draft.creationMode === 'new' && draft.referenceImages.length === 0) return;
            onSave(characterToSave);
        }
    });
    onClose();
  };

  const hasUnsavedDrafts = drafts.length > 0;
  const readyToGenerate = drafts.some(d => d.name && (d.referenceImages.length > 0 || (d.creationMode === 'fromReference' && d.referenceCharacterIds.length > 0 && d.concept)));

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{t('createCharacter')}</h2>
            <p className="text-sm text-gray-500">{t('batchCharacterDesc')}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><XIcon className="w-5 h-5 text-gray-600" /></button>
        </div>

        <div className="p-6 flex-grow overflow-y-auto bg-gray-50/50">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {drafts.map(draft => {
                    const toggleRefChar = (draftId: number, charId: string) => {
                        handleUpdateDraft(draftId, { 
                            referenceCharacterIds: draft.referenceCharacterIds.includes(charId)
                                ? draft.referenceCharacterIds.filter(id => id !== charId)
                                : [...draft.referenceCharacterIds, charId]
                        });
                    };

                    return (
                        <div key={draft.id} className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col transition-all">
                            {/* Header */}
                            <div className="p-3 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-lg">
                                <input 
                                    type="text"
                                    value={draft.name}
                                    onChange={(e) => handleUpdateDraft(draft.id, { name: e.target.value })}
                                    placeholder={t('characterNamePlaceholder')}
                                    className="w-full bg-transparent font-semibold text-gray-700 outline-none placeholder:font-normal"
                                />
                                <button onClick={() => handleRemoveDraft(draft.id)} className="p-1 rounded-full hover:bg-red-100 text-red-500">
                                    <XIcon className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-4 flex-grow">
                                {draft.generatedSheet ? (
                                    <div className="flex flex-col gap-4">
                                        <div className="relative aspect-[4/3] bg-gray-100 rounded-md flex items-center justify-center">
                                           <img src={draft.generatedSheet} alt={t('generatedSheet')} className="max-h-full w-auto object-contain rounded-md" />
                                           {(draft.isGenerating || draft.isEditing) && <div className="absolute inset-0 bg-white/70 flex items-center justify-center"><svg className="animate-spin h-6 w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => handleGenerate(draft.id)} className="flex-1 flex items-center justify-center gap-1.5 bg-gray-200 text-gray-700 font-semibold py-1.5 px-3 rounded-md hover:bg-gray-300 text-xs"><RedoAltIcon className="w-4 h-4" /> {t('regenerate')}</button>
                                            <button onClick={() => handleSave(draft.id)} className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 text-white font-semibold py-1.5 px-3 rounded-md hover:bg-green-500 text-xs"><CheckCircleIcon className="w-4 h-4" /> {t('saveCharacter')}</button>
                                        </div>
                                        <div>
                                            <textarea
                                                value={draft.editPrompt}
                                                onChange={(e) => handleUpdateDraft(draft.id, { editPrompt: e.target.value })}
                                                placeholder={t('editSheetPlaceholder')}
                                                className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-xs h-16 resize-none"
                                            />
                                            <button onClick={() => handleEdit(draft.id)} disabled={draft.isEditing || !draft.editPrompt} className="w-full mt-1.5 flex items-center justify-center gap-1.5 bg-gray-700 text-white font-semibold py-1.5 px-3 rounded-md hover:bg-gray-600 disabled:bg-gray-400 text-xs"><SparklesIcon className="w-4 h-4"/> {t('updateSheet')}</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        <div className="flex rounded-lg bg-gray-100 p-1 w-full text-xs font-semibold">
                                            <button onClick={() => handleUpdateDraft(draft.id, { creationMode: 'new' })} className={`w-1/2 p-1.5 rounded-md ${draft.creationMode === 'new' ? 'bg-white shadow' : 'text-gray-500'}`}>{t('createNewFromScratch')}</button>
                                            <button onClick={() => handleUpdateDraft(draft.id, { creationMode: 'fromReference' })} disabled={characters.length === 0} className={`w-1/2 p-1.5 rounded-md ${draft.creationMode === 'fromReference' ? 'bg-white shadow' : 'text-gray-500'} disabled:text-gray-400 disabled:cursor-not-allowed`}>{t('createFromReference')}</button>
                                        </div>
                                        
                                        {draft.creationMode === 'new' ? (
                                            <>
                                                <textarea value={draft.description} onChange={(e) => handleUpdateDraft(draft.id, { description: e.target.value })} placeholder={t('characterDescriptionPlaceholder')} className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-xs h-16 resize-y" />
                                                <div className="grid grid-cols-3 gap-2 p-1.5 bg-gray-100 border border-gray-200 rounded-lg min-h-[5rem]">
                                                    {draft.referenceImages.map((img, index) => (
                                                        <div key={index} className="relative group aspect-square">
                                                            <img src={img} alt={`Ref ${index + 1}`} className="w-full h-full object-cover rounded" />
                                                            <button onClick={() => handleUpdateDraft(draft.id, { referenceImages: draft.referenceImages.filter((_, i) => i !== index) })} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100"><XIcon className="w-3 h-3" /></button>
                                                        </div>
                                                    ))}
                                                    {draft.referenceImages.length < 8 &&
                                                      <div onClick={() => triggerUploader(draft.id)} className="cursor-pointer border-2 border-dashed border-gray-300 rounded text-center hover:border-indigo-500 flex flex-col items-center justify-center aspect-square"><UploadIcon className="w-5 h-5 text-gray-400" /><span className="text-xs text-gray-500 mt-1">+ Add</span></div>
                                                    }
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                 <div className="bg-gray-100 border border-gray-200 rounded-lg p-2">
                                                    <p className="text-xs font-semibold text-gray-600 mb-2">{t('selectReferenceCharacter')}</p>
                                                    <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto">
                                                        {characters.map(c => (
                                                            <div key={c.id} onClick={() => toggleRefChar(draft.id, c.id)} className={`relative group cursor-pointer aspect-square rounded border-2 ${draft.referenceCharacterIds.includes(c.id) ? 'border-indigo-500' : 'border-transparent'}`}>
                                                                <img src={c.sheetImage} alt={c.name} className="w-full h-full object-cover rounded" />
                                                                {draft.referenceCharacterIds.includes(c.id) && (
                                                                    <div className="absolute inset-0 bg-indigo-600/60 rounded-sm flex items-center justify-center">
                                                                        <CheckCircleIcon className="w-6 h-6 text-white" />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                 </div>
                                                <textarea value={draft.concept} onChange={(e) => handleUpdateDraft(draft.id, { concept: e.target.value })} placeholder={t('conceptPlaceholder')} className="w-full bg-gray-50 border border-gray-300 rounded-md p-2 text-xs h-16 resize-y" />
                                            </div>
                                        )}

                                        <div className="flex rounded-lg bg-gray-100 p-1 w-full mt-auto">
                                            <button onClick={() => handleUpdateDraft(draft.id, { sheetColorMode: 'monochrome' })} className={`w-1/2 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${draft.sheetColorMode === 'monochrome' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}> {t('monochrome')} </button>
                                            <button onClick={() => handleUpdateDraft(draft.id, { sheetColorMode: 'color' })} className={`w-1/2 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${draft.sheetColorMode === 'color' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}> {t('color')} </button>
                                        </div>
                                        <button onClick={() => handleGenerate(draft.id)} disabled={draft.isGenerating || !draft.name || (draft.creationMode === 'new' && draft.referenceImages.length === 0) || (draft.creationMode === 'fromReference' && (!draft.referenceCharacterIds.length || !draft.concept)) } className="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg hover:bg-indigo-500 disabled:bg-gray-400">
                                            {draft.isGenerating ? t('generating') : t('generateSheet')}
                                        </button>
                                    </div>
                                )}
                                {draft.error && <p className="text-red-500 text-xs text-center mt-2">{draft.error}</p>}
                            </div>
                        </div>
                    )
                })}
                
                {/* Add New Card */}
                 <div onClick={handleAddDraft} className="bg-gray-100 rounded-lg border-2 border-dashed border-gray-300 hover:border-indigo-500 hover:bg-white transition-colors flex flex-col items-center justify-center text-gray-500 cursor-pointer min-h-[300px]">
                    <PlusIcon className="w-8 h-8" />
                    <p className="mt-2 font-semibold">{t('addCharacter')}</p>
                 </div>
            </div>
             <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" className="hidden" multiple />
        </div>
        
        <div className="p-4 bg-white border-t border-gray-200 flex justify-between items-center">
          <button onClick={handleBatchGenerate} disabled={isBatchGenerating || !readyToGenerate} className="bg-purple-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-purple-500 transition-colors text-sm disabled:bg-gray-400">
            {isBatchGenerating ? t('generating') : t('generateAll')}
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className={`bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-5 rounded-lg hover:bg-gray-100 transition-colors text-sm ${!hasUnsavedDrafts ? 'hidden' : ''}`}>
                {t('cancel')}
            </button>
            <button onClick={handleSaveAllAndClose} className="bg-green-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-green-500 transition-colors text-sm">
                {hasUnsavedDrafts ? t('saveAndClose') : t('close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}