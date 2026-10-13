const BUSINESS_TIME_ZONE = 'Asia/Kolkata'
const BUSINESS_START_HOUR = 4

type CalendarDate = {
    day: number
    month: number
    year: number
}

function parseCalendarDate(value: string): CalendarDate | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    if (!match) return null

    const [, yearText, monthText, dayText] = match
    const year = Number(yearText)
    const month = Number(monthText)
    const day = Number(dayText)
    const checkDate = new Date(Date.UTC(year, month - 1, day))
    if (checkDate.getUTCFullYear() !== year || checkDate.getUTCMonth() !== month - 1 || checkDate.getUTCDate() !== day) {
        return null
    }

    return { day, month, year }
}

function formatCalendarDate(date: Date) {
    return [
        date.getUTCFullYear(),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0'),
    ].join('-')
}

export function shiftCalendarDate(value: string, days: number) {
    const parts = parseCalendarDate(value)
    if (parts === null) return null

    const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))
    return formatCalendarDate(shifted)
}

export function getBusinessDayStart(value: string) {
    if (parseCalendarDate(value) === null) return null
    return new Date(`${value}T${String(BUSINESS_START_HOUR).padStart(2, '0')}:00:00+05:30`)
}

export function getBusinessDateInputValue(now: Date) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        month: '2-digit',
        timeZone: BUSINESS_TIME_ZONE,
        year: 'numeric',
    }).formatToParts(now)
    const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === type)?.value)
    const date = new Date(Date.UTC(part('year'), part('month') - 1, part('day')))
    if (part('hour') < BUSINESS_START_HOUR) date.setUTCDate(date.getUTCDate() - 1)
    return formatCalendarDate(date)
}