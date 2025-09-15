import { useContext } from 'react';
import { LocalizationContext } from '../contexts/LocalizationContext';

export const useLocalization = () => {
  const context = useContext(LocalizationContext);
  if (context === undefined) {
    throw new Error('useLocalization must be used within a LocalizationProvider');
  }
  return context;
};
