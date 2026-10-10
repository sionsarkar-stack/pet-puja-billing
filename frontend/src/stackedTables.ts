import { type RefObject, useEffect } from 'react'

const STACKABLE_TABLES = '.menu-table, .financial-table, .table-order-table'

function labelTableCells(table: HTMLTableElement) {
    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead th'))
    if (headers.length === 0) return

    const labels = headers.map((header) => header.textContent?.trim() ?? '')
    table.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((row) => {
        let column = 0
        Array.from(row.cells).forEach((cell) => {
            const label = labels[column] ?? ''
            const isActionColumn = label.toLowerCase() === 'actions'
            if (cell.tagName === 'TD' && label !== '' && !isActionColumn) {
                if (cell.dataset.label !== label) cell.dataset.label = label
            } else if (cell.dataset.label !== undefined) {
                delete cell.dataset.label
            }
            column += cell.colSpan
        })
    })
}

// Shows a table as labelled cards when its CSS minimum width no longer fits in its wrapper.
function updateStacking(table: HTMLTableElement, availableWidth: number) {
    const minWidth = Number.parseFloat(getComputedStyle(table).getPropertyValue('--table-min-width'))
    table.toggleAttribute('data-stacked', Number.isFinite(minWidth) && minWidth > availableWidth + 1)
}

// Labels each cell with its column header and switches tables to cards instead of scrolling sideways.
export function useStackedTables(containerRef: RefObject<HTMLElement | null>) {
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const resizeObserver = typeof ResizeObserver === 'undefined'
            ? null
            : new ResizeObserver((entries) => {
                entries.forEach((entry) => {
                    const table = entry.target.querySelector<HTMLTableElement>(STACKABLE_TABLES)
                    if (table) updateStacking(table, entry.contentRect.width)
                })
            })

        const refresh = () => {
            resizeObserver?.disconnect()
            container.querySelectorAll<HTMLTableElement>(STACKABLE_TABLES).forEach((table) => {
                labelTableCells(table)

                const wrapper = table.parentElement
                if (!wrapper) return
                updateStacking(table, wrapper.clientWidth)
                resizeObserver?.observe(wrapper)
            })
        }
        refresh()

        const mutationObserver = new MutationObserver(refresh)
        mutationObserver.observe(container, { childList: true, subtree: true })
        return () => {
            mutationObserver.disconnect()
            resizeObserver?.disconnect()
        }
    }, [containerRef])
}
