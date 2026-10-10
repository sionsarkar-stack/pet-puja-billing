export function createUpiPaymentUri(amount: number, seatingName: string, restaurantName: string, upiVpa: string) {
    const parameters = new URLSearchParams({
        pa: upiVpa,
        pn: restaurantName,
        am: amount.toFixed(2),
        cu: 'INR',
        tn: `${restaurantName} - ${seatingName}`,
    })

    return `upi://pay?${parameters.toString()}`
}