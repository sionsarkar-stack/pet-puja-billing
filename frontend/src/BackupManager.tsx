import { useState } from 'react'
import { apiBaseUrl, formatDateTime } from './financial'

type BackupMessage = {
    text: string
    tone: 'error' | 'success'
}

type BackupStatus = {
    isStale: boolean
    lastBackupAt: Date | null
}

const backupTimestampStorageKey = 'pet-puja:last-local-backup-at'
const backupFreshnessWindowMs = 7 * 24 * 60 * 60 * 1000

function getBackupFileName(contentDisposition: string | null) {
    const fileNameMatch = contentDisposition?.match(/filename="([^"]+)"/i)
    return fileNameMatch?.[1] ?? 'pet-puja-backup.zip'
}

function getLastBackupAt() {
    try {
        const savedTimestamp = localStorage.getItem(backupTimestampStorageKey)
        if (savedTimestamp === null) return null

        const lastBackupAt = new Date(savedTimestamp)
        return Number.isNaN(lastBackupAt.getTime()) ? null : lastBackupAt
    } catch {
        return null
    }
}

function getInitialBackupStatus(): BackupStatus {
    const lastBackupAt = getLastBackupAt()

    return {
        isStale: lastBackupAt !== null && Date.now() - lastBackupAt.getTime() > backupFreshnessWindowMs,
        lastBackupAt,
    }
}

function saveLastBackupAt(lastBackupAt: Date) {
    try {
        localStorage.setItem(backupTimestampStorageKey, lastBackupAt.toISOString())
    } catch {
        // A downloaded backup remains valid when browser storage is unavailable.
    }
}

function BackupManager() {
    const [message, setMessage] = useState<BackupMessage | null>(null)
    const [isDownloading, setIsDownloading] = useState(false)
    const [{ isStale: isBackupStale, lastBackupAt }, setBackupStatus] = useState(getInitialBackupStatus)

    async function downloadBackup() {
        setIsDownloading(true)
        setMessage(null)

        try {
            const response = await fetch(`${apiBaseUrl}/api/backups/local-database`, {
                credentials: 'include',
            })
            if (response.status === 501) {
                setMessage({ text: 'Local database backup is available only with the H2 local profile.', tone: 'error' })
                return
            }
            if (!response.ok) {
                throw new Error('Backup download failed')
            }

            const backup = await response.blob()
            if (backup.size === 0) {
                throw new Error('Backup is empty')
            }

            const backupUrl = URL.createObjectURL(backup)
            const downloadLink = document.createElement('a')
            downloadLink.download = getBackupFileName(response.headers.get('Content-Disposition'))
            downloadLink.href = backupUrl
            document.body.append(downloadLink)
            downloadLink.click()
            downloadLink.remove()
            URL.revokeObjectURL(backupUrl)
            const downloadedAt = new Date()
            saveLastBackupAt(downloadedAt)
            setBackupStatus({ isStale: false, lastBackupAt: downloadedAt })
            setMessage({ text: 'Local database backup downloaded.', tone: 'success' })
        } catch {
            setMessage({ text: 'We could not create a backup. Please try again.', tone: 'error' })
        } finally {
            setIsDownloading(false)
        }
    }

    return (
        <div className="backup-workspace">
            <header className="backup-page-heading">
                <div>
                    <p className="eyebrow">Backup</p>
                    <h1>Database backup</h1>
                </div>
                <p>Download a restorable archive of the local restaurant data.</p>
            </header>

            <section aria-labelledby="backup-action-heading" className="backup-action">
                <div>
                    <p className="eyebrow">Local storage</p>
                    <h2 id="backup-action-heading">Create an archive</h2>
                </div>
                <button className="backup-download-button" disabled={isDownloading} onClick={downloadBackup} type="button">
                    {isDownloading ? 'Preparing backup...' : 'Download backup'}
                </button>
            </section>
            <section aria-label="Backup status" className={`backup-status ${lastBackupAt === null || isBackupStale ? 'backup-status-warning' : 'backup-status-current'}`}>
                <p>Backup status</p>
                {lastBackupAt === null ? (
                    <strong>No backup has been recorded in this browser.</strong>
                ) : (
                    <strong>Last backup downloaded {formatDateTime(lastBackupAt.toISOString())}.</strong>
                )}
                <span>
                    {lastBackupAt === null
                        ? 'Create a backup before closing out the day.'
                        : isBackupStale
                            ? 'This backup is older than 7 days. Create a fresh archive.'
                            : 'Your latest recorded backup is current.'}
                </span>
            </section>
            {message && (
                <p className={`financial-message financial-message-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
                    {message.text}
                </p>
            )}
        </div>
    )
}

export default BackupManager