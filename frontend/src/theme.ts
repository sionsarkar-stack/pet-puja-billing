export type ThemePreference = 'light' | 'dark'

const themeStorageKey = 'pet-puja-theme'

export function readThemePreference(): ThemePreference {
    try {
        return localStorage.getItem(themeStorageKey) === 'light' ? 'light' : 'dark'
    } catch {
        return 'dark'
    }
}

export function saveThemePreference(theme: ThemePreference) {
    try {
        localStorage.setItem(themeStorageKey, theme)
    } catch {
        return
    }
}