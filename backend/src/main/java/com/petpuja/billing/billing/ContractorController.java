package com.petpuja.billing.billing;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Validated
@RestController
@RequestMapping("/api/contractors")
public class ContractorController {

    private final ContractorRepository contractorRepository;

    public ContractorController(ContractorRepository contractorRepository) {
        this.contractorRepository = contractorRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<ContractorResponse> listContractors() {
        return contractorRepository.findAllByOrderByNameAscIdAsc().stream()
                .map(ContractorController::toResponse)
                .toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public ContractorResponse createContractor(@Valid @RequestBody ContractorRequest request) {
        var contractor = Contractor.create(
                request.name().trim(),
                request.phoneNumber().trim(),
                normalizeOptional(request.address()),
                normalizeOptional(request.contractType()),
                normalizeOptional(request.description()));
        return toResponse(contractorRepository.save(contractor));
    }

    @PutMapping("/{contractorId}")
    @Transactional
    public ContractorResponse updateContractor(
            @PathVariable long contractorId,
            @Valid @RequestBody ContractorRequest request) {
        var contractor = findContractor(contractorId);
        contractor.update(
                request.name().trim(),
                request.phoneNumber().trim(),
                normalizeOptional(request.address()),
                normalizeOptional(request.contractType()),
                normalizeOptional(request.description()));
        return toResponse(contractorRepository.save(contractor));
    }

    @DeleteMapping("/{contractorId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    public void deleteContractor(@PathVariable long contractorId) {
        contractorRepository.delete(findContractor(contractorId));
    }

    private Contractor findContractor(long contractorId) {
        return contractorRepository.findById(contractorId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Contractor not found"));
    }

    private static String normalizeOptional(String value) {
        if (value == null || value.isBlank())
            return null;
        return value.trim();
    }

    private static ContractorResponse toResponse(Contractor contractor) {
        return new ContractorResponse(contractor.getId(), contractor.getName(), contractor.getPhoneNumber(),
                contractor.getAddress(), contractor.getContractType(), contractor.getDescription());
    }

    public record ContractorRequest(
            @NotBlank @Size(max = 120) String name,
            @NotBlank @Size(max = 32) @Pattern(regexp = "[+0-9() .-]+") String phoneNumber,
            @Size(max = 500) String address,
            @Size(max = 120) String contractType,
            @Size(max = 1000) String description) {
    }

    public record ContractorResponse(
            Long id,
            String name,
            String phoneNumber,
            String address,
            String contractType,
            String description) {
    }
}