import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readThemePreference, saveThemePreference } from './theme'

describe('theme preference', () => {
    const values = new Map<string, string>()

    beforeEach(() => {
        values.clear()
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
        })
    })

    afterEach(() => vi.unstubAllGlobals())

    it('defaults to dark when no preference has been saved', () => {
        expect(readThemePreference()).toBe('dark')
    })

    it('preserves an explicitly selected light theme', () => {
        saveThemePreference('light')

        expect(readThemePreference()).toBe('light')
    })
})