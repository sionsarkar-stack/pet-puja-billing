package com.petpuja.billing.billing;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.web.FilterChainProxy;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

import com.petpuja.billing.menu.MenuItem;
import com.petpuja.billing.menu.MenuItemRepository;

@SpringBootTest
class FinancialControllerTest {

        @Autowired
        private WebApplicationContext context;

        @Autowired
        private FilterChainProxy springSecurityFilterChain;

        @Autowired
        private BillRepository billRepository;

        @Autowired
        private ExpenseRepository expenseRepository;

        @Autowired
        private DailyClosingRepository dailyClosingRepository;

        @Autowired
        private BillRefundRepository billRefundRepository;

        @Autowired
        private MenuItemRepository menuItemRepository;

        private MockMvc mockMvc;

        @BeforeEach
        void setUp() {
                billRefundRepository.deleteAll();
                billRepository.deleteAll();
                expenseRepository.deleteAll();
                dailyClosingRepository.deleteAll();
                menuItemRepository.deleteAll();
                mockMvc = MockMvcBuilders.webAppContextSetup(context)
                                .addFilters(springSecurityFilterChain)
                                .build();
        }

        @Test
        void recordsPaidOrdersInHistoryAndCalculatesRevenueAfterExpenses() throws Exception {
                var menuItem = menuItemRepository.save(MenuItem.create(
                                "Paneer Tikka",
                                "Char-grilled paneer",
                                new BigDecimal("10.00"),
                                new BigDecimal("200.00")));
                var ownerSession = signIn();

                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Outdoor 3","lines":[{"menuItemId":%d,"quantity":2}],"completed":true}
                                                """
                                                .formatted(menuItem.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.tableName").value("Outdoor 3"))
                                .andExpect(jsonPath("$.completed").value(true))
                                .andExpect(jsonPath("$.lines[0].unitPrice").value(180))
                                .andExpect(jsonPath("$.lines[0].lineTotal").value(360))
                                .andExpect(jsonPath("$.total").value(360));

                mockMvc.perform(get("/api/open-orders").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].tableName").value("Outdoor 3"))
                                .andExpect(jsonPath("$[0].completed").value(true))
                                .andExpect(jsonPath("$[0].lines[0].quantity").value(2))
                                .andExpect(jsonPath("$[0].total").value(360));

                mockMvc.perform(post("/api/payments")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Outdoor 3","paymentMethod":"CASH"}
                                                """))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.tableName").value("Outdoor 3"))
                                .andExpect(jsonPath("$.paymentMethod").value("CASH"))
                                .andExpect(jsonPath("$.lines[0].unitPrice").value(180))
                                .andExpect(jsonPath("$.lines[0].lineTotal").value(360))
                                .andExpect(jsonPath("$.total").value(360));

                mockMvc.perform(get("/api/open-orders").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$").isEmpty());

                mockMvc.perform(get("/api/history").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].tableName").value("Outdoor 3"))
                                .andExpect(jsonPath("$[0].paymentMethod").value("CASH"))
                                .andExpect(jsonPath("$[0].total").value(360));

                mockMvc.perform(post("/api/expenses")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"Vegetables","amount":75,"addedBy":"Owner","description":"Morning market"}
                                                """))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.title").value("Vegetables"))
                                .andExpect(jsonPath("$.amount").value(75))
                                .andExpect(jsonPath("$.addedBy").value("Owner"));

                mockMvc.perform(get("/api/balance-sheet").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.profits").value(360))
                                .andExpect(jsonPath("$.refunds").value(0))
                                .andExpect(jsonPath("$.expenses").value(75))
                                .andExpect(jsonPath("$.revenue").value(285));
        }

        @Test
        void requiresTheOwnerSessionForFinancialRecords() throws Exception {
                mockMvc.perform(get("/api/history"))
                                .andExpect(status().isUnauthorized());
        }

        @Test
        void requiresAnOrderToBeCompletedBeforePayment() throws Exception {
                var menuItem = menuItemRepository.save(MenuItem.create(
                                "Masala Dosa",
                                "Crisp dosa with potato filling",
                                BigDecimal.ZERO,
                                new BigDecimal("120.00")));
                var ownerSession = signIn();

                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 1","lines":[{"menuItemId":%d,"quantity":1}],"completed":false}
                                                """
                                                .formatted(menuItem.getId())))
                                .andExpect(status().isOk());

                mockMvc.perform(post("/api/payments")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 1","paymentMethod":"CASH"}
                                                """))
                                .andExpect(status().isConflict());
        }

        @Test
        void closesADayWithCashOnlineSalesAndExpenses() throws Exception {
                var menuItem = menuItemRepository.save(MenuItem.create(
                                "Masala Dosa",
                                "Crisp dosa with potato filling",
                                BigDecimal.ZERO,
                                new BigDecimal("120.00")));
                var cashBill = Bill.createPaid("PP-CASH", "Table 1", PaymentMethod.CASH, Instant.now());
                cashBill.addLine(menuItem, 1, new BigDecimal("120.00"));
                billRepository.save(cashBill);
                var onlineBill = Bill.createPaid("PP-ONLINE", "Outdoor 1", PaymentMethod.ONLINE, Instant.now());
                onlineBill.addLine(menuItem, 2, new BigDecimal("120.00"));
                billRepository.save(onlineBill);
                expenseRepository.save(Expense.create("Vegetables", new BigDecimal("75.00"), "Owner", null));
                var ownerSession = signIn();
                var today = LocalDate.now().toString();

                mockMvc.perform(get("/api/daily-closings/preview")
                                .param("closingDate", today)
                                .session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.closingDate").value(today))
                                .andExpect(jsonPath("$.cashSales").value(120))
                                .andExpect(jsonPath("$.onlineSales").value(240))
                                .andExpect(jsonPath("$.profits").value(360))
                                .andExpect(jsonPath("$.refunds").value(0))
                                .andExpect(jsonPath("$.expenses").value(75))
                                .andExpect(jsonPath("$.revenue").value(285))
                                .andExpect(jsonPath("$.paidOrderCount").value(2))
                                .andExpect(jsonPath("$.expenseCount").value(1));

                mockMvc.perform(post("/api/daily-closings")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"closingDate":"%s"}
                                                """.formatted(today)))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.closingDate").value(today))
                                .andExpect(jsonPath("$.cashSales").value(120))
                                .andExpect(jsonPath("$.onlineSales").value(240))
                                .andExpect(jsonPath("$.profits").value(360))
                                .andExpect(jsonPath("$.refunds").value(0))
                                .andExpect(jsonPath("$.expenses").value(75))
                                .andExpect(jsonPath("$.revenue").value(285))
                                .andExpect(jsonPath("$.paidOrderCount").value(2))
                                .andExpect(jsonPath("$.expenseCount").value(1));

                mockMvc.perform(post("/api/daily-closings")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"closingDate":"%s"}
                                                """.formatted(today)))
                                .andExpect(status().isConflict());

                mockMvc.perform(get("/api/daily-closings").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].closingDate").value(today))
                                .andExpect(jsonPath("$[0].revenue").value(285));
        }

        @Test
        void recordsRefundsAsNewAdjustmentsWithoutChangingDailyClosingSnapshots() throws Exception {
                var menuItem = menuItemRepository.save(MenuItem.create(
                                "Masala Dosa",
                                "Crisp dosa with potato filling",
                                BigDecimal.ZERO,
                                new BigDecimal("120.00")));
                var paidBill = Bill.createPaid("PP-REFUND", "Table 1", PaymentMethod.CASH, Instant.now());
                paidBill.addLine(menuItem, 1, new BigDecimal("120.00"));
                var savedBill = billRepository.save(paidBill);
                var today = LocalDate.now();
                dailyClosingRepository.save(DailyClosing.create(
                                today.minusDays(1),
                                new BigDecimal("120.00"),
                                BigDecimal.ZERO,
                                new BigDecimal("120.00"),
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                1,
                                0));
                var ownerSession = signIn();

                mockMvc.perform(post("/api/refunds")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"billId":%d,"refundType":"REFUND","reason":"Customer changed their mind"}
                                                """
                                                .formatted(savedBill.getId())))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.billId").value(savedBill.getId()))
                                .andExpect(jsonPath("$.refundType").value("REFUND"))
                                .andExpect(jsonPath("$.amount").value(120))
                                .andExpect(jsonPath("$.reason").value("Customer changed their mind"));

                mockMvc.perform(get("/api/history").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].total").value(120))
                                .andExpect(jsonPath("$[0].refund.refundType").value("REFUND"))
                                .andExpect(jsonPath("$[0].refund.amount").value(120));

                mockMvc.perform(get("/api/balance-sheet").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.profits").value(120))
                                .andExpect(jsonPath("$.refunds").value(120))
                                .andExpect(jsonPath("$.expenses").value(0))
                                .andExpect(jsonPath("$.revenue").value(0));

                mockMvc.perform(post("/api/daily-closings")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"closingDate":"%s"}
                                                """.formatted(today)))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.profits").value(120))
                                .andExpect(jsonPath("$.refunds").value(120))
                                .andExpect(jsonPath("$.expenses").value(0))
                                .andExpect(jsonPath("$.revenue").value(0));

                mockMvc.perform(get("/api/daily-closings").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].closingDate").value(today.toString()))
                                .andExpect(jsonPath("$[0].refunds").value(120))
                                .andExpect(jsonPath("$[1].closingDate").value(today.minusDays(1).toString()))
                                .andExpect(jsonPath("$[1].revenue").value(120));

                mockMvc.perform(post("/api/refunds")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"billId":%d,"refundType":"VOID","reason":"Duplicate payment"}
                                                """.formatted(savedBill.getId())))
                                .andExpect(status().isConflict());
        }

        private MockHttpSession signIn() throws Exception {
                MvcResult loginResult = mockMvc.perform(post("/api/auth/login")
                                .contentType(APPLICATION_JSON)
                                .content("{\"username\":\"test-admin\",\"password\":\"test-admin-password\"}"))
                                .andExpect(status().isOk())
                                .andReturn();

                return (MockHttpSession) loginResult.getRequest().getSession(false);
        }
}