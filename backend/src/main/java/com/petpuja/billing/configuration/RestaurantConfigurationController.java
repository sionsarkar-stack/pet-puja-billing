package com.petpuja.billing.configuration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RestaurantConfigurationController {

    private final RestaurantConfiguration configuration;

    public RestaurantConfigurationController(
            @Value("${app.restaurant.name:Restaurant}") String restaurantName,
            @Value("${app.payment.upi-vpa:}") String upiVpa,
            @Value("${app.payment.secondary-upi-vpa:}") String secondaryUpiVpa) {
        configuration = new RestaurantConfiguration(restaurantName, upiVpa, secondaryUpiVpa);
    }

    @GetMapping("/api/public-config")
    public RestaurantConfiguration getConfiguration() {
        return configuration;
    }

    public record RestaurantConfiguration(String restaurantName, String upiVpa, String secondaryUpiVpa) {
    }
}