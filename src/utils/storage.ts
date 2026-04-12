
import { Employee, AppSettings, Annotation } from '../types';

export interface StorageData {
  orgName: string;
  versionDate?: string;
  employees: Employee[];
  annotations: Annotation[];
  settings: AppSettings;
  lastSaved: string;
}

const STORAGE_KEY = 'org_chart_pro_data';

export const saveToLocalStorage = (data: Omit<StorageData, 'lastSaved'>) => {
  const payload: StorageData = {
    ...data,
    lastSaved: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const loadFromLocalStorage = (): StorageData | null => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch (e) {
    console.error('Failed to parse storage data', e);
    return null;
  }
};

export const clearLocalStorage = () => {
  localStorage.removeItem(STORAGE_KEY);
};

export const getStorageSize = () => {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return '0 KB';
  const size = new Blob([data]).size;
  if (size < 1024) return `${size} B`;
  return `${(size / 1024).toFixed(2)} KB`;
};
