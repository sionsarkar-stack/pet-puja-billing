package com.petpuja.billing.billing;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

final class BusinessDay {

    static final ZoneId TIME_ZONE = ZoneId.of("Asia/Kolkata");

    private BusinessDay() {
    }

    static LocalDate dateOf(Instant instant) {
        return instant.atZone(TIME_ZONE).toLocalDate();
    }
}