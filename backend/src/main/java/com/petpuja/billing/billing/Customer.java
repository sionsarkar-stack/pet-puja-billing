package com.petpuja.billing.billing;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "customer")
public class Customer {

    @Id
    @Column(name = "phone_number", nullable = false, length = 16)
    private String phoneNumber;

    @Column(length = 100)
    private String name;

    @Column(name = "date_of_birth")
    private LocalDate dateOfBirth;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Customer() {
    }

    private Customer(String phoneNumber) {
        this.phoneNumber = phoneNumber;
    }

    public static Customer create(String phoneNumber) {
        return new Customer(phoneNumber);
    }

    public void updateDetails(String name, LocalDate dateOfBirth) {
        if (name != null && !name.isBlank()) {
            this.name = name.strip();
        }
        if (dateOfBirth != null) {
            this.dateOfBirth = dateOfBirth;
        }
    }

    public void replaceDetails(String name, LocalDate dateOfBirth) {
        this.name = name == null || name.isBlank() ? null : name.strip();
        this.dateOfBirth = dateOfBirth;
    }

    @PrePersist
    void initializeTimestamps() {
        var now = Instant.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void updateTimestamp() {
        updatedAt = Instant.now();
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }

    public String getName() {
        return name;
    }

    public LocalDate getDateOfBirth() {
        return dateOfBirth;
    }
}