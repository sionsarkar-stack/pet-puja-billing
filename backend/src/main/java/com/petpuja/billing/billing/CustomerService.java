package com.petpuja.billing.billing;

import java.time.LocalDate;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CustomerService {

    private final CustomerRepository customerRepository;
    private final BillRepository billRepository;

    public CustomerService(CustomerRepository customerRepository, BillRepository billRepository) {
        this.customerRepository = customerRepository;
        this.billRepository = billRepository;
    }

    @Transactional
    public Customer saveOrderDetails(String phoneNumber, String name, LocalDate dateOfBirth) {
        var normalizedPhone = normalizePhoneNumber(phoneNumber);
        if (normalizedPhone == null)
            return null;

        return saveNormalizedDetails(normalizedPhone, name, dateOfBirth);
    }

    @Transactional
    public Customer saveContact(String phoneNumber, String name, LocalDate dateOfBirth) {
        var normalizedPhone = normalizePhoneNumber(phoneNumber);
        if (normalizedPhone == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid phone number");
        }

        return saveNormalizedDetails(normalizedPhone, name, dateOfBirth);
    }

    @Transactional
    public Customer updateContact(String currentPhoneNumber, String phoneNumber, String name, LocalDate dateOfBirth) {
        var currentPhone = normalizePhoneNumber(currentPhoneNumber);
        var nextPhone = normalizePhoneNumber(phoneNumber);
        if (currentPhone == null || nextPhone == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid phone number");
        }

        var currentCustomer = customerRepository.findById(currentPhone)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer not found"));
        if (currentPhone.equals(nextPhone)) {
            currentCustomer.replaceDetails(name, dateOfBirth);
            return customerRepository.save(currentCustomer);
        }
        if (customerRepository.existsById(nextPhone)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A customer already uses that phone number");
        }

        var replacement = Customer.create(nextPhone);
        replacement.replaceDetails(name, dateOfBirth);
        var savedReplacement = customerRepository.saveAndFlush(replacement);
        billRepository.reassignCustomer(currentPhone, savedReplacement);
        customerRepository.delete(currentCustomer);
        return savedReplacement;
    }

    @Transactional
    public void deleteContact(String phoneNumber) {
        var normalizedPhone = normalizePhoneNumber(phoneNumber);
        if (normalizedPhone == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid phone number");
        }

        var customer = customerRepository.findById(normalizedPhone)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer not found"));
        billRepository.detachCustomer(normalizedPhone);
        customerRepository.delete(customer);
    }

    private Customer saveNormalizedDetails(String normalizedPhone, String name, LocalDate dateOfBirth) {
        var customer = customerRepository.findById(normalizedPhone)
                .orElseGet(() -> Customer.create(normalizedPhone));
        customer.updateDetails(name, dateOfBirth);
        return customerRepository.save(customer);
    }

    public static String normalizePhoneNumber(String phoneNumber) {
        if (phoneNumber == null || phoneNumber.isBlank())
            return null;

        var digits = phoneNumber.replaceAll("\\D", "");
        if (digits.length() == 11 && digits.startsWith("0")) {
            digits = digits.substring(1);
        }
        if (digits.length() == 10) {
            digits = "91" + digits;
        }
        if (!digits.matches("91[6-9][0-9]{9}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid phone number");
        }
        return "+" + digits;
    }
}