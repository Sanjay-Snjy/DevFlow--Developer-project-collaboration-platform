export type ThemeMode = 'dark' | 'light' | 'system';

/** Inline script (non-hook) used in the root layout to avoid theme flash. */
export function themeInitScript(): string {
  return `try{var m=localStorage.getItem('df.theme')||'system';var d=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light')}catch(e){}`;
}
