package com.petpuja.billing.billing;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;

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
        private BusinessDayStateRepository businessDayStateRepository;

        @Autowired
        private BillRefundRepository billRefundRepository;

        @Autowired
        private MenuItemRepository menuItemRepository;

        @Autowired
        private BillDiscountSettingsRepository billDiscountSettingsRepository;

        @Autowired
        private BillDiscountTierRepository billDiscountTierRepository;

        private MockMvc mockMvc;

        @BeforeEach
        void setUp() {
                billRefundRepository.deleteAll();
                billRepository.deleteAll();
                expenseRepository.deleteAll();
                dailyClosingRepository.deleteAll();
                businessDayStateRepository.deleteAll();
                businessDayStateRepository.save(BusinessDayState.empty());
                menuItemRepository.deleteAll();
                billDiscountTierRepository.deleteAll();
                billDiscountSettingsRepository.deleteAll();
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
        void savesSelectedAddOnsThroughOpenOrderAndPaidHistory() throws Exception {
                var menuItem = MenuItem.create(
                                "Chicken Sandwich",
                                "Grilled chicken sandwich",
                                "Continental",
                                "Sandwiches",
                                BigDecimal.ZERO,
                                new BigDecimal("90.00"));
                var extraCheese = menuItem.addAddOn("Extra cheese", new BigDecimal("20.00"));
                menuItemRepository.save(menuItem);
                var ownerSession = signIn();

                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 2","lines":[{"menuItemId":%d,"quantity":1,"addOnIds":[%d]}],"completed":true}
                                                """
                                                .formatted(menuItem.getId(), extraCheese.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.lines[0].unitPrice").value(110))
                                .andExpect(jsonPath("$.lines[0].addOns[0].name").value("Extra cheese"))
                                .andExpect(jsonPath("$.lines[0].addOns[0].price").value(20))
                                .andExpect(jsonPath("$.total").value(110));

                mockMvc.perform(post("/api/payments")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 2","paymentMethod":"CASH"}
                                                """))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.lines[0].itemName").value("Chicken Sandwich + Extra cheese"))
                                .andExpect(jsonPath("$.lines[0].section").value("Continental"))
                                .andExpect(jsonPath("$.lines[0].unitPrice").value(110))
                                .andExpect(jsonPath("$.lines[0].lineTotal").value(110))
                                .andExpect(jsonPath("$.total").value(110));

                mockMvc.perform(get("/api/history").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].lines[0].itemName").value("Chicken Sandwich + Extra cheese"));
        }

        @Test
        void appliesMatchingDiscountToTheBillSubtotalAndKeepsItsSnapshotInHistory() throws Exception {
                var ownerSession = signIn();
                mockMvc.perform(put("/api/discount-settings")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"enabled":true,"tiers":[{"fromAmount":null,"toAmount":199.99,"discountPercent":5},{"fromAmount":200,"toAmount":500,"discountPercent":10},{"fromAmount":500.01,"toAmount":null,"discountPercent":15}]}
                                                """))
                                .andExpect(status().isOk());

                var menuItem = menuItemRepository.save(MenuItem.create(
                                "Test dish", "Bill discount test", "Mains", BigDecimal.ZERO,
                                new BigDecimal("500.00")));
                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 4","lines":[{"menuItemId":%d,"quantity":1}],"completed":true}
                                                """
                                                .formatted(menuItem.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.subtotal").value(500))
                                .andExpect(jsonPath("$.discountPercent").value(10))
                                .andExpect(jsonPath("$.discountAmount").value(50))
                                .andExpect(jsonPath("$.total").value(450));

                mockMvc.perform(post("/api/payments")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 4","paymentMethod":"CASH"}
                                                """))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.subtotal").value(500))
                                .andExpect(jsonPath("$.discountPercent").value(10))
                                .andExpect(jsonPath("$.discountAmount").value(50))
                                .andExpect(jsonPath("$.total").value(450));

                mockMvc.perform(get("/api/history").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].subtotal").value(500))
                                .andExpect(jsonPath("$[0].discountAmount").value(50))
                                .andExpect(jsonPath("$[0].total").value(450));

                var openEndedStartItem = menuItemRepository.save(MenuItem.create(
                                "Open lower bound", "Lower bound discount test", "Mains", BigDecimal.ZERO,
                                new BigDecimal("100.00")));
                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 5","lines":[{"menuItemId":%d,"quantity":1}],"completed":true}
                                                """
                                                .formatted(openEndedStartItem.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.discountPercent").value(5))
                                .andExpect(jsonPath("$.discountAmount").value(5))
                                .andExpect(jsonPath("$.total").value(95));

                var openEndedEndItem = menuItemRepository.save(MenuItem.create(
                                "Open upper bound", "Upper bound discount test", "Mains", BigDecimal.ZERO,
                                new BigDecimal("501.00")));
                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 6","lines":[{"menuItemId":%d,"quantity":1}],"completed":true}
                                                """
                                                .formatted(openEndedEndItem.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.discountPercent").value(15))
                                .andExpect(jsonPath("$.discountAmount").value(75.15))
                                .andExpect(jsonPath("$.total").value(425.85));
        }

        @Test
        void excludesOtherSectionFromDiscountButKeepsItInTheFinalBill() throws Exception {
                var ownerSession = signIn();
                mockMvc.perform(put("/api/discount-settings")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"enabled":true,"tiers":[{"fromAmount":null,"toAmount":null,"discountPercent":10}]}
                                                """))
                                .andExpect(status().isOk());

                var main = menuItemRepository.save(MenuItem.create(
                                "Main dish", "Eligible for bill discount", "Mains", BigDecimal.ZERO,
                                new BigDecimal("100.00")));
                var other = menuItemRepository.save(MenuItem.create(
                                "Other item", "Not eligible for bill discount", "Others", BigDecimal.ZERO,
                                new BigDecimal("50.00")));

                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 7","lines":[{"menuItemId":%d,"quantity":1},{"menuItemId":%d,"quantity":1}],"completed":true}
                                                """
                                                .formatted(main.getId(), other.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.subtotal").value(150))
                                .andExpect(jsonPath("$.discountPercent").value(10))
                                .andExpect(jsonPath("$.discountAmount").value(10))
                                .andExpect(jsonPath("$.total").value(140));

                mockMvc.perform(post("/api/payments")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 7","paymentMethod":"CASH"}
                                                """))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.subtotal").value(150))
                                .andExpect(jsonPath("$.discountAmount").value(10))
                                .andExpect(jsonPath("$.total").value(140));
        }

        @Test
        void rejectsOverlappingDiscountRangesAndKeepsCaptainReadOnly() throws Exception {
                var ownerSession = signIn();
                mockMvc.perform(put("/api/discount-settings")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"enabled":true,"tiers":[{"fromAmount":200,"toAmount":500,"discountPercent":10},{"fromAmount":400,"toAmount":1200,"discountPercent":15}]}
                                                """))
                                .andExpect(status().isBadRequest());

                var captainLogin = mockMvc.perform(post("/api/auth/login")
                                .contentType(APPLICATION_JSON)
                                .content("{\"username\":\"test-captain\",\"password\":\"test-captain-password\"}"))
                                .andExpect(status().isOk())
                                .andReturn();
                var captainSession = (MockHttpSession) captainLogin.getRequest().getSession(false);
                mockMvc.perform(get("/api/discount-settings").session(captainSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.enabled").value(false));
                mockMvc.perform(put("/api/discount-settings")
                                .session(captainSession)
                                .contentType(APPLICATION_JSON)
                                .content("{\"enabled\":true,\"tiers\":[]}"))
                                .andExpect(status().isForbidden());
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
        void startsBusinessDayWithStartDateAndSharesStatusWithCaptain() throws Exception {
                var ownerSession = signIn();

                var startResult = mockMvc.perform(post("/api/daily-closings/start").session(ownerSession))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.active").value(true))
                                .andExpect(jsonPath("$.startedAt").isNotEmpty())
                                .andReturn();
                var startedAt = businessDayStateRepository.findById(1).orElseThrow().getStartedAt();
                org.junit.jupiter.api.Assertions.assertEquals(
                                BusinessDay.dateOf(startedAt).toString(),
                                com.jayway.jsonpath.JsonPath.read(startResult.getResponse().getContentAsString(),
                                                "$.businessDate"));
                mockMvc.perform(post("/api/daily-closings/start").session(ownerSession))
                                .andExpect(status().isConflict());

                var captainLogin = mockMvc.perform(post("/api/auth/login")
                                .contentType(APPLICATION_JSON)
                                .content("{\"username\":\"test-captain\",\"password\":\"test-captain-password\"}"))
                                .andExpect(status().isOk())
                                .andReturn();
                var captainSession = (MockHttpSession) captainLogin.getRequest().getSession(false);
                mockMvc.perform(get("/api/daily-closings/status").session(captainSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.active").value(true));
                mockMvc.perform(post("/api/daily-closings/end").session(captainSession))
                                .andExpect(status().isForbidden());
        }

        @Test
        void closesADayWithCashOnlineSalesAndExpenses() throws Exception {
                var ownerSession = signIn();
                mockMvc.perform(post("/api/daily-closings/start").session(ownerSession))
                                .andExpect(status().isCreated());
                var startedAt = businessDayStateRepository.findById(1).orElseThrow().getStartedAt();
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
                var beforeStartBill = Bill.createPaid("PP-PRE-START", "Table 4", PaymentMethod.CASH,
                                startedAt.minusSeconds(1));
                beforeStartBill.addLine(menuItem, 1, new BigDecimal("900.00"));
                billRepository.save(beforeStartBill);
                var businessDate = BusinessDay.dateOf(startedAt).toString();

                mockMvc.perform(get("/api/daily-closings/preview")
                                .session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.closingDate").value(businessDate))
                                .andExpect(jsonPath("$.startedAt").isNotEmpty())
                                .andExpect(jsonPath("$.endedAt").isNotEmpty())
                                .andExpect(jsonPath("$.cashSales").value(120))
                                .andExpect(jsonPath("$.onlineSales").value(240))
                                .andExpect(jsonPath("$.profits").value(360))
                                .andExpect(jsonPath("$.refunds").value(0))
                                .andExpect(jsonPath("$.expenses").value(75))
                                .andExpect(jsonPath("$.revenue").value(285))
                                .andExpect(jsonPath("$.paidOrderCount").value(2))
                                .andExpect(jsonPath("$.expenseCount").value(1));

                mockMvc.perform(post("/api/daily-closings/end").session(ownerSession))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.closingDate").value(businessDate))
                                .andExpect(jsonPath("$.startedAt").isNotEmpty())
                                .andExpect(jsonPath("$.cashSales").value(120))
                                .andExpect(jsonPath("$.onlineSales").value(240))
                                .andExpect(jsonPath("$.profits").value(360))
                                .andExpect(jsonPath("$.refunds").value(0))
                                .andExpect(jsonPath("$.expenses").value(75))
                                .andExpect(jsonPath("$.revenue").value(285))
                                .andExpect(jsonPath("$.paidOrderCount").value(2))
                                .andExpect(jsonPath("$.expenseCount").value(1));

                mockMvc.perform(get("/api/daily-closings/status").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.active").value(false));

                mockMvc.perform(post("/api/daily-closings/end").session(ownerSession))
                                .andExpect(status().isConflict());

                mockMvc.perform(get("/api/daily-closings").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].closingDate").value(businessDate))
                                .andExpect(jsonPath("$[0].revenue").value(285));
        }

        @Test
        void recordsRefundsAsNewAdjustmentsWithoutChangingDailyClosingSnapshots() throws Exception {
                var ownerSession = signIn();
                mockMvc.perform(post("/api/daily-closings/start").session(ownerSession))
                                .andExpect(status().isCreated());
                var startedAt = businessDayStateRepository.findById(1).orElseThrow().getStartedAt();
                var businessDate = BusinessDay.dateOf(startedAt);
                var menuItem = menuItemRepository.save(MenuItem.create(
                                "Masala Dosa",
                                "Crisp dosa with potato filling",
                                BigDecimal.ZERO,
                                new BigDecimal("120.00")));
                var paidBill = Bill.createPaid("PP-REFUND", "Table 1", PaymentMethod.CASH, Instant.now());
                paidBill.addLine(menuItem, 1, new BigDecimal("120.00"));
                var savedBill = billRepository.save(paidBill);
                dailyClosingRepository.save(DailyClosing.create(
                                businessDate.minusDays(1),
                                new BigDecimal("120.00"),
                                BigDecimal.ZERO,
                                new BigDecimal("120.00"),
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                1,
                                0));
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
                                .andExpect(jsonPath("$.reason").value("Customer changed their mind"))
                                .andExpect(jsonPath("$.refundedBy").value("test-admin"));

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

                mockMvc.perform(post("/api/daily-closings/end").session(ownerSession))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.profits").value(120))
                                .andExpect(jsonPath("$.refunds").value(120))
                                .andExpect(jsonPath("$.expenses").value(0))
                                .andExpect(jsonPath("$.revenue").value(0));

                mockMvc.perform(get("/api/daily-closings").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].closingDate").value(businessDate.toString()))
                                .andExpect(jsonPath("$[0].refunds").value(120))
                                .andExpect(jsonPath("$[1].closingDate").value(businessDate.minusDays(1).toString()))
                                .andExpect(jsonPath("$[1].revenue").value(120));

                mockMvc.perform(post("/api/refunds")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"billId":%d,"refundType":"VOID","reason":"Duplicate payment"}
                                                """.formatted(savedBill.getId())))
                                .andExpect(status().isConflict());
        }

        @Test
        void captainCannotRecordRefunds() throws Exception {
                var login = mockMvc.perform(post("/api/auth/login")
                                .contentType(APPLICATION_JSON)
                                .content("{\"username\":\"test-captain\",\"password\":\"test-captain-password\"}"))
                                .andExpect(status().isOk())
                                .andReturn();

                mockMvc.perform(post("/api/refunds")
                                .session((MockHttpSession) login.getRequest().getSession(false))
                                .contentType(APPLICATION_JSON)
                                .content("{\"billId\":1,\"refundType\":\"VOID\",\"reason\":\"x\"}"))
                                .andExpect(status().isForbidden());
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