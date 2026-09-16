package com.petpuja.billing.billing;

import java.time.Instant;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ExpenseRepository extends JpaRepository<Expense, Long> {

    List<Expense> findAllByCreatedAtGreaterThanEqualAndCreatedAtLessThan(Instant startOfDay, Instant startOfNextDay);

    List<Expense> findAllByOrderByCreatedAtDesc();
}