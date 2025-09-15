import React, { useState, useRef, useMemo } from 'react';
import type { Character, VideoScene, Page, VideoModelId } from '../types';
import { useLocalization } from '../hooks/useLocalization';
import { UploadIcon, PlusIcon, XIcon, FilmIcon, TrashIcon, CheckCircleIcon, DownloadIcon, CopyIcon, RedoAltIcon, CameraIcon, PlayIcon, WandIcon } from './icons';
import { 
    generateStoryboardFromPages, 
    generateVideoFrame, 
    generateWebtoonEndFrame,
    generateAllModelPrompts,
    regenerateVideoFrame,
    generateVeoVideo
} from '../services/videoGeminiService';


const ImportSourceModal = ({ 
    onClose, 
    onGenerate,
    editorPages
}: { 
    onClose: () => void, 
    onGenerate: (pages: {data: string, mimeType: string}[]) => void,
    editorPages: Page[]
}) => {
    const { t } = useLocalization();
    const [mode, setMode] = useState<'editor' | 'upload'>('editor');
    const [uploadedPages, setUploadedPages] = useState<{data: string, mimeType: string}[]>([]);
    const [selectedEditorPageIds, setSelectedEditorPageIds] = useState<Set<string>>(new Set());
    const fileInputRef = useRef<HTMLInputElement>(null);

    const generatedEditorPages = useMemo(() => editorPages.filter(p => p.generatedImage), [editorPages]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files) {
            Array.from(files).forEach(file => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setUploadedPages(prev => [...prev, {data: reader.result as string, mimeType: file.type}]);
                };
                reader.readAsDataURL(file);
            });
        }
    };

    const toggleEditorPageSelection = (pageId: string) => {
        setSelectedEditorPageIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(pageId)) {
                newSet.delete(pageId);
            } else {
                newSet.add(pageId);
            }
            return newSet;
        });
    };

    const handleGenerateClick = () => {
        if (mode === 'editor') {
            const pagesToGenerate = generatedEditorPages
                .filter(p => selectedEditorPageIds.has(p.id))
                .map(p => {
                    const mimeType = p.generatedImage!.match(/data:(image\/.*?);/)?.[1] || 'image/png';
                    return { data: p.generatedImage!, mimeType };
                });
            onGenerate(pagesToGenerate);
        } else {
            onGenerate(uploadedPages);
        }
    };
    
    const isGenerateDisabled = mode === 'editor' ? selectedEditorPageIds.size === 0 : uploadedPages.length === 0;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800">{t('importWebtoon')}</h3>
                        <p className="text-sm text-gray-500">{t('importWebtoonDesc')}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><XIcon className="w-5 h-5 text-gray-600" /></button>
                </div>
                
                <div className="p-1 bg-gray-100 m-4 rounded-lg flex">
                    <button onClick={() => setMode('editor')} className={`w-1/2 p-2 rounded-md font-semibold text-sm ${mode === 'editor' ? 'bg-white shadow' : 'text-gray-600'}`}>Import from Editor</button>
                    <button onClick={() => setMode('upload')} className={`w-1/2 p-2 rounded-md font-semibold text-sm ${mode === 'upload' ? 'bg-white shadow' : 'text-gray-600'}`}>Upload New Files</button>
                </div>

                <div className="px-4 pb-4 flex-grow overflow-y-auto min-h-[300px]">
                    {mode === 'editor' ? (
                        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {generatedEditorPages.map((page) => (
                                <div key={page.id} onClick={() => toggleEditorPageSelection(page.id)} className="relative aspect-[2/3] group cursor-pointer">
                                    <img src={page.generatedImage!} alt={page.name} className="w-full h-full object-cover rounded-md shadow-sm border-2 border-transparent group-hover:border-indigo-500" />
                                    {selectedEditorPageIds.has(page.id) && (
                                        <div className="absolute inset-0 bg-indigo-600/50 rounded-md flex items-center justify-center">
                                            <CheckCircleIcon className="w-10 h-10 text-white" />
                                        </div>
                                    )}
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center font-semibold rounded-b-md">{page.name}</div>
                                </div>
                            ))}
                             {generatedEditorPages.length === 0 && <p className="col-span-full text-center text-gray-500 py-10">No generated pages found in the editor.</p>}
                        </div>
                    ) : (
                         <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {uploadedPages.map((page, index) => (
                                <div key={index} className="relative aspect-[2/3] group">
                                    <img src={page.data} alt={`Page ${index + 1}`} className="w-full h-full object-cover rounded-md shadow-sm" />
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-md">
                                        <button onClick={() => setUploadedPages(p => p.filter((_, i) => i !== index))} className="p-2 bg-white/80 rounded-full text-red-500 hover:bg-white">
                                            <TrashIcon className="w-5 h-5"/>
                                        </button>
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => fileInputRef.current?.click()} className="aspect-[2/3] border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-500 hover:border-indigo-500 hover:text-indigo-600">
                                <PlusIcon className="w-8 h-8"/>
                                <span className="text-sm mt-1">{t('addPages')}</span>
                            </button>
                        </div>
                    )}
                     <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/png, image/jpeg, image/webp" className="hidden" multiple />
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                    <button onClick={onClose} className="bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-5 rounded-lg hover:bg-gray-100 transition-colors text-sm">{t('cancel')}</button>
                    <button onClick={handleGenerateClick} disabled={isGenerateDisabled} className="bg-indigo-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-indigo-500 transition-colors text-sm disabled:bg-gray-400">{t('generateStoryboard')}</button>
                </div>
            </div>
        </div>
    );
};

