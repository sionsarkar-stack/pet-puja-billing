package com.petpuja.billing.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotBlank;

@Validated
@ConfigurationProperties(prefix = "app.auth.admin")
public record AdminCredentialsProperties(
        @NotBlank String username,
        @NotBlank String password) {
}