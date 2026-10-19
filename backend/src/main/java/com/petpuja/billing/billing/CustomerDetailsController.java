package com.petpuja.billing.billing;

import java.time.LocalDate;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;

@RestController
@RequestMapping("/api/customers")
public class CustomerDetailsController {

    private final CustomerRepository customerRepository;
    private final CustomerService customerService;

    public CustomerDetailsController(CustomerRepository customerRepository, CustomerService customerService) {
        this.customerRepository = customerRepository;
        this.customerService = customerService;
    }

    @GetMapping("/search")
    @Transactional(readOnly = true)
    public List<CustomerDetailsResponse> searchCustomers(@RequestParam String query) {
        var normalizedQuery = query == null ? "" : query.strip();
        if (normalizedQuery.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a name or phone number");
        }

        if (normalizedQuery.matches("[+0-9() .-]+")) {
            var normalizedPhone = CustomerService.normalizePhoneNumber(normalizedQuery);
            if (normalizedPhone == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid 10-digit mobile number");
            }
            return customerRepository.findById(normalizedPhone)
                    .map(customer -> List.of(toResponse(customer)))
                    .orElseGet(List::of);
        }

        return customerRepository.findTop25ByNameContainingIgnoreCaseOrderByNameAscPhoneNumberAsc(normalizedQuery)
                .stream()
                .map(CustomerDetailsController::toResponse)
                .toList();
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<CustomerDetailsResponse> listCustomers() {
        return customerRepository.findAllByOrderByNameAscPhoneNumberAsc().stream()
                .map(CustomerDetailsController::toResponse)
                .toList();
    }

    @PostMapping
    @Transactional
    public ResponseEntity<CustomerDetailsResponse> saveCustomer(@Valid @RequestBody SaveCustomerRequest request) {
        var customer = customerService.saveContact(request.phoneNumber(), request.name(), request.dateOfBirth());
        return ResponseEntity.status(HttpStatus.OK).body(new CustomerDetailsResponse(
                customer.getName(), customer.getPhoneNumber(), customer.getDateOfBirth()));
    }

    @PutMapping("/{phoneNumber}")
    @Transactional
    public ResponseEntity<CustomerDetailsResponse> updateCustomer(
            @PathVariable String phoneNumber,
            @Valid @RequestBody SaveCustomerRequest request) {
        var customer = customerService.updateContact(
                phoneNumber, request.phoneNumber(), request.name(), request.dateOfBirth());
        return ResponseEntity.ok(new CustomerDetailsResponse(
                customer.getName(), customer.getPhoneNumber(), customer.getDateOfBirth()));
    }

    @DeleteMapping("/{phoneNumber}")
    @Transactional
    public ResponseEntity<Void> deleteCustomer(@PathVariable String phoneNumber) {
        customerService.deleteContact(phoneNumber);
        return ResponseEntity.noContent().build();
    }

    public record SaveCustomerRequest(
            @NotBlank @Size(max = 32) String phoneNumber,
            @Size(max = 100) String name,
            @PastOrPresent LocalDate dateOfBirth) {
    }

    public record CustomerDetailsResponse(String name, String phoneNumber, LocalDate dateOfBirth) {
    }

    private static CustomerDetailsResponse toResponse(Customer customer) {
        return new CustomerDetailsResponse(customer.getName(), customer.getPhoneNumber(), customer.getDateOfBirth());
    }
}