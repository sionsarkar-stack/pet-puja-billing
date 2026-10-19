import { createContext, useContext } from 'react'

export type RestaurantConfiguration = {
    restaurantName: string
    upiVpa: string
    secondaryUpiVpa?: string
}

export const defaultRestaurantConfiguration: RestaurantConfiguration = {
    restaurantName: 'Restaurant',
    upiVpa: '',
    secondaryUpiVpa: '',
}

export const RestaurantConfigurationContext = createContext(defaultRestaurantConfiguration)

export function useRestaurantConfiguration() {
    return useContext(RestaurantConfigurationContext)
}

export function getRestaurantMark(restaurantName: string) {
    return restaurantName
        .trim()
        .split(/\s+/)
        .filter((word, index) => index > 0 || word.toLowerCase() !== 'the')
        .slice(0, 2)
        .map((word) => word[0]?.toLocaleUpperCase('en-IN') ?? '')
        .join('')
}