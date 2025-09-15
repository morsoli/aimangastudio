import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { ApiKeyModal } from './components/ApiKeyModal';
import { PanelEditor } from './components/PanelEditor';
import { GenerationControls } from './components/GenerationControls';
import { ResultDisplay } from './components/ResultDisplay';
import { MaskingModal } from './components/MaskingModal';
import { CharacterGenerationModal } from './components/CharacterGenerationModal';
import { ComparisonViewer } from './components/ComparisonViewer';
import { MangaViewerModal } from './components/MangaViewerModal';
import { WorldviewModal } from './components/WorldviewModal';
import { StorySuggestionModal } from './components/StorySuggestionModal';
import { VideoProducer } from './components/VideoProducer';
import { generateMangaPage, generateCharacterSheet, editCharacterSheet, colorizeMangaPage, editMangaPage, generateDetailedStorySuggestion, generateLayoutProposal, analyzeAndSuggestCorrections } from './services/geminiService';
import type { Character, Page, CanvasShape, ViewTransform, StorySuggestion, PanelShape, ImageShape, AnalysisResult } from './types';
import { AddUserIcon, TrashIcon, LinkIcon } from './components/icons';
import { useLocalization } from './hooks/useLocalization';
import { Language } from './i18n/locales';
import { useApiKey } from './hooks/useApiKey';

const createInitialSkeleton = (x: number, y: number, width: number, height: number) => {
    const centerX = x + width / 2;
    const topY = y + height * 0.15;
    const hipY = y + height * 0.5;
    const armY = y + height * 0.3;
    const legY = y + height * 0.9;
    const shoulderWidth = width * 0.2;
    const hipWidth = width * 0.15;
    const eyeY = topY - height * 0.03;
    const eyeDistX = width * 0.07;
    const noseY = topY;
    const mouthY = topY + height * 0.05;
    return {
        head: { x: centerX, y: topY }, neck: { x: centerX, y: armY },
        leftShoulder: { x: centerX - shoulderWidth, y: armY }, rightShoulder: { x: centerX + shoulderWidth, y: armY },
        leftElbow: { x: centerX - shoulderWidth * 1.5, y: hipY }, rightElbow: { x: centerX + shoulderWidth * 1.5, y: hipY },
        leftHand: { x: centerX - shoulderWidth * 1.2, y: legY - height * 0.1 }, rightHand: { x: centerX + shoulderWidth * 1.2, y: legY - height * 0.1 },
        hips: { x: centerX, y: hipY }, leftHip: { x: centerX - hipWidth, y: hipY }, rightHip: { x: centerX + hipWidth, y: hipY },
        leftKnee: { x: centerX - hipWidth, y: hipY + height * 0.2 }, rightKnee: { x: centerX + hipWidth, y: hipY + 0.2 },
        leftFoot: { x: centerX - hipWidth, y: legY }, rightFoot: { x: centerX + hipWidth, y: legY },
        leftEye: { x: centerX - eyeDistX, y: eyeY }, rightEye: { x: centerX + eyeDistX, y: eyeY },
        nose: { x: centerX, y: noseY }, mouth: { x: centerX, y: mouthY },
    };
};

const initialPage: Omit<Page, 'id' | 'name'> = {
  shapes: [],
  shapesHistory: [[]],
  shapesHistoryIndex: 0,
  panelLayoutImage: null,
  sceneDescription: '',
  panelCharacterMap: {},
  generatedImage: null,
  generatedText: null,
  generatedColorMode: null,
  aspectRatio: 'A4',
  viewTransform: { scale: 1, x: 0, y: 0 },
  shouldReferencePrevious: false,
  assistantProposalImage: null,
  proposalOpacity: 0.5,
  isProposalVisible: true,
  proposedShapes: null,
};

const aspectRatios: { [key: string]: { name: string, value: string, w: number, h: number } } = {
    'A4': { name: 'A4', value: '210:297', w: 595, h: 842 },
    '竖版': { name: '竖版', value: '3:4', w: 600, h: 800 },
    '正方形': { name: '正方形', value: '1:1', w: 800, h: 800 },
    '横版': { name: '横版', value: '16:9', w: 1280, h: 720 }
};


