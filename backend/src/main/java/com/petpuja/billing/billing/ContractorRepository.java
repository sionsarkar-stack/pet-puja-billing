package com.petpuja.billing.billing;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ContractorRepository extends JpaRepository<Contractor, Long> {

    List<Contractor> findAllByOrderByNameAscIdAsc();
}