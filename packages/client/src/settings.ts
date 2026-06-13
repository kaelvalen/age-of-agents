import { create } from 'zustand';

export type Lang = 'en' | 'pl';

interface SettingsStore {
  themeId: string;
  /** Język UI. Domyślnie angielski; polski jako alternatywa. */
  lang: Lang;
  setTheme(id: string): void;
  setLang(lang: Lang): void;
}

const STORAGE_KEY = 'agent-citadel.theme';
const LANG_KEY = 'agent-citadel.lang';

export const useSettings = create<SettingsStore>((set) => ({
  themeId: localStorage.getItem(STORAGE_KEY) ?? 'fantasy',
  lang: localStorage.getItem(LANG_KEY) === 'pl' ? 'pl' : 'en', // domyślnie EN
  setTheme: (themeId) => {
    localStorage.setItem(STORAGE_KEY, themeId);
    set({ themeId });
  },
  setLang: (lang) => {
    localStorage.setItem(LANG_KEY, lang);
    set({ lang });
  },
}));
