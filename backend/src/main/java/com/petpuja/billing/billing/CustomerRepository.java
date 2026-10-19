package com.petpuja.billing.billing;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomerRepository extends JpaRepository<Customer, String> {

    List<Customer> findAllByOrderByNameAscPhoneNumberAsc();

    List<Customer> findTop25ByNameContainingIgnoreCaseOrderByNameAscPhoneNumberAsc(String name);
}