const videoModels = {
    seedance: { name: "Seedance Pro 1.0", startOnly: true },
    hailuo: { name: "Hailuo 02", startOnly: false },
    veo: { name: "Veo 3", startOnly: true },
    kling: { name: "Kling", startOnly: false },
};

const RegenerationModal = ({
    sceneId,
    frameType,
    onClose,
    onConfirm,
}: {
    sceneId: string,
    frameType: 'start' | 'end',
    onClose: () => void,
    onConfirm: (sceneId: string, frameType: 'start' | 'end', prompt: string) => void,
}) => {
    const { t } = useLocalization();
    const [prompt, setPrompt] = useState('');

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col">
                <div className="p-4 border-b">
                    <h3 className="font-bold text-lg">Regenerate {frameType} frame</h3>
                </div>
                <div className="p-4">
                    <textarea 
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Optional: Add modification instructions (e.g., 'make the character smile')"
                        className="w-full h-24 p-2 border border-gray-300 rounded-md text-sm"
                    />
                </div>
                <div className="p-4 bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="bg-white border border-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg text-sm">Cancel</button>
                    <button onClick={() => onConfirm(sceneId, frameType, prompt)} className="bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg text-sm">Regenerate</button>
                </div>
            </div>
        </div>
    );
};


export function VideoProducer({ characters, pages }: { characters: Character[], pages: Page[] }) {
    const { t } = useLocalization();
    const [showImportModal, setShowImportModal] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [scenes, setScenes] = useState<VideoScene[]>([]);
    const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
    const [importedPages, setImportedPages] = useState<{data: string, mimeType: string}[]>([]);
    const [copyStatus, setCopyStatus] = useState<string | null>(null);
    const [selectedModels, setSelectedModels] = useState<Record<VideoModelId, boolean>>({
        seedance: true,
        hailuo: true,
        veo: true,
        kling: true,
    });
    const [regenState, setRegenState] = useState<{ sceneId: string; frameType: 'start' | 'end' } | null>(null);
    const [regeneratingFrame, setRegeneratingFrame] = useState<{ sceneId: string; frameType: 'start' | 'end' } | null>(null);


    const handleGenerateStoryboard = async (pagesToImport: {data: string, mimeType: string}[]) => {
        if (pagesToImport.length === 0) return;
        setImportedPages(pagesToImport);
        setShowImportModal(false);
        setIsGenerating(true);
        setScenes([]); // Clear previous scenes immediately
        setSelectedSceneId(null);
        
        try {
            const initialSceneData = await generateStoryboardFromPages(pagesToImport, characters);
            
            // Now that we have the analysis, clear the old storyboard and set up the new one.
            const placeholderScenes: VideoScene[] = initialSceneData.map((panel, i) => ({
                id: Date.now().toString() + i,
                description: panel.sceneDescription,
                duration: panel.duration,
                sourcePageIndex: panel.sourcePageIndex,
                charactersInScene: panel.charactersInScene,
                recommendedModel: panel.recommendedModel,
                reasoning: panel.reasoning,
                isLoading: true,
                videoGenerationStatus: 'idle',
            }));
            setScenes(placeholderScenes);

            for (let i = 0; i < initialSceneData.length; i++) {
                const panel = initialSceneData[i];
                const placeholderScene = placeholderScenes[i];
                const sourceImage = pagesToImport[panel.sourcePageIndex];
                
                const [startFrame, allPrompts] = await Promise.all([
                    generateVideoFrame(panel.sceneDescription, sourceImage),
                    generateAllModelPrompts(panel, characters),
                ]);

                const endFrame = await generateWebtoonEndFrame(startFrame, panel.narrative, panel.duration);
                
                setScenes(prevScenes => prevScenes.map(s => 
                    s.id === placeholderScene.id 
                    ? { ...s, startFrame, endFrame, prompts: allPrompts, isLoading: false } 
                    : s
                ));
            }
            
            if (placeholderScenes.length > 0) {
                setSelectedSceneId(placeholderScenes[0].id);
            }

        } catch (error) {
            console.error("Storyboard generation failed", error);
            alert(`${t('storyboardGenerationFailed')}: ${error instanceof Error ? error.message : 'Unknown Error'}`);
            setScenes([]); // Clear scenes on failure
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleRegenerateFrame = async (sceneId: string, frameType: 'start' | 'end', editPrompt: string) => {
        const sceneToRegen = scenes.find(s => s.id === sceneId);
        const originalFrame = frameType === 'start' ? sceneToRegen?.startFrame : sceneToRegen?.endFrame;
    
        if (!sceneToRegen || !originalFrame) return;
    
        setRegeneratingFrame({ sceneId, frameType });
        setRegenState(null);
    
        try {
            const newFrame = await regenerateVideoFrame(
                originalFrame,
                editPrompt,
                sceneToRegen.description
            );
            
            setScenes(prev => prev.map(s => {
                if (s.id === sceneId) {
                    return { ...s, [frameType === 'start' ? 'startFrame' : 'endFrame']: newFrame };
                }
                return s;
            }));
        } catch (error) {
            alert(`Frame regeneration failed: ${error instanceof Error ? error.message : 'Unknown Error'}`);
        } finally {
            setRegeneratingFrame(null);
        }
    };
    
    const handleCreateVeoVideo = async (scene: VideoScene) => {
        const veoPrompt = scene.prompts?.veo;
        if (!veoPrompt || !scene.startFrame) return;
    
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoGenerationStatus: 'pending', videoGenerationProgress: 'Initializing...' } : s));
    
        try {
            const mimeType = scene.startFrame.match(/data:(image\/.*?);/)?.[1] || 'image/png';
            const startFrameData = {
                data: scene.startFrame,
                mimeType: mimeType,
            };

            const videoUrl = await generateVeoVideo(
                veoPrompt,
                (progress) => {
                    setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoGenerationProgress: progress } : s));
                },
                startFrameData
            );
            setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoGenerationStatus: 'done', generatedVideoUrl: videoUrl } : s));
        } catch (error) {
            console.error("Veo video generation failed", error);
            setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, videoGenerationStatus: 'error', videoGenerationProgress: error instanceof Error ? error.message : 'Unknown error' } : s));
        }
    };


    const handleCopyPrompt = (text: string | undefined, modelId: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            setCopyStatus(modelId);
            setTimeout(() => setCopyStatus(null), 2000);
        });
    };

    const handleDownloadFrame = (dataUrl: string | undefined, filename: string) => {
        if (!dataUrl) return;
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const toggleModelSelection = (modelId: VideoModelId) => {
        setSelectedModels(prev => ({ ...prev, [modelId]: !prev[modelId] }));
    };

    const selectedScene = scenes.find(s => s.id === selectedSceneId);

    return (
        <div className="flex flex-1 overflow-hidden bg-gray-100 text-gray-800 font-sans">
            {regenState && (
                <RegenerationModal 
                    sceneId={regenState.sceneId}
                    frameType={regenState.frameType}
                    onClose={() => setRegenState(null)}
                    onConfirm={handleRegenerateFrame}
                />
            )}
            <aside className="w-64 bg-white p-4 border-r border-gray-200 flex-col gap-8 flex-shrink-0">
                 <div>
                    <h3 className="font-bold text-sm mb-2 text-gray-500 tracking-wider uppercase">Video Models</h3>
                    <div className="flex flex-col gap-2">
                        {(Object.keys(videoModels) as VideoModelId[]).map(id => (
                            <label key={id} className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={selectedModels[id]}
                                    onChange={() => toggleModelSelection(id)}
                                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                {videoModels[id].name}
                            </label>
                        ))}
                    </div>
                </div>
                <div className="border-t mt-4 pt-4">
                    <h3 className="font-bold text-sm mb-2 text-gray-500 tracking-wider uppercase">{t('characters')}</h3>
                    <div className="flex flex-col gap-2">
                        {characters.map(char => (
                            <div key={char.id} className="flex items-center gap-3 p-2 rounded-md bg-gray-100 border border-gray-200">
                                 <img src={char.sheetImage} alt={char.name} className="w-10 h-10 rounded-sm object-cover" />
                                 <span className="font-semibold text-sm text-gray-700">{char.name}</span>
                            </div>
                        ))}
                        {characters.length === 0 && <p className="text-xs text-gray-400 text-center p-2">{t('createCharacterPrompt')}</p>}
                    </div>
                </div>
            </aside>

            <main className="flex-1 p-4 lg:p-6 flex flex-col gap-4 overflow-y-auto">
                <h3 className="font-bold text-sm text-gray-500 tracking-wider uppercase">{t('storyboard')}</h3>
                <div className="flex flex-col gap-2">
                    {scenes.length > 0 ? (
                        scenes.map((scene, index) => (
                            <div 
                                key={scene.id} 
                                onClick={() => !scene.isLoading && setSelectedSceneId(scene.id)} 
                                className={`p-3 rounded-lg transition-colors ${scene.isLoading ? 'bg-gray-50' : `cursor-pointer ${selectedSceneId === scene.id ? 'bg-indigo-50 border-indigo-500' : 'bg-white border-gray-200 hover:border-gray-400'} border`}`}
                            >
                                {scene.isLoading ? (
                                    <div className="flex items-center gap-3 animate-pulse">
                                        <span className="font-mono text-gray-400">{index + 1}</span>
                                        <div className="flex-grow min-w-0">
                                            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                            <div className="h-3 bg-gray-200 rounded w-1/4 mt-1"></div>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0">
                                            <div className="w-20 h-12 bg-gray-200 rounded"></div>
                                            <div className="w-20 h-12 bg-gray-200 rounded"></div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <span className="font-mono text-gray-500">{index + 1}</span>
                                        <div className="flex-grow min-w-0">
                                            <p className="font-semibold text-gray-800 truncate text-sm">{scene.description}</p>
                                            <p className="text-xs text-gray-500">{scene.duration} seconds</p>
                                        </div>
                                        <div className="flex gap-1 flex-shrink-0">
                                            <img src={scene.startFrame} alt="start frame" className="w-20 h-12 bg-gray-200 rounded object-cover border border-gray-300"/>
                                            <img src={scene.endFrame} alt="end frame" className="w-20 h-12 bg-gray-200 rounded object-cover border border-gray-300"/>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="w-full h-full flex items-center justify-center flex-col text-center">
                            <FilmIcon className="w-16 h-16 text-gray-400 mb-4"/>
                            <p className="text-gray-500 mb-4 max-w-sm">{t('importWebtoonDesc')}</p>
                            <button onClick={() => setShowImportModal(true)} className="bg-indigo-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-indigo-500 transition-colors text-sm">
                                {t('importWebtoon')}
                            </button>
                        </div>
                    )}
                </div>
            </main>

            <aside className="w-[450px] bg-white p-6 border-l border-gray-200 flex flex-col gap-6 overflow-y-auto flex-shrink-0">
                 {selectedScene ? (
                     <>
                        <div className="flex-grow flex flex-col gap-6">
                            <h3 className="font-bold text-sm text-gray-500 tracking-wider uppercase">{t('sceneDetails')}</h3>
                            
                            {selectedScene.videoGenerationStatus === 'pending' && (
                                <div className="flex flex-col items-center justify-center text-center p-4 bg-gray-50 rounded-lg">
                                    <svg className="animate-spin h-8 w-8 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    <p className="mt-2 text-sm font-semibold text-gray-700">{selectedScene.videoGenerationProgress || "Generating video..."}</p>
                                </div>
                            )}
                            {selectedScene.videoGenerationStatus === 'done' && selectedScene.generatedVideoUrl && (
                                <div className="aspect-video bg-black rounded-lg">
                                    <video src={selectedScene.generatedVideoUrl} controls autoPlay loop className="w-full h-full rounded-lg"/>
                                </div>
                            )}
                             {(selectedScene.videoGenerationStatus === 'idle' || selectedScene.videoGenerationStatus === 'error') && (
                                <div className="flex items-center justify-center gap-2">
                                    <div className="relative group flex-1">
                                        <p className="text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider text-center">{t('startFrame')}</p>
                                        <img src={selectedScene.startFrame} alt="start frame" className="aspect-video bg-gray-200 rounded object-cover border border-gray-300 w-full"/>
                                        <div className="absolute top-6 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setRegenState({ sceneId: selectedScene.id, frameType: 'start' })} title="Regenerate Frame" className="bg-black/50 p-1.5 rounded-full text-white"><RedoAltIcon className="w-4 h-4" /></button>
                                            <button onClick={() => handleDownloadFrame(selectedScene.startFrame, `scene-${scenes.findIndex(s => s.id === selectedScene.id) + 1}-start.png`)} title={t('downloadFrame')} className="bg-black/50 p-1.5 rounded-full text-white"><DownloadIcon className="w-4 h-4" /></button>
                                        </div>
                                        {regeneratingFrame?.sceneId === selectedScene.id && regeneratingFrame?.frameType === 'start' && <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded"><svg className="animate-spin h-6 w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>}
                                    </div>
                                    <div className="relative group flex-1">
                                        <p className="text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider text-center">{t('endFrame')}</p>
                                        <img src={selectedScene.endFrame} alt="end frame" className="aspect-video bg-gray-200 rounded object-cover border border-gray-300 w-full"/>
                                        <div className="absolute top-6 right-1 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => setRegenState({ sceneId: selectedScene.id, frameType: 'end' })} title="Regenerate Frame" className="bg-black/50 p-1.5 rounded-full text-white"><RedoAltIcon className="w-4 h-4" /></button>
                                            <button onClick={() => handleDownloadFrame(selectedScene.endFrame, `scene-${scenes.findIndex(s => s.id === selectedScene.id) + 1}-end.png`)} title={t('downloadFrame')} className="bg-black/50 p-1.5 rounded-full text-white"><DownloadIcon className="w-4 h-4" /></button>
                                        </div>
                                        {regeneratingFrame?.sceneId === selectedScene.id && regeneratingFrame?.frameType === 'end' && <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded"><svg className="animate-spin h-6 w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>}
                                    </div>
                                </div>
                             )}
                             {selectedScene.videoGenerationStatus === 'error' && <p className="text-xs text-red-600 text-center p-2 bg-red-50 rounded-md">{selectedScene.videoGenerationProgress}</p>}
                            
                            {selectedScene.recommendedModel && (
                                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-sm">
                                    <div className="flex items-center gap-2">
                                        <WandIcon className="w-4 h-4 text-blue-600"/>
                                        <p className="font-bold text-blue-800">Recommended Model: {videoModels[selectedScene.recommendedModel].name}</p>
                                    </div>
                                    <p className="text-xs text-blue-700 mt-1">{selectedScene.reasoning}</p>
                                </div>
                            )}
                            
                            <div className="flex flex-col gap-4 text-sm">
                                {(Object.keys(videoModels) as VideoModelId[]).filter(id => selectedModels[id]).map(modelId => (
                                    <div key={modelId}>
                                        <div className="flex justify-between items-center mb-1">
                                            <h4 className="font-semibold text-gray-600 text-xs uppercase tracking-wider flex items-center gap-2">
                                                {videoModels[modelId].name} Prompt
                                                {modelId === selectedScene.recommendedModel && <span className="text-[10px] font-bold text-blue-800 bg-blue-200 px-1.5 py-0.5 rounded-full">Recommended</span>}
                                            </h4>
                                            <button onClick={() => handleCopyPrompt(selectedScene.prompts?.[modelId], modelId)} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                                                {copyStatus === modelId ? <><CheckCircleIcon className="w-3 h-3 text-green-500"/>{t('copied')}</> : <><CopyIcon className="w-3 h-3"/>{t('copyPrompt')}</>}
                                            </button>
                                        </div>
                                        <textarea readOnly value={selectedScene.prompts?.[modelId] || ''} className="w-full h-28 bg-gray-50 border border-gray-200 p-2 rounded-md text-xs resize-y font-mono" />
                                        {modelId === 'veo' && selectedScene.videoGenerationStatus !== 'done' && <button onClick={() => handleCreateVeoVideo(selectedScene)} disabled={selectedScene.videoGenerationStatus === 'pending'} className="w-full mt-1 bg-blue-600 text-white font-semibold py-1.5 text-xs rounded-md hover:bg-blue-500 disabled:bg-gray-400 flex items-center justify-center gap-2"><PlayIcon className="w-4 h-4"/>Create Video with Veo 3</button>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="border-t border-gray-200 pt-4 mt-auto">
                            <h3 className="font-bold text-sm text-gray-500 tracking-wider uppercase mb-2">{t('sceneActions')}</h3>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <button onClick={() => alert('Regenerate Scene: Not implemented')} className="p-2 bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200">{t('regenerateScene')}</button>
                                <button onClick={() => alert('Extend Scene: Not implemented')} className="p-2 bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200">{t('extendScene')}</button>
                                <button onClick={() => alert('Add Related Scene: Not implemented')} className="p-2 bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200">{t('addRelatedScene')}</button>
                                <button onClick={() => alert('Add New Scene: Not implemented')} className="p-2 bg-gray-100 text-gray-700 font-semibold rounded-md hover:bg-gray-200">{t('addNewScene')}</button>
                            </div>
                        </div>
                     </>
                 ) : (
                    <div className="flex items-center justify-center h-full text-center text-gray-500 p-8">
                        <p className="whitespace-pre-line">{isGenerating ? t('generatingFrames', { current: scenes.filter(s => !s.isLoading).length + 1, total: scenes.length }) : t('selectScenePrompt')}</p>
                    </div>
                 )}
            </aside>
            {showImportModal && <ImportSourceModal editorPages={pages} onClose={() => setShowImportModal(false)} onGenerate={handleGenerateStoryboard} />}
        </div>
    );
}