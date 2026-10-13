package com.petpuja.billing.billing;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "business_day_state")
public class BusinessDayState {

    private static final int SINGLETON_ID = 1;

    @Id
    private Integer id;

    @Column(name = "started_at")
    private Instant startedAt;

    protected BusinessDayState() {
    }

    static BusinessDayState empty() {
        var state = new BusinessDayState();
        state.id = SINGLETON_ID;
        return state;
    }

    void start(Instant instant) {
        startedAt = instant;
    }

    void end() {
        startedAt = null;
    }

    public Instant getStartedAt() {
        return startedAt;
    }
}