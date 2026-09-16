package com.petpuja.billing.billing;

import java.util.List;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/history")
public class HistoryController {

    private final BillRepository billRepository;

    public HistoryController(BillRepository billRepository) {
        this.billRepository = billRepository;
    }

    @GetMapping
    @Transactional(readOnly = true)
    public List<PaidOrderResponse> listPaidOrders() {
        return billRepository.findAllByStatusOrderByPaidAtDesc(BillStatus.PAID).stream()
                .map(PaymentController::toResponse)
                .toList();
    }
}