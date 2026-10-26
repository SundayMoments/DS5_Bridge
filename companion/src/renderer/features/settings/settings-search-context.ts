import { createContext, useContext } from 'react';

export const SettingsSearchContext = createContext('');
export const useSettingsSearch = () => useContext(SettingsSearchContext);
