export const menuSections = [
    { name: 'Quick Bites', subsections: [] },
    { name: 'Salads', subsections: [] },
    { name: 'Momos', subsections: [] },
    { name: 'Soups', subsections: [] },
    { name: 'Beverages', subsections: ['Hot Beverages', 'Cold Beverages'] },
    { name: 'Continental', subsections: ['Starters', 'Sandwiches', 'Pizza', 'Pasta'] },
    { name: 'Chinese', subsections: ['Noodles & Rice', 'Main Course', 'Starters'] },
    { name: 'Other', subsections: [] },
]

type SectionedMenuItem = {
    name: string
    section: string
    subsection: string
}

export function getSubsections(section: string) {
    return menuSections.find((menuSection) => menuSection.name === section)?.subsections ?? []
}

function getSectionOrder(section: string) {
    const index = menuSections.findIndex((menuSection) => menuSection.name === section)
    return index === -1 ? menuSections.length : index
}

function getSubsectionOrder(section: string, subsection: string) {
    const index = getSubsections(section).indexOf(subsection)
    return index === -1 ? getSubsections(section).length : index
}

export function sortMenuItems<T extends SectionedMenuItem>(items: T[]) {
    return [...items].sort((leftItem, rightItem) => {
        const sectionOrder = getSectionOrder(leftItem.section) - getSectionOrder(rightItem.section)
        const subsectionOrder = getSubsectionOrder(leftItem.section, leftItem.subsection)
            - getSubsectionOrder(rightItem.section, rightItem.subsection)
        return sectionOrder || subsectionOrder || leftItem.name.localeCompare(rightItem.name)
    })
}

export function groupMenuItems<T extends SectionedMenuItem>(items: T[]) {
    const knownSections = menuSections.map((menuSection) => menuSection.name)
    const unknownSections = [...new Set(items.map((item) => item.section))]
        .filter((section) => !knownSections.includes(section))
        .sort((leftSection, rightSection) => leftSection.localeCompare(rightSection))

    return [...knownSections, ...unknownSections].map((section) => ({
        section,
        items: items.filter((item) => item.section === section && item.subsection === ''),
        subsections: getSubsections(section).map((subsection) => ({
            subsection,
            items: items.filter((item) => item.section === section && item.subsection === subsection),
        })).filter((group) => group.items.length > 0),
    })).filter((group) => group.items.length > 0 || group.subsections.length > 0)
}