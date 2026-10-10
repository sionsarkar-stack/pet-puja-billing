package com.petpuja.billing.configuration;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class RestaurantConfigurationControllerTest {

    @Test
    void returnsConfiguredRestaurantNameAndUpiVpa() {
        var controller = new RestaurantConfigurationController("The Third Break", "sionsarkar@okicici");

        assertThat(controller.getConfiguration().restaurantName()).isEqualTo("The Third Break");
        assertThat(controller.getConfiguration().upiVpa()).isEqualTo("sionsarkar@okicici");
    }
}