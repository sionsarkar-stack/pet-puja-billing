package com.petpuja.billing.billing;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import jakarta.persistence.LockModeType;

public interface BusinessDayStateRepository extends JpaRepository<BusinessDayState, Integer> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select state from BusinessDayState state where state.id = :id")
    Optional<BusinessDayState> findByIdForUpdate(@Param("id") Integer id);
}