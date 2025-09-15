import React, { useState, useMemo } from 'react';
import type { Page } from '../types';
import { useLocalization } from '../hooks/useLocalization';
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, XIcon } from './icons';

interface MangaViewerModalProps {
    pages: Page[];
    onClose: () => void;
}

export function MangaViewerModal({ pages, onClose }: MangaViewerModalProps) {
    const { t } = useLocalization();
    const [pageIndex, setPageIndex] = useState(0);

    const generatedPages = useMemo(() => pages.filter(p => p.generatedImage), [pages]);

    const handleNext = () => {
        setPageIndex(prev => Math.min(prev + 1, generatedPages.length - 1));
    };

    const handlePrev = () => {
        setPageIndex(prev => Math.max(prev - 1, 0));
    };
    
    const handleDownloadAll = () => {
        generatedPages.forEach((page, index) => {
            if (!page.generatedImage) return;
            const link = document.createElement('a');
            link.href = page.generatedImage;
            link.download = `manga-page-${index + 1}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    };
    
    if (generatedPages.length === 0) {
        return (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
                <div className="bg-white rounded-xl shadow-2xl p-8 text-center" onClick={e => e.stopPropagation()}>
                    <p className="text-gray-600">No generated pages to display yet.</p>
                </div>
            </div>
        )
    }

    const currentPage = generatedPages[pageIndex];

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="w-full max-w-5xl p-4 flex justify-between items-center text-white">
                 <h2 className="text-xl font-bold">{t('mangaViewerTitle')}</h2>
                 <div className="flex items-center gap-4">
                     <button onClick={handleDownloadAll} className="flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-500 transition-colors text-sm">
                        <DownloadIcon className="w-5 h-5" />
                        {t('downloadAll')}
                    </button>
                    <button onClick={onClose} className="p-2 rounded-full bg-white/10 hover:bg-white/20">
                        <XIcon className="w-6 h-6"/>
                    </button>
                 </div>
            </div>

            <div className="flex-grow w-full flex items-center justify-center relative" onClick={e => e.stopPropagation()}>
                <button 
                    onClick={handlePrev} 
                    disabled={pageIndex === 0}
                    className="absolute left-4 p-3 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                >
                    <ChevronLeftIcon className="w-8 h-8 text-white" />
                </button>

                <div className="flex flex-col items-center justify-center gap-4 h-full">
                    {currentPage.generatedImage && (
                         <img 
                            src={currentPage.generatedImage} 
                            alt={`Manga page ${pageIndex + 1}`} 
                            className="max-h-full max-w-full object-contain rounded-md shadow-2xl"
                            style={{ maxHeight: 'calc(100vh - 150px)'}}
                        />
                    )}
                    <p className="text-white/80 font-semibold text-lg bg-black/30 px-4 py-1 rounded-full">
                        {t('pageIndicator').replace('{currentPage}', String(pageIndex + 1)).replace('{totalPages}', String(generatedPages.length))}
                    </p>
                </div>

                 <button 
                    onClick={handleNext} 
                    disabled={pageIndex >= generatedPages.length - 1}
                    className="absolute right-4 p-3 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
                >
                    <ChevronRightIcon className="w-8 h-8 text-white" />
                </button>
            </div>
        </div>
    );
}
