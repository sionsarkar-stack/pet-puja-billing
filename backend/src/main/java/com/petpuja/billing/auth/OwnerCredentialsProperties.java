package com.petpuja.billing.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotBlank;

@Validated
@ConfigurationProperties(prefix = "app.auth.owner")
public record OwnerCredentialsProperties(
        @NotBlank String username,
        @NotBlank String password) {
}