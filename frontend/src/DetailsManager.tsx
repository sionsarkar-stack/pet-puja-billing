import { type KeyboardEvent, useRef, useState } from 'react'
import type { UserMode } from './userMode'
import DiscountManager from './DiscountManager'
import MenuManager from './MenuManager'

type DetailsView = 'menu' | 'discount'

const views: Array<{ id: DetailsView; label: string }> = [
    { id: 'menu', label: 'Menu' },
    { id: 'discount', label: 'Discount' },
]

function DetailsManager({ mode }: { mode: UserMode }) {
    const [activeView, setActiveView] = useState<DetailsView>('menu')
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

    function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const nextIndex = event.key === 'Home'
            ? 0
            : event.key === 'End'
                ? views.length - 1
                : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + views.length) % views.length
        const nextView = views[nextIndex]
        setActiveView(nextView.id)
        tabRefs.current[nextIndex]?.focus()
    }

    return (
        <div className="details-workspace">
            <nav aria-label="Details sections" className="details-tabs" role="tablist">
                {views.map((view, index) => (
                    <button
                        aria-controls={`details-panel-${view.id}`}
                        aria-selected={activeView === view.id}
                        id={`details-tab-${view.id}`}
                        key={view.id}
                        onClick={() => setActiveView(view.id)}
                        onKeyDown={(event) => handleTabKeyDown(event, index)}
                        ref={(element) => { tabRefs.current[index] = element }}
                        role="tab"
                        tabIndex={activeView === view.id ? 0 : -1}
                        type="button"
                    >
                        {view.label}
                    </button>
                ))}
            </nav>
            {activeView === 'menu' && (
                <section aria-labelledby="details-tab-menu" className="details-panel" id="details-panel-menu" role="tabpanel">
                    <MenuManager canManage={mode === 'ADMIN'} />
                </section>
            )}
            {activeView === 'discount' && (
                <section aria-labelledby="details-tab-discount" className="details-panel" id="details-panel-discount" role="tabpanel">
                    <DiscountManager canManage={mode === 'ADMIN'} />
                </section>
            )}
        </div>
    )
}

export default DetailsManager
