import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BackupManager from './BackupManager'

describe('BackupManager', () => {
    const storage = new Map<string, string>()

    beforeEach(() => {
        vi.stubGlobal('localStorage', {
            clear: () => storage.clear(),
            getItem: (key: string) => storage.get(key) ?? null,
            removeItem: (key: string) => storage.delete(key),
            setItem: (key: string, value: string) => storage.set(key, value),
        })
    })

    afterEach(() => {
        cleanup()
        storage.clear()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('downloads the local database archive returned by the API', async () => {
        const createObjectUrl = vi.fn(() => 'blob:backup')
        const revokeObjectUrl = vi.fn()
        vi.stubGlobal('URL', { createObjectURL: createObjectUrl, revokeObjectURL: revokeObjectUrl })
        const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { })
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('backup archive', {
            headers: {
                'Content-Disposition': 'attachment; filename="pet-puja-backup-test.zip"',
                'Content-Type': 'application/zip',
            },
        }))
        const user = userEvent.setup()

        render(<BackupManager />)

        expect(screen.getByText('No backup has been recorded in this browser.')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Download backup' }))

        expect(fetchMock).toHaveBeenCalledWith('/api/backups/local-database', { credentials: 'include' })
        expect(createObjectUrl).toHaveBeenCalledOnce()
        expect(anchorClick).toHaveBeenCalledOnce()
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:backup')
        expect(await screen.findByText('Local database backup downloaded.')).toBeInTheDocument()
        expect(screen.getByText(/Last backup downloaded/)).toBeInTheDocument()
        expect(storage.get('pet-puja:last-local-backup-at')).toBeDefined()
    })

    it('warns when the latest browser-recorded backup is older than seven days', async () => {
        const staleBackupAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
        storage.set('pet-puja:last-local-backup-at', staleBackupAt.toISOString())
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('backup archive'))

        render(<BackupManager />)

        expect(await screen.findByText('This backup is older than 7 days. Create a fresh archive.')).toBeInTheDocument()
    })
})