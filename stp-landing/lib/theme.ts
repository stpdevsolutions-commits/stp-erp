export const THEME_KEY = 'stp-theme'

/**
 * Se ejecuta en <head> antes de pintar: aplica el tema guardado (o el del sistema) para
 * que no haya un destello claro antes del oscuro. Es texto plano para `dangerouslySetInnerHTML`.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`
