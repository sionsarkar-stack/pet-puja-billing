package com.petpuja.billing.billing;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DailyClosingRepository extends JpaRepository<DailyClosing, Long> {

    boolean existsByClosingDate(LocalDate closingDate);

    List<DailyClosing> findAllByOrderByClosingDateDesc();
}