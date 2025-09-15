import React, { useState, useCallback, useRef, useEffect } from 'react';
import { UploadIcon, CheckCircleIcon } from './icons';

interface CharacterUploaderProps {
  onImageUpload: (base64: string) => void;
  hasImage: boolean;
  image: string | null;
}

export function CharacterUploader({ onImageUpload, hasImage, image }: CharacterUploaderProps): React.ReactElement {
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(image);
  }, [image]);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setPreview(base64String);
        onImageUpload(base64String);
      };
      reader.readAsDataURL(file);
    }
  }, [onImageUpload]);
  
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-md font-semibold text-gray-700">1. Upload Character Sheet</h2>
        {hasImage && <CheckCircleIcon className="w-6 h-6 text-green-500" />}
      </div>
      <div 
        onClick={handleClick}
        className="cursor-pointer border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-indigo-500 hover:bg-indigo-50 transition-colors"
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/png, image/jpeg, image/webp"
          className="hidden"
        />
        {preview ? (
          <div className="relative group">
            <img src={preview} alt="Character preview" className="mx-auto max-h-40 rounded-md" />
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
                <p className="text-white font-semibold text-sm">Click to change image</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6">
            <UploadIcon className="w-10 h-10 text-gray-400 mb-2" />
            <p className="font-semibold text-gray-600">Click to upload</p>
            <p className="text-sm text-gray-400">PNG, JPG, WEBP</p>
          </div>
        )}
      </div>
    </div>
  );
}