export default function App(): React.ReactElement {
  const { t, language, setLanguage } = useLocalization();
  const { apiKey, isApiKeyModalOpen, setIsApiKeyModalOpen, saveApiKey, clearApiKey, hasApiKey } = useApiKey();
  
  const [pages, setPages] = useState<Page[]>([{...initialPage, id: Date.now().toString(), name: `${t('pages')} 1` }]);
  const [currentPageId, setCurrentPageId] = useState<string>(pages[0].id);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [showCharacterModal, setShowCharacterModal] = useState<boolean>(false);
  const [colorMode, setColorMode] = useState<'color' | 'monochrome'>('monochrome');
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isColoring, setIsColoring] = useState<boolean>(false);
  const [isSuggestingStory, setIsSuggestingStory] = useState<boolean>(false);
  const [isSuggestingLayout, setIsSuggestingLayout] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isAspectRatioOpen, setIsAspectRatioOpen] = useState(false);
  const [isDraggingCharacter, setIsDraggingCharacter] = useState(false);
  const [showMangaViewer, setShowMangaViewer] = useState(false);
  const [isMasking, setIsMasking] = useState(false);
  const [currentMask, setCurrentMask] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'editor' | 'result'>('editor');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [worldview, setWorldview] = useState<string>('');
  const [showWorldviewModal, setShowWorldviewModal] = useState<boolean>(false);
  const [showStorySuggestionModal, setShowStorySuggestionModal] = useState<boolean>(false);
  const [storySuggestion, setStorySuggestion] = useState<StorySuggestion | null>(null);
  const [generateEmptyBubbles, setGenerateEmptyBubbles] = useState<boolean>(false);

  const [assistantModeState, setAssistantModeState] = useState<{
    isActive: boolean;
    totalPages: number;
    currentPageNumber: number;
    statusMessage: string;
    hasError?: boolean;
    failedPageNumber?: number;
  } | null>(null);

  const editorAreaRef = useRef<HTMLDivElement>(null);
  const stopAutoGenerationRef = useRef(false);

  const [currentView, setCurrentView] = useState<'manga-editor' | 'video-producer'>('manga-editor');

  const toggleFullscreen = useCallback(() => {
    const elem = editorAreaRef.current;
    if (!elem) return;
    if (!document.fullscreenElement) {
        elem.requestFullscreen().catch(err => {
            alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
        });
    } else {
        document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
      const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener('fullscreenchange', onFullscreenChange);
      return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);
  const panelEditorRef = useRef<{ getLayoutAsImage: (includeCharacters: boolean, characters: Character[]) => Promise<string> }>(null);

  const currentPage = useMemo(() => pages.find(p => p.id === currentPageId) || pages[0], [pages, currentPageId]);
  
  useEffect(() => {
    setViewMode(currentPage.generatedImage ? 'result' : 'editor');
    setAnalysisResult(null); // Clear analysis when page changes
  }, [currentPage.id, currentPage.generatedImage]);


  const handleUpdateCurrentPage = useCallback((updates: Partial<Page>) => {
    setPages(prevPages => prevPages.map(p => 
      p.id === currentPageId ? { ...p, ...updates } : p
    ));
  }, [currentPageId]);

  const handleViewTransformChange = useCallback((vt: ViewTransform) => {
    handleUpdateCurrentPage({ viewTransform: vt });
  }, [handleUpdateCurrentPage]);

  const handleShapesChange = useCallback((newShapes: CanvasShape[], recordHistory: boolean = true) => {
    setPages(prevPages => prevPages.map(p => {
        if (p.id !== currentPageId) return p;

        let updatedSceneDescription = p.sceneDescription;
        const newPanelCount = newShapes.filter(s => s.type === 'panel').length;
        const oldPanelCount = p.shapes.filter(s => s.type === 'panel').length;

        if (newPanelCount !== oldPanelCount) {
            const existingPanels: Record<string, string> = {};
            const panelRegex = /Panel (\d+):([\s\S]*?)(?=\n\nPanel \d+:|$)/g;
            let match;
            while ((match = panelRegex.exec(p.sceneDescription)) !== null) {
                existingPanels[match[1]] = match[2].trim();
            }

            if (newPanelCount > 0) {
                let newDesc = '';
                for (let i = 1; i <= newPanelCount; i++) {
                    newDesc += `Panel ${i}: ${existingPanels[i] || ''}\n\n`;
                }
                updatedSceneDescription = newDesc.trim();
            } else {
                updatedSceneDescription = '';
            }
        }

        if (recordHistory) {
            const newHistory = p.shapesHistory.slice(0, p.shapesHistoryIndex + 1);
            newHistory.push(newShapes);
            return { 
                ...p, 
                shapes: newShapes,
                shapesHistory: newHistory,
                shapesHistoryIndex: newHistory.length - 1,
                sceneDescription: updatedSceneDescription,
            };
        } else {
             const newHistory = [...p.shapesHistory];
             newHistory[p.shapesHistoryIndex] = newShapes;
             return { ...p, shapes: newShapes, shapesHistory: newHistory, sceneDescription: updatedSceneDescription };
        }
    }));
  }, [currentPageId]);

  const handleUndo = useCallback(() => {
    setPages(prevPages => prevPages.map(p => {
        if (p.id !== currentPageId || p.shapesHistoryIndex <= 0) return p;
        const newIndex = p.shapesHistoryIndex - 1;
        return {
            ...p,
            shapes: p.shapesHistory[newIndex],
            shapesHistoryIndex: newIndex,
        };
    }));
  }, [currentPageId]);

  const handleRedo = useCallback(() => {
     setPages(prevPages => prevPages.map(p => {
        if (p.id !== currentPageId || p.shapesHistoryIndex >= p.shapesHistory.length - 1) return p;
        const newIndex = p.shapesHistoryIndex + 1;
        return {
            ...p,
            shapes: p.shapesHistory[newIndex],
            shapesHistoryIndex: newIndex,
        };
    }));
  }, [currentPageId]);

  const handleGenerateImage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
        let panelLayoutImage = currentPage.panelLayoutImage;
        const pageUpdates: Partial<Page> = {};

        if (!panelLayoutImage || viewMode === 'editor') {
            if (!panelEditorRef.current) {
                setError("Editor is not ready.");
                setIsLoading(false);
                return;
            }
            panelLayoutImage = await panelEditorRef.current.getLayoutAsImage(true, characters);
            pageUpdates.panelLayoutImage = panelLayoutImage;
        }
        if (!panelLayoutImage) {
            setError("Failed to capture panel layout.");
            setIsLoading(false);
            return;
        }
        
        const characterIdsInScene = new Set(currentPage.shapes.filter(s => s.type === 'image').map(s => (s as ImageShape).characterId));
        const relevantCharacters = characters.filter(c => characterIdsInScene.has(c.id));
        
        let previousPageData: Pick<Page, 'generatedImage' | 'sceneDescription'> | undefined = undefined;
        if (currentPage.shouldReferencePrevious) {
            const currentPageIndex = pages.findIndex(p => p.id === currentPageId);
            if (currentPageIndex > 0) {
                const prevPage = pages[currentPageIndex - 1];
                if (prevPage.generatedImage) {
                    previousPageData = {
                        generatedImage: prevPage.generatedImage,
                        sceneDescription: prevPage.sceneDescription
                    };
                }
            }
        }
        
        const result = await generateMangaPage(relevantCharacters, panelLayoutImage, currentPage.sceneDescription, colorMode, previousPageData, generateEmptyBubbles);
        pageUpdates.generatedImage = result.image;
        pageUpdates.generatedText = result.text;
        pageUpdates.generatedColorMode = colorMode;

        handleUpdateCurrentPage(pageUpdates);
        setCurrentMask(null);
        setAnalysisResult(null);
        setViewMode('result');
    } catch (e: unknown) {
        setError(e instanceof Error ? `Generation failed: ${e.message}` : "An unknown error occurred.");
    } finally {
        setIsLoading(false);
    }
  }, [currentPage, pages, currentPageId, characters, colorMode, handleUpdateCurrentPage, viewMode, generateEmptyBubbles]);

  const handleColorize = useCallback(async () => {
      if (!currentPage.generatedImage) {
          setError("No generated image to colorize.");
          return;
      }
      setIsColoring(true);
      setError(null);
      try {
          const characterIdsInScene = new Set(currentPage.shapes.filter(s => s.type === 'image').map(s => (s as ImageShape).characterId));
          const relevantCharacters = characters.filter(c => characterIdsInScene.has(c.id));
          
          const coloredImage = await colorizeMangaPage(currentPage.generatedImage, relevantCharacters);
          handleUpdateCurrentPage({ generatedImage: coloredImage, generatedColorMode: 'color' });
          setAnalysisResult(null);
      } catch (e: unknown) {
          setError(e instanceof Error ? `Colorization failed: ${e.message}` : "An unknown error occurred.");
      } finally {
          setIsColoring(false);
      }
  }, [currentPage, characters, handleUpdateCurrentPage]);

 const handleEditImage = useCallback(async (editPrompt: string, editReferenceImages: string[] | null) => {
    if (!currentPage.generatedImage) {
        setError("No generated image to edit.");
        return;
    }
    setIsLoading(true);
    setError(null);
    try {
        const editedImage = await editMangaPage(currentPage.generatedImage, editPrompt, currentMask || undefined, editReferenceImages || undefined);
        handleUpdateCurrentPage({ generatedImage: editedImage });
        setCurrentMask(null);
        setAnalysisResult(null);
    } catch (e: unknown) {
        setError(e instanceof Error ? `Editing failed: ${e.message}` : "An unknown error occurred during editing.");
    } finally {
        setIsLoading(false);
    }
  }, [currentPage.generatedImage, currentMask, handleUpdateCurrentPage]);

  const handleGenerateDetailedStory = async (premise: string, shouldContinue: boolean) => {
      setIsSuggestingStory(true);
      setError(null);
      setStorySuggestion(null);
      try {
          let previousPagesContext: Pick<Page, 'generatedImage' | 'sceneDescription'>[] | undefined = undefined;
          if (shouldContinue) {
              const currentPageIndex = pages.findIndex(p => p.id === currentPageId);
              if (currentPageIndex >= 0) {
                  const start = Math.max(0, currentPageIndex - 1);
                  previousPagesContext = pages.slice(start, currentPageIndex + 1)
                      .filter(p => p.generatedImage && p.sceneDescription)
                      .map(p => ({ generatedImage: p.generatedImage!, sceneDescription: p.sceneDescription }));
              }
          }
          const suggestion = await generateDetailedStorySuggestion(premise, worldview, characters, previousPagesContext);
          setStorySuggestion(suggestion);
      } catch (e) {
          setError(e instanceof Error ? `Story suggestion failed: ${e.message}` : "An unknown error occurred.");
      } finally {
          setIsSuggestingStory(false);
      }
  };

    const handleGenerateLayoutProposal = async () => {
        setIsSuggestingLayout(true);
        setError(null);
        handleUpdateCurrentPage({ proposedShapes: null, assistantProposalImage: null });

        let canvasImageForProposal: string;
        const hasShapes = currentPage.shapes.length > 0;

        if (hasShapes) {
            if (!panelEditorRef.current) {
                setError("Editor is not ready to capture the canvas.");
                setIsSuggestingLayout(false);
                return;
            }
            canvasImageForProposal = await panelEditorRef.current.getLayoutAsImage(true, characters);
        } else {
            const config = aspectRatios[currentPage.aspectRatio];
            const canvas = document.createElement('canvas');
            canvas.width = config.w;
            canvas.height = config.h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
            canvasImageForProposal = canvas.toDataURL('image/png');
        }

        const currentPageIndex = pages.findIndex(p => p.id === currentPageId);
        let previousPageLayout: { proposalImage: string, sceneDescription: string } | undefined = undefined;
        if (currentPageIndex > 0) {
            const prevPage = pages[currentPageIndex - 1];
            if (prevPage.assistantProposalImage && prevPage.sceneDescription) {
                previousPageLayout = {
                    proposalImage: prevPage.assistantProposalImage,
                    sceneDescription: prevPage.sceneDescription
                };
            }
        }

        try {
            const { proposalImage } = await generateLayoutProposal(
                currentPage.sceneDescription,
                characters,
                currentPage.aspectRatio,
                previousPageLayout,
                canvasImageForProposal
            );
            handleUpdateCurrentPage({ assistantProposalImage: proposalImage, proposedShapes: null });
        } catch (e) {
            setError(e instanceof Error ? `Layout proposal failed: ${e.message}` : "An unknown error occurred.");
        } finally {
            setIsSuggestingLayout(false);
        }
    };
  
  const handleStartAutoGeneration = async (numPages: number, startFromPage: number = 1) => {
      setShowWorldviewModal(false);
      setError(null);
      if (characters.length === 0 && worldview === '') {
          setError(t('autoGenCharacterWarning'));
          return;
      }
      
      stopAutoGenerationRef.current = false;
      setAssistantModeState({ isActive: true, totalPages: numPages, currentPageNumber: startFromPage, statusMessage: t('autoGenStarting'), hasError: false });

      let currentLocalPages = [...pages];
      let localCurrentPageId: string;
      
      if (startFromPage > 1) {
        const retryPageIndex = startFromPage - 1;
        localCurrentPageId = currentLocalPages[retryPageIndex]?.id || currentLocalPages[currentLocalPages.length - 1].id;
      } else {
          const lastPage = currentLocalPages[currentLocalPages.length - 1];
          if (lastPage.assistantProposalImage || lastPage.shapes.length > 0 || lastPage.sceneDescription) {
              const newPageId = Date.now().toString();
              const newPage: Page = { ...initialPage, id: newPageId, name: `${t('pages')} ${currentLocalPages.length + 1}` };
              currentLocalPages = [...currentLocalPages, newPage];
              localCurrentPageId = newPageId;
          } else {
              localCurrentPageId = lastPage.id;
          }
      }
      
      setPages(currentLocalPages);
      setCurrentPageId(localCurrentPageId);
      
      let previousPageLayout: { proposalImage: string, sceneDescription: string } | undefined = undefined;
      const startIndex = startFromPage - 1;
      if (startIndex > 0 && currentLocalPages[startIndex - 1]) {
          const prevPage = currentLocalPages[startIndex - 1];
          if (prevPage.assistantProposalImage && prevPage.sceneDescription) {
              previousPageLayout = {
                  proposalImage: prevPage.assistantProposalImage,
                  sceneDescription: prevPage.sceneDescription
              };
          }
      }

      try {
        for (let i = startFromPage; i <= numPages; i++) {
          if (stopAutoGenerationRef.current) {
            setAssistantModeState(prevState => ({ ...prevState!, statusMessage: t('stopping') }));
            break;
          }
          const pageIndex = currentLocalPages.findIndex(p => p.id === localCurrentPageId);
          let pageObject = currentLocalPages[pageIndex];

          setAssistantModeState({ isActive: true, totalPages: numPages, currentPageNumber: i, statusMessage: t('autoGenStory', { current: i, total: numPages }) });
          
          let prevPageContext: Pick<Page, 'generatedImage' | 'sceneDescription'> | undefined;
          if (pageIndex > 0) {
              const prevPage = currentLocalPages[pageIndex - 1];
              if (prevPage.generatedImage && prevPage.sceneDescription) {
                  prevPageContext = { generatedImage: prevPage.generatedImage, sceneDescription: prevPage.sceneDescription };
              }
          }

          const storyPremise = `Generate the next part of the story for page ${i}.`;
          const story = await generateDetailedStorySuggestion(storyPremise, worldview, characters, prevPageContext ? [prevPageContext] : undefined);
          const sceneDescription = story.panels.map(p => `Panel ${p.panel}: ${p.description}${p.dialogue ? `\n${p.dialogue}` : ''}`).join('\n\n');
          
          pageObject = { ...pageObject, sceneDescription };
          currentLocalPages[pageIndex] = pageObject;
          setPages([...currentLocalPages]);
          
          if (stopAutoGenerationRef.current) break;

          setAssistantModeState({ isActive: true, totalPages: numPages, currentPageNumber: i, statusMessage: t('autoGenLayout', { current: i, total: numPages }) });
          const { proposalImage } = await generateLayoutProposal(sceneDescription, characters, pageObject.aspectRatio, previousPageLayout);
          
          previousPageLayout = { proposalImage, sceneDescription };
          
          pageObject = { 
            ...pageObject, 
            assistantProposalImage: proposalImage,
            proposedShapes: null, // No longer auto-applying shapes
          };
          currentLocalPages[pageIndex] = pageObject;
          setPages([...currentLocalPages]);
          
          if (i < numPages) {
              const nextPageId = Date.now().toString();
              const newPage: Page = { ...initialPage, id: nextPageId, name: `${t('pages')} ${currentLocalPages.length + 1}`, aspectRatio: pageObject.aspectRatio };
              currentLocalPages.push(newPage);
              localCurrentPageId = nextPageId;
              setPages(currentLocalPages);
              setCurrentPageId(localCurrentPageId);
          }
        }
      } catch (e: any) {
          const failedPageNumber = assistantModeState?.currentPageNumber || startFromPage;
          setAssistantModeState(prevState => ({
              ...(prevState!),
              isActive: true, 
              statusMessage: `Error on page ${failedPageNumber}: ${e.message}`,
              hasError: true,
              failedPageNumber: failedPageNumber,
          }));
          return;
      }
      
      setAssistantModeState(prevState => prevState ? {...prevState, statusMessage: t('autoGenComplete') || 'Generation Complete!', isActive: false} : null);
      setTimeout(() => setAssistantModeState(null), 2000);
      stopAutoGenerationRef.current = false;
      
  };

  const handleStopAutoGeneration = () => {
    stopAutoGenerationRef.current = true;
    setAssistantModeState(prevState => ({
        ...prevState!,
        statusMessage: t('stopping'),
    }));
  };

  const handleCharacterSave = (newCharacter: Omit<Character, 'id'>) => {
    setCharacters(prev => [...prev, { ...newCharacter, id: Date.now().toString() }]);
  };
  
  const handleDeleteCharacter = (idToDelete: string) => {
    setCharacters(prev => prev.filter(c => c.id !== idToDelete));
    setPages(prevPages => prevPages.map(page => ({
        ...page,
        shapes: page.shapes.filter(s => s.type !== 'image' || s.characterId !== idToDelete),
    })));
  };

  const handleAddPage = (switchToNewPage: boolean = true) => {
    const newPageId = Date.now().toString();
    const newPage: Page = {
      ...initialPage,
      id: newPageId,
      name: `${t('pages')} ${pages.length + 1}`,
      aspectRatio: currentPage.aspectRatio,
    };
    setPages(prev => [...prev, newPage]);
    if (switchToNewPage) {
        setCurrentPageId(newPageId);
    }
  };

  const handleDeletePage = (idToDelete: string) => {
      if (pages.length <= 1) return;
      setPages(prev => prev.filter(p => p.id !== idToDelete));
      if (currentPageId === idToDelete) {
          setCurrentPageId(pages.find(p => p.id !== idToDelete)!.id);
      }
  };
  
  const handleToggleReferencePrevious = (pageId: string) => {
    setPages(pages.map(p => p.id === pageId ? { ...p, shouldReferencePrevious: !p.shouldReferencePrevious } : p));
  };

  const handleAnalyzeResult = useCallback(async () => {
    if (!currentPage.panelLayoutImage || !currentPage.generatedImage) {
        setError(t('analysisError'));
        return;
    }
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setError(null);
    try {
        const characterIdsInScene = new Set(currentPage.shapes.filter(s => s.type === 'image').map(s => (s as ImageShape).characterId));
        const relevantCharacters = characters.filter(c => characterIdsInScene.has(c.id));
        
        const result = await analyzeAndSuggestCorrections(
            currentPage.panelLayoutImage,
            currentPage.generatedImage,
            currentPage.sceneDescription,
            relevantCharacters
        );
        setAnalysisResult(result);
    } catch (e) {
        setError(e instanceof Error ? `Analysis failed: ${e.message}` : "An unknown error occurred during analysis.");
    } finally {
        setIsAnalyzing(false);
    }
  }, [currentPage, characters]);

  const handleApplyCorrection = useCallback(async () => {
    if (!analysisResult || !analysisResult.has_discrepancies || !analysisResult.correction_prompt) return;
    await handleEditImage(analysisResult.correction_prompt, null);
    setAnalysisResult(null);
  }, [analysisResult, handleEditImage]);
  
  const handleApplyLayout = useCallback(() => {
    if (!currentPage.assistantProposalImage) return;
    handleUpdateCurrentPage({
        generatedImage: currentPage.assistantProposalImage,
        panelLayoutImage: currentPage.assistantProposalImage,
        generatedColorMode: 'monochrome',
        shapes: [],
    });
    setViewMode('result');
  }, [currentPage.assistantProposalImage, handleUpdateCurrentPage]);


  const isReadyToGenerate = !!currentPage.sceneDescription;
  const isMonochromeResult = currentPage.generatedImage !== null && currentPage.generatedColorMode === 'monochrome';
  const anyLoading = isLoading || isColoring || isSuggestingLayout || isSuggestingStory || assistantModeState?.isActive || isAnalyzing;

  return (
    <div className="flex flex-col h-screen font-sans bg-gray-50 text-gray-800">
      <Header 
        isSidebarOpen={isSidebarOpen} 
        onToggleSidebar={() => setIsSidebarOpen(p => !p)}
        language={language}
        setLanguage={(lang) => setLanguage(lang as Language)}
  onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
  hasApiKey={hasApiKey}
        onShowMangaViewer={() => setShowMangaViewer(true)}
        onShowWorldview={() => setShowWorldviewModal(true)}
        currentView={currentView}
        onSetView={setCurrentView}
      />
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSave={(key) => saveApiKey(key)}
      />
      {showCharacterModal && (
        <CharacterGenerationModal
          onClose={() => setShowCharacterModal(false)}
          onSave={handleCharacterSave}
          characters={characters}
        />
      )}
       {showWorldviewModal && (
        <WorldviewModal
          initialWorldview={worldview}
          onSave={(newWorldview) => {
            setWorldview(newWorldview);
            setShowWorldviewModal(false);
          }}
          onClose={() => setShowWorldviewModal(false)}
          onAutoGenerate={handleStartAutoGeneration}
          isGenerating={!!assistantModeState?.isActive}
          characters={characters}
        />
      )}
      {showStorySuggestionModal && (
        <StorySuggestionModal
          onClose={() => {
            setShowStorySuggestionModal(false);
            setStorySuggestion(null);
            setError(null);
          }}
          onGenerate={handleGenerateDetailedStory}
          isLoading={isSuggestingStory}
          suggestion={storySuggestion}
          onApply={(script) => {
            handleUpdateCurrentPage({ sceneDescription: script });
            setShowStorySuggestionModal(false);
            setStorySuggestion(null);
          }}
        />
      )}
      {showMangaViewer && (
        <MangaViewerModal 
            pages={pages}
            onClose={() => setShowMangaViewer(false)}
        />
      )}
      {isMasking && currentPage.generatedImage && (
        <MaskingModal
            baseImage={currentPage.generatedImage}
            onClose={() => setIsMasking(false)}
            onSave={(maskDataUrl) => {
                setCurrentMask(maskDataUrl);
                setIsMasking(false);
            }}
        />
      )}
      <div className="flex flex-1 overflow-hidden">
        {currentView === 'video-producer' ? (
          <VideoProducer characters={characters} pages={pages} />
        ) : (
          <>
            <div ref={editorAreaRef} className="flex flex-1 bg-gray-50">
              <aside className={`w-64 bg-white p-4 border-r border-gray-200 flex-col gap-8 flex-shrink-0 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'flex' : 'hidden'}`}>
                <div>
                  <h3 className="font-bold text-sm mb-2 text-gray-500 tracking-wider uppercase">{t('pages')}</h3>
                  <div className="mb-4 relative">
                      <label htmlFor="aspect-ratio-select" className="block text-xs font-medium text-gray-500 mb-1">{t('aspectRatio')}</label>
                      <button
                          onClick={() => setIsAspectRatioOpen(prev => !prev)}
                          className="w-full text-sm p-1.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 flex justify-between items-center bg-white"
                      >
                          <span>{aspectRatios[currentPage.aspectRatio].name} ({aspectRatios[currentPage.aspectRatio].value})</span>
                          <svg className={`w-4 h-4 text-gray-500 transition-transform ${isAspectRatioOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                      </button>
                      {isAspectRatioOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-20">
                              {Object.entries(aspectRatios).map(([key, {name, value, w, h}]) => (
                                  <div key={key} onClick={() => { handleUpdateCurrentPage({ aspectRatio: key }); setIsAspectRatioOpen(false); }} className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer flex items-center gap-3">
                                      <div className="w-6 h-6 flex items-center justify-center">
                                          <div className="bg-gray-200 border border-gray-400" style={{ width: `${w/Math.max(w,h)*20}px`, height: `${h/Math.max(w,h)*20}px`}}></div>
                                      </div>
                                      <span>{name} ({value})</span>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
                  {assistantModeState?.isActive ? (
                    <div className="flex flex-col gap-2 overflow-y-auto max-h-96">
                        {pages.filter(p => p.assistantProposalImage).map(page => (
                            <div key={`thumb-${page.id}`} onClick={() => setCurrentPageId(page.id)} className={`relative rounded-lg cursor-pointer border-2 ${currentPageId === page.id ? 'border-indigo-500' : 'border-transparent'}`}>
                                <img 
                                    src={page.assistantProposalImage!} 
                                    alt={page.name}
                                    className="w-full h-auto object-cover rounded-md"
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs font-semibold text-center p-1 rounded-b-md">{page.name}</div>
                            </div>
                        ))}
                    </div>
                  ) : (
                    <>
                    {pages.map((page, index) => (
                        <div key={page.id} className={`rounded-lg p-2 font-semibold mb-2 flex items-center justify-between group ${currentPageId === page.id ? 'border-2 border-indigo-500 bg-indigo-50 text-indigo-700' : 'border border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-400'}`}>
                            <span onClick={() => setCurrentPageId(page.id)} className="flex-grow text-center cursor-pointer">{page.name}</span>
                            <div className="flex items-center">
                                {index > 0 && (
                                  <div className="relative group flex items-center">
                                        <button onClick={() => handleToggleReferencePrevious(page.id)} className="p-1 rounded-full hover:bg-indigo-100">
                                            <LinkIcon className={`w-4 h-4 transition-colors ${page.shouldReferencePrevious ? 'text-indigo-600' : 'text-gray-400'}`} />
                                        </button>
                                        <div className="absolute bottom-full right-0 mb-1 w-max max-w-xs px-2 py-1 bg-gray-800 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                            {t('referencePreviousPage')}
                                        </div>
                                    </div>
                                )}
                                <button onClick={() => handleDeletePage(page.id)} className="p-1 rounded-full hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0" disabled={pages.length <= 1}>
                                    <TrashIcon className="w-4 h-4 text-red-500" />
                                </button>
                            </div>
                        </div>
                    ))}
                    <div onClick={() => handleAddPage()} className="border border-dashed border-gray-300 bg-gray-50 rounded-lg p-2 text-center font-semibold text-gray-500 mt-2 cursor-pointer hover:border-indigo-500 hover:text-indigo-700">
                      {t('addPage')}
                    </div>
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="font-bold text-sm mb-2 text-gray-500 tracking-wider uppercase">{t('characters')}</h3>
                  <div className="flex flex-col gap-2">
                      {characters.length === 0 && <p className="text-xs text-gray-400 text-center p-2">{t('createCharacterPrompt')}</p>}
                      {characters.map(char => (
                          <div key={char.id} className="flex items-center justify-between gap-3 p-2 rounded-md bg-gray-100 border border-gray-200 group relative">
                              <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">{t('dragMe')}</div>
                              <div className="flex items-center gap-3 flex-grow cursor-grab" draggable onDragStart={(e) => { e.dataTransfer.setData('characterId', char.id); setIsDraggingCharacter(true); }} onDragEnd={() => setIsDraggingCharacter(false)}>
                                  <img src={char.sheetImage} alt={char.name} className="w-10 h-10 rounded-sm object-cover" />
                                  <span className="font-semibold text-sm text-gray-700">{char.name}</span>
                              </div>
                              <button onClick={() => handleDeleteCharacter(char.id)} className="p-1 rounded-full hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <TrashIcon className="w-4 h-4 text-red-500" />
                              </button>
                          </div>
                      ))}
                  </div>
                  <button onClick={() => setShowCharacterModal(true)} className="w-full mt-2 flex items-center justify-center gap-2 border border-dashed border-gray-300 bg-gray-50 rounded-lg p-2 text-center font-semibold text-gray-500 cursor-pointer hover:border-indigo-500 hover:text-indigo-700">
                    <AddUserIcon className="w-5 h-5" /> {t('addCharacter')}
                  </button>
                </div>
              </aside>

              <main className="flex-1 p-4 lg:p-6 overflow-auto relative">
                {viewMode === 'result' && currentPage.generatedImage && currentPage.panelLayoutImage ? (
                  <ComparisonViewer 
                      beforeImage={currentPage.panelLayoutImage}
                      afterImage={currentPage.generatedImage}
                      isMonochromeResult={isMonochromeResult}
                      onColorize={handleColorize}
                      isColoring={isColoring}
                  />
                ) : (
                  <PanelEditor 
                      ref={panelEditorRef}
                      key={currentPage.id}
                      shapes={currentPage.shapes}
                      onShapesChange={handleShapesChange}
                      characters={characters}
                      aspectRatio={currentPage.aspectRatio}
                      viewTransform={currentPage.viewTransform}
                      onViewTransformChange={handleViewTransformChange}
                      isDraggingCharacter={isDraggingCharacter}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      canUndo={currentPage.shapesHistoryIndex > 0}
                      canRedo={currentPage.shapesHistoryIndex < currentPage.shapesHistory.length - 1}
                      proposalImage={currentPage.assistantProposalImage}
                      proposalOpacity={currentPage.proposalOpacity}
                      isProposalVisible={currentPage.isProposalVisible}
                      onProposalSettingsChange={(updates) => handleUpdateCurrentPage(updates)}
                      onApplyLayout={handleApplyLayout}
                      isFullscreen={isFullscreen}
                      onToggleFullscreen={toggleFullscreen}
                  />
                )}
              </main>
            </div>
            <aside className="w-96 bg-white p-6 border-l border-gray-200 flex flex-col gap-6 overflow-y-auto flex-shrink-0">
              {viewMode === 'result' && currentPage.generatedImage && !error ? (
                <ResultDisplay
                  isLoading={isLoading}
                  isColoring={isColoring}
                  generatedContent={{ image: currentPage.generatedImage, text: currentPage.generatedText }}
                  error={error}
                  isMonochromeResult={isMonochromeResult}
                  onColorize={handleColorize}
                  onRegenerate={handleGenerateImage}
                  onEdit={handleEditImage}
                  onStartMasking={() => setIsMasking(true)}
                  mask={currentMask}
                  onClearMask={() => setCurrentMask(null)}
                  onReturnToEditor={() => setViewMode('editor')}
                  isAnalyzing={isAnalyzing}
                  analysisResult={analysisResult}
                  onAnalyze={handleAnalyzeResult}
                  onApplyCorrection={handleApplyCorrection}
                  onClearAnalysis={() => setAnalysisResult(null)}
                  characters={characters}
                />
              ) : (
                <div className="flex flex-col gap-6 h-full">
                  {!anyLoading && <h2 className="text-xl font-bold text-gray-800">{t('generateYourManga')}</h2>}
                  {anyLoading ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        {assistantModeState?.hasError ? (
                            <div className="flex flex-col items-center gap-4">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <p className="text-red-600 font-semibold px-4">{assistantModeState.statusMessage}</p>
                                <button 
                                    onClick={() => handleStartAutoGeneration(assistantModeState.totalPages, assistantModeState.failedPageNumber)}
                                    className="bg-indigo-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-indigo-500 transition-colors text-sm"
                                >
                                    {t('retryGeneration')}
                                </button>
                            </div>
                        ) : (
                            <>
                                <svg className="animate-spin h-10 w-10 text-indigo-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <p className="text-gray-500 mt-4 font-semibold">
                                   {assistantModeState?.isActive ? assistantModeState.statusMessage :
                                    isAnalyzing ? t('analyzing') :
                                    isSuggestingStory ? t('storySuggesting') : 
                                    isSuggestingLayout ? t('layoutSuggesting') : 
                                    isColoring ? t('coloringPage') : t('generating')}
                                </p>
                                {assistantModeState?.isActive && !assistantModeState?.hasError && (
                                    <button
                                        onClick={handleStopAutoGeneration}
                                        className="mt-4 bg-red-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-red-500 transition-colors text-sm"
                                    >
                                        {t('stopGeneration')}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                   ) : (
                    <>
                      <GenerationControls
                        onGenerateImage={handleGenerateImage}
                        isLoading={isLoading}
                        colorMode={colorMode}
                        setColorMode={setColorMode}
                        isReadyToGenerate={isReadyToGenerate}
                        sceneDescription={currentPage.sceneDescription}
                        onSceneDescriptionChange={(desc) => handleUpdateCurrentPage({ sceneDescription: desc })}
                        onSuggestLayout={handleGenerateLayoutProposal}
                        isSuggestingLayout={isSuggestingLayout}
                        onSuggestStory={() => setShowStorySuggestionModal(true)}
                        characters={characters}
                        hasGeneratedResult={!!currentPage.generatedImage}
                        onViewResult={() => setViewMode('result')}
                        generateEmptyBubbles={generateEmptyBubbles}
                        setGenerateEmptyBubbles={setGenerateEmptyBubbles}
                        assistantModeState={assistantModeState}
                      />
                    </>
                  )}
                   {error && <div className="text-red-700 bg-red-100 p-4 rounded-lg border border-red-300 text-sm">{error}</div>}
                </div>
              )}
            </aside>
          </>
        )}
      </div>
    </div>
  );
}