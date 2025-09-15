import { useState, useEffect } from 'react';

export const useApiKey = () => {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  useEffect(() => {
    // Check localStorage for API key
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    } else {
      // Check environment variable (via Vite define)
      const envKey = (typeof process !== 'undefined' && process.env.GEMINI_API_KEY) || '';
      if (envKey && envKey !== '""' && envKey !== 'undefined') {
        setApiKey(envKey);
      }
      // Do not automatically open modal - let user trigger it
    }
  }, []);

  const saveApiKey = (key: string) => {
    localStorage.setItem('gemini_api_key', key);
    setApiKey(key);
    setIsApiKeyModalOpen(false);
  };

  const clearApiKey = () => {
    localStorage.removeItem('gemini_api_key');
    setApiKey(null);
  };

  return {
    apiKey,
    isApiKeyModalOpen,
    setIsApiKeyModalOpen,
    saveApiKey,
    clearApiKey,
    hasApiKey: !!apiKey,
  };
};