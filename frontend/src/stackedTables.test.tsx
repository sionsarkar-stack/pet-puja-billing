import { act, cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStackedTables } from './stackedTables'

type ResizeCallback = (entries: Array<{ contentRect: { width: number }; target: Element }>) => void

let resizeCallbacks: ResizeCallback[] = []

class FakeResizeObserver {
    constructor(callback: ResizeCallback) {
        resizeCallbacks.push(callback)
    }

    disconnect() { }

    observe() { }
}

function Harness() {
    const containerRef = useRef<HTMLDivElement>(null)
    useStackedTables(containerRef)

    return (
        <div ref={containerRef}>
            <div data-testid="wrapper">
                <table className="menu-table" data-testid="table" style={{ '--table-min-width': '890px' } as object}>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Price</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Tea</td>
                            <td>10</td>
                            <td><button type="button">Edit</button></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}

describe('useStackedTables', () => {
    beforeEach(() => {
        resizeCallbacks = []
        vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('labels each cell with its column header except actions', () => {
        render(<Harness />)

        expect(screen.getByText('Tea')).toHaveAttribute('data-label', 'Name')
        expect(screen.getByText('10')).toHaveAttribute('data-label', 'Price')
        expect(screen.getByRole('button', { name: 'Edit' }).closest('td')).not.toHaveAttribute('data-label')
    })

    it('switches to cards only while the wrapper is narrower than the table minimum width', () => {
        vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(600)
        render(<Harness />)

        const table = screen.getByTestId('table')
        const wrapper = screen.getByTestId('wrapper')
        expect(table).toHaveAttribute('data-stacked')

        act(() => resizeCallbacks.forEach((callback) => callback([{ contentRect: { width: 1000 }, target: wrapper }])))
        expect(table).not.toHaveAttribute('data-stacked')

        act(() => resizeCallbacks.forEach((callback) => callback([{ contentRect: { width: 720 }, target: wrapper }])))
        expect(table).toHaveAttribute('data-stacked')
    })
})
