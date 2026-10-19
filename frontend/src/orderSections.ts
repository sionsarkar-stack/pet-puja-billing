export type SectionedOrderLine = {
    section?: string | null
}

export type OrderLineSection = 'General' | 'Others'

export type OrderLineGroup<T> = {
    section: OrderLineSection
    lines: T[]
}

export function getOrderLineSection(section?: string | null): OrderLineSection {
    const normalizedSection = section?.trim().toLowerCase()
    return normalizedSection === undefined
        || normalizedSection === ''
        || normalizedSection === 'other'
        || normalizedSection === 'others'
        ? 'Others'
        : 'General'
}

export function groupOrderLines<T extends SectionedOrderLine>(lines: T[]): OrderLineGroup<T>[] {
    const general: T[] = []
    const others: T[] = []

    for (const line of lines) {
        (getOrderLineSection(line.section) === 'Others' ? others : general).push(line)
    }

    const groups: OrderLineGroup<T>[] = [
        { section: 'General', lines: general },
        { section: 'Others', lines: others },
    ]
    return groups.filter((group) => group.lines.length > 0)
}