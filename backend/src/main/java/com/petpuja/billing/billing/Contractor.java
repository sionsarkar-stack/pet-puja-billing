package com.petpuja.billing.billing;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

@Entity
@Table(name = "contractor")
public class Contractor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "phone_number", nullable = false, length = 32)
    private String phoneNumber;

    @Column(length = 500)
    private String address;

    @Column(name = "contract_type", length = 120)
    private String contractType;

    @Column(length = 1000)
    private String description;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Contractor() {
    }

    private Contractor(String name, String phoneNumber, String address, String contractType, String description) {
        this.name = name;
        this.phoneNumber = phoneNumber;
        this.address = address;
        this.contractType = contractType;
        this.description = description;
    }

    public static Contractor create(String name, String phoneNumber, String address, String contractType,
            String description) {
        return new Contractor(name, phoneNumber, address, contractType, description);
    }

    public void update(String name, String phoneNumber, String address, String contractType, String description) {
        this.name = name;
        this.phoneNumber = phoneNumber;
        this.address = address;
        this.contractType = contractType;
        this.description = description;
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

    public Long getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }

    public String getAddress() {
        return address;
    }

    public String getContractType() {
        return contractType;
    }

    public String getDescription() {
        return description;
    }
}