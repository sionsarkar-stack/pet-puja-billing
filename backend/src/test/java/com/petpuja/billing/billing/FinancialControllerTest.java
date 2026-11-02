package com.petpuja.billing.billing;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.jdbc.core.JdbcTemplate;
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
        private CustomerRepository customerRepository;

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
        private CommitteeMemberRepository committeeMemberRepository;

        @Autowired
        private CommitteeMemberService committeeMemberService;

        @Autowired
        private BillDiscountSettingsRepository billDiscountSettingsRepository;

        @Autowired
        private BillDiscountTierRepository billDiscountTierRepository;

        @Autowired
        private JdbcTemplate jdbcTemplate;

        private MockMvc mockMvc;

        @BeforeEach
        void setUp() {
                billRefundRepository.deleteAll();
                billRepository.deleteAll();
                committeeMemberRepository.deleteAll();
                committeeMemberService.initializeDefaults();
                customerRepository.deleteAll();
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
                                                {"tableName":"Outdoor 3","orderDescription":"No onions, extra crisp","lines":[{"menuItemId":%d,"quantity":2}],"completed":true}
                                                """
                                                .formatted(menuItem.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.tableName").value("Outdoor 3"))
                                .andExpect(jsonPath("$.orderDescription").value("No onions, extra crisp"))
                                .andExpect(jsonPath("$.completed").value(true))
                                .andExpect(jsonPath("$.lines[0].unitPrice").value(180))
                                .andExpect(jsonPath("$.lines[0].lineTotal").value(360))
                                .andExpect(jsonPath("$.total").value(360));

                mockMvc.perform(get("/api/open-orders").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].tableName").value("Outdoor 3"))
                                .andExpect(jsonPath("$[0].orderDescription").value("No onions, extra crisp"))
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
                                .andExpect(jsonPath("$.orderDescription").value("No onions, extra crisp"))
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
                                .andExpect(jsonPath("$[0].orderDescription").value("No onions, extra crisp"))
                                .andExpect(jsonPath("$[0].paymentMethod").value("CASH"))
                                .andExpect(jsonPath("$[0].total").value(360));

                mockMvc.perform(post("/api/expenses")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"Vegetables","amount":75,"addedBy":"Owner","description":"Morning market"}
                                                """))
                                .andExpect(status().isBadRequest());

                mockMvc.perform(post("/api/expenses")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"Vegetables","amount":75,"addedBy":"Rimo","description":"Morning market"}
                                                """))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.title").value("Vegetables"))
                                .andExpect(jsonPath("$.amount").value(75))
                                .andExpect(jsonPath("$.addedBy").value("Rimo"));

                mockMvc.perform(get("/api/balance-sheet").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.profits").value(285))
                                .andExpect(jsonPath("$.refunds").value(0))
                                .andExpect(jsonPath("$.expenses").value(75))
                                .andExpect(jsonPath("$.revenue").value(360));
        }

        @Test
        void shiftsOpenOrderAcrossIndoorAndOutdoorWithConfirmationSafeConflictHandling() throws Exception {
                var menuItem = menuItemRepository.save(MenuItem.create(
                                "Paneer Tikka", "Char-grilled paneer", new BigDecimal("10.00"),
                                new BigDecimal("200.00")));
                var ownerSession = signIn();
                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 1","tableLabel":"Birthday group","orderDescription":"Bring a high chair","customerName":"Asha","lines":[{"menuItemId":%d,"quantity":2}],"completed":true}
                                                """
                                                .formatted(menuItem.getId())))
                                .andExpect(status().isOk());
                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Outdoor 1","lines":[{"menuItemId":%d,"quantity":1}],"completed":false}
                                                """
                                                .formatted(menuItem.getId())))
                                .andExpect(status().isOk());

                mockMvc.perform(put("/api/open-orders/shift")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"fromTableName":"Table 1","toTableName":"Outdoor 2"}
                                                """))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.tableName").value("Outdoor 2"))
                                .andExpect(jsonPath("$.tableLabel").value("Birthday group"))
                                .andExpect(jsonPath("$.orderDescription").value("Bring a high chair"))
                                .andExpect(jsonPath("$.customerName").value("Asha"))
                                .andExpect(jsonPath("$.completed").value(true))
                                .andExpect(jsonPath("$.lines[0].quantity").value(2))
                                .andExpect(jsonPath("$.total").value(360));

                mockMvc.perform(put("/api/open-orders/shift")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"fromTableName":"Outdoor 2","toTableName":"Outdoor 1"}
                                                """))
                                .andExpect(status().isConflict());

                mockMvc.perform(get("/api/open-orders").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[?(@.tableName == 'Table 1')]").isEmpty())
                                .andExpect(jsonPath("$[?(@.tableName == 'Outdoor 1')].total").value(180.0))
                                .andExpect(jsonPath("$[?(@.tableName == 'Outdoor 2')].total").value(360.0));
        }

        @Test
        void acceptsNamedAndCashExpensesButRejectsOthers() throws Exception {
                var ownerSession = signIn();

                mockMvc.perform(post("/api/expenses")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"Supplies","amount":50,"addedBy":"Others"}
                                                """))
                                .andExpect(status().isBadRequest());

                mockMvc.perform(post("/api/expenses")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"Supplies","amount":50,"addedBy":"Others","keBhai":" Arun "}
                                                """))
                                .andExpect(status().isBadRequest());

                for (var addedBy : List.of("Rimo", "Rjoe", "Rishi", "Dinda", "Cash")) {
                        mockMvc.perform(post("/api/expenses")
                                        .session(ownerSession)
                                        .contentType(APPLICATION_JSON)
                                        .content("""
                                                        {"title":"Supplies","amount":50,"addedBy":"%s"}
                                                        """.formatted(addedBy)))
                                        .andExpect(status().isCreated())
                                        .andExpect(jsonPath("$.addedBy").value(addedBy));
                }

                mockMvc.perform(get("/api/expenses").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.length()").value(5))
                                .andExpect(jsonPath("$[?(@.addedBy == 'Cash')].title").value("Supplies"));
        }

        @Test
        void shiftsOpenOrdersAcrossIndoorAndOutdoorWhilePreservingOrderDetails() throws Exception {
                var menuItem = menuItemRepository.save(MenuItem.create(
                                "Paneer Tikka", "Char-grilled paneer", new BigDecimal("10.00"),
                                new BigDecimal("200.00")));
                var ownerSession = signIn();

                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 1","tableLabel":"Family","orderDescription":"No onions","customerName":"Asha","lines":[{"menuItemId":%d,"quantity":2}],"completed":true}
                                                """
                                                .formatted(menuItem.getId())))
                                .andExpect(status().isOk());
                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Outdoor 1","lines":[{"menuItemId":%d,"quantity":1}],"completed":false}
                                                """
                                                .formatted(menuItem.getId())))
                                .andExpect(status().isOk());

                mockMvc.perform(put("/api/open-orders/shift")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"fromTableName":"Table 1","toTableName":"Outdoor 2"}
                                                """))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.tableName").value("Outdoor 2"))
                                .andExpect(jsonPath("$.tableLabel").value("Family"))
                                .andExpect(jsonPath("$.orderDescription").value("No onions"))
                                .andExpect(jsonPath("$.customerName").value("Asha"))
                                .andExpect(jsonPath("$.completed").value(true))
                                .andExpect(jsonPath("$.lines[0].quantity").value(2))
                                .andExpect(jsonPath("$.total").value(360));

                mockMvc.perform(put("/api/open-orders/shift")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"fromTableName":"Outdoor 1","toTableName":"Outdoor 2"}
                                                """))
                                .andExpect(status().isConflict());

                mockMvc.perform(get("/api/open-orders").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[?(@.tableName == 'Table 1')]").isEmpty())
                                .andExpect(jsonPath("$[?(@.tableName == 'Outdoor 1')].total").value(180.0))
                                .andExpect(jsonPath("$[?(@.tableName == 'Outdoor 2')].total").value(360.0));
        }

        @Test
        void updatesExpensesPreservingCreatedAtAndUnchangedLegacyAttribution() throws Exception {
                var ownerSession = signIn();
                mockMvc.perform(post("/api/expenses")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"Groceries","amount":75,"addedBy":"Dinda","description":"Market"}
                                                """))
                                .andExpect(status().isCreated());

                var createdExpense = expenseRepository.findAllByOrderByCreatedAtDesc().get(0);
                var createdAt = createdExpense.getCreatedAt().toString();
                mockMvc.perform(put("/api/expenses/{expenseId}", createdExpense.getId())
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"Updated groceries","amount":95.50,"addedBy":"Cash","description":"Updated market run"}
                                                """))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.title").value("Updated groceries"))
                                .andExpect(jsonPath("$.amount").value(95.50))
                                .andExpect(jsonPath("$.addedBy").value("Cash"))
                                .andExpect(jsonPath("$.description").value("Updated market run"))
                                .andExpect(jsonPath("$.createdAt").value(createdAt));

                var legacyExpense = expenseRepository.save(Expense.create("Old supplies", new BigDecimal("20.00"),
                                "Others: Arun", "Old receipt"));
                mockMvc.perform(put("/api/expenses/{expenseId}", legacyExpense.getId())
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"Old supplies updated","amount":25,"description":"Reviewed"}
                                                """))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.addedBy").value("Others: Arun"));

                mockMvc.perform(put("/api/expenses/{expenseId}", legacyExpense.getId())
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"Invalid","amount":25,"addedBy":"Others"}
                                                """))
                                .andExpect(status().isBadRequest());

                mockMvc.perform(put("/api/expenses/{expenseId}", 99999L)
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"Missing","amount":25,"addedBy":"Cash"}
                                                """))
                                .andExpect(status().isNotFound());
        }

        @Test
        void createsContactBeforeAnyOrderExists() throws Exception {
                var ownerSession = signIn();

                mockMvc.perform(post("/api/customers")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"phoneNumber":"12345","name":null,"dateOfBirth":null}
                                                """))
                                .andExpect(status().isBadRequest());

                mockMvc.perform(post("/api/customers")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"phoneNumber":"98765 43210","name":"Aarav Mehta","dateOfBirth":"1990-05-12"}
                                                """))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.phoneNumber").value("+919876543210"))
                                .andExpect(jsonPath("$.name").value("Aarav Mehta"))
                                .andExpect(jsonPath("$.dateOfBirth").value("1990-05-12"));

                mockMvc.perform(get("/api/open-orders").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$").isEmpty());
                mockMvc.perform(get("/api/customers").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.length()").value(1));
        }

        @Test
        void updatesAndRemovesCustomerWithoutDeletingOrderNameSnapshot() throws Exception {
                var ownerSession = signIn();
                var menuItem = menuItemRepository.save(MenuItem.create(
                                "Customer link dish", "Customer update test", "Mains", BigDecimal.ZERO,
                                new BigDecimal("120.00")));

                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 6","customerName":"Aarav Mehta","customerPhone":"98765 43210","customerDateOfBirth":"1990-05-12","lines":[{"menuItemId":%d,"quantity":1}],"completed":false}
                                                """
                                                .formatted(menuItem.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.customerName").value("Aarav Mehta"))
                                .andExpect(jsonPath("$.customerPhone").value("+919876543210"));

                mockMvc.perform(put("/api/customers/{phoneNumber}", "+919876543210")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"phoneNumber":"98765 43211","name":"Aarav Singh","dateOfBirth":"1991-06-13"}
                                                """))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.phoneNumber").value("+919876543211"));

                mockMvc.perform(get("/api/open-orders").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].customerName").value("Aarav Mehta"))
                                .andExpect(jsonPath("$[0].customerPhone").value("+919876543211"));

                mockMvc.perform(delete("/api/customers/{phoneNumber}", "+919876543211").session(ownerSession))
                                .andExpect(status().isNoContent());

                mockMvc.perform(get("/api/open-orders").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].customerName").value("Aarav Mehta"))
                                .andExpect(jsonPath("$[0].customerPhone").value(nullValue()));
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
                                                {"tableName":"Table 2","customerName":"Aarav Mehta","customerPhone":"98765 43210","customerDateOfBirth":"1990-05-12","lines":[{"menuItemId":%d,"quantity":1,"addOnIds":[%d]}],"completed":true}
                                                """
                                                .formatted(menuItem.getId(), extraCheese.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.customerName").value("Aarav Mehta"))
                                .andExpect(jsonPath("$.customerPhone").value("+919876543210"))
                                .andExpect(jsonPath("$.customerDateOfBirth").value("1990-05-12"))
                                .andExpect(jsonPath("$.lines[0].section").value("Continental"))
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
                                .andExpect(jsonPath("$.customerName").value("Aarav Mehta"))
                                .andExpect(jsonPath("$.lines[0].itemName").value("Chicken Sandwich + Extra cheese"))
                                .andExpect(jsonPath("$.lines[0].section").value("Continental"))
                                .andExpect(jsonPath("$.lines[0].unitPrice").value(110))
                                .andExpect(jsonPath("$.lines[0].lineTotal").value(110))
                                .andExpect(jsonPath("$.total").value(110));

                mockMvc.perform(get("/api/history").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].customerName").value("Aarav Mehta"))
                                .andExpect(jsonPath("$[0].lines[0].itemName").value("Chicken Sandwich + Extra cheese"));

                mockMvc.perform(get("/api/customers").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].phoneNumber").value("+919876543210"))
                                .andExpect(jsonPath("$[0].name").value("Aarav Mehta"))
                                .andExpect(jsonPath("$[0].dateOfBirth").value("1990-05-12"));
                mockMvc.perform(get("/api/customers/search")
                                .param("query", "98765 43210")
                                .session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].phoneNumber").value("+919876543210"))
                                .andExpect(jsonPath("$[0].name").value("Aarav Mehta"));
                mockMvc.perform(get("/api/customers/search")
                                .param("query", "Aarav")
                                .session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].phoneNumber").value("+919876543210"));

                mockMvc.perform(put("/api/open-orders")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 3","customerName":"Aarav Singh","customerPhone":"098765 43210","customerDateOfBirth":"1991-06-13","lines":[{"menuItemId":%d,"quantity":1}],"completed":false}
                                                """
                                                .formatted(menuItem.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.customerPhone").value("+919876543210"));

                mockMvc.perform(get("/api/customers").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.length()").value(1))
                                .andExpect(jsonPath("$[0].name").value("Aarav Singh"))
                                .andExpect(jsonPath("$[0].dateOfBirth").value("1991-06-13"));

                mockMvc.perform(get("/api/history").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].customerName").value("Aarav Mehta"));
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
        void captainCanReadMembersButCannotAddOrDeleteThem() throws Exception {
                var login = mockMvc.perform(post("/api/auth/login").contentType(APPLICATION_JSON)
                                .content("{\"username\":\"test-captain\",\"password\":\"test-captain-password\"}"))
                                .andExpect(status().isOk()).andReturn();
                var session = (MockHttpSession) login.getRequest().getSession(false);
                mockMvc.perform(get("/api/committee-members").session(session)).andExpect(status().isOk());
                mockMvc.perform(post("/api/committee-members").session(session).contentType(APPLICATION_JSON)
                                .content("{\"name\":\"Alex\"}"))
                                .andExpect(status().isForbidden());
                var rimoId = committeeMemberRepository.findByNormalizedName("rimo").orElseThrow().getId();
                mockMvc.perform(delete("/api/committee-members/{id}", rimoId).session(session))
                                .andExpect(status().isForbidden());
        }

        @Test
        void managesCommitteeMembersButProtectsDindaAndUnpaidOrders() throws Exception {
                var session = signIn();
                mockMvc.perform(get("/api/committee-members").session(session))
                                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(4))
                                .andExpect(jsonPath("$[3].name").value("Dinda"))
                                .andExpect(jsonPath("$[3].protectedMember").value(true))
                                .andExpect(jsonPath("$[3].fixedDiscountPercent").value(20));
                var dindaId = committeeMemberRepository.findByNormalizedName("dinda").orElseThrow().getId();
                mockMvc.perform(delete("/api/committee-members/{id}", dindaId).session(session))
                                .andExpect(status().isForbidden());
                mockMvc.perform(post("/api/committee-members").session(session).contentType(APPLICATION_JSON)
                                .content("{\"name\":\"  Alex  \"}"))
                                .andExpect(status().isCreated()).andExpect(jsonPath("$.name").value("Alex"));
                var alexId = committeeMemberRepository.findByNormalizedName("alex").orElseThrow().getId();
                mockMvc.perform(post("/api/committee-members").session(session).contentType(APPLICATION_JSON)
                                .content("{\"name\":\"ALEX\"}"))
                                .andExpect(status().isConflict());
                var item = menuItemRepository.save(MenuItem.create("Member meal", null, "Quick Bites", BigDecimal.ZERO,
                                new BigDecimal("200")));
                mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Committee Alex","committeeDiscountPercent":10,"completed":true,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                """
                                                .formatted(item.getId())))
                                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(180));
                mockMvc.perform(delete("/api/committee-members/{id}", alexId).session(session))
                                .andExpect(status().isConflict());
                mockMvc.perform(post("/api/payments").session(session).contentType(APPLICATION_JSON)
                                .content("{\"tableName\":\"Committee Alex\",\"paymentMethod\":\"CASH\"}"))
                                .andExpect(status().isCreated());
                mockMvc.perform(delete("/api/committee-members/{id}", alexId).session(session))
                                .andExpect(status().isNoContent());
                mockMvc.perform(get("/api/committee-members").session(session)).andExpect(status().isOk())
                                .andExpect(jsonPath("$.length()").value(4));
                mockMvc.perform(get("/api/history").session(session)).andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].tableName").value("Committee Alex"));
                mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Committee Dinda","committeeDiscountPercent":0,"completed":true,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                """
                                                .formatted(item.getId())))
                                .andExpect(status().isBadRequest());
                mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Committee Dinda","completed":true,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                """
                                                .formatted(item.getId())))
                                .andExpect(status().isOk()).andExpect(jsonPath("$.committeeDiscountPercent").value(20))
                                .andExpect(jsonPath("$.total").value(160));
                var tamperedDraft = billRepository.findByOpenTableName("Committee Dinda").orElseThrow();
                tamperedDraft.setCommitteeDiscountPercent(BigDecimal.ZERO);
                billRepository.save(tamperedDraft);
                mockMvc.perform(post("/api/payments").session(session).contentType(APPLICATION_JSON)
                                .content("{\"tableName\":\"Committee Dinda\",\"paymentMethod\":\"CASH\"}"))
                                .andExpect(status().isCreated()).andExpect(jsonPath("$.discountPercent").value(20))
                                .andExpect(jsonPath("$.total").value(160));
        }

        @Test
        void committeeDiscountCoversEveryItemWhileOrdinaryTablesStillExcludeOthers() throws Exception {
                var session = signIn();
                mockMvc.perform(put("/api/discount-settings").session(session).contentType(APPLICATION_JSON)
                                .content("{\"enabled\":true,\"tiers\":[{\"fromAmount\":0,\"toAmount\":null,\"discountPercent\":25}]}"))
                                .andExpect(status().isOk());
                var meal = menuItemRepository.save(
                                MenuItem.create("Meal", null, "Quick Bites", BigDecimal.ZERO, new BigDecimal("200")));
                var other = menuItemRepository.save(
                                MenuItem.create("Other item", null, "Other", BigDecimal.ZERO, new BigDecimal("100")));
                for (var table : java.util.List.of("Committee Rimo", "Committee Dinda", "Table 1")) {
                        var rate = table.equals("Committee Rimo") ? ",\"committeeDiscountPercent\":25" : "";
                        var expectedDiscount = table.equals("Committee Rimo") ? 75
                                        : table.equals("Committee Dinda") ? 60 : 50;
                        mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                        .content("""
                                                        {"tableName":"%s"%s,"completed":true,"lines":[{"menuItemId":%d,"quantity":1},{"menuItemId":%d,"quantity":1}]}
                                                        """
                                                        .formatted(table, rate, meal.getId(), other.getId())))
                                        .andExpect(status().isOk())
                                        .andExpect(jsonPath("$.subtotal").value(300))
                                        .andExpect(jsonPath("$.discountAmount").value(expectedDiscount))
                                        .andExpect(jsonPath("$.total").value(300 - expectedDiscount));
                        mockMvc.perform(post("/api/payments").session(session).contentType(APPLICATION_JSON)
                                        .content("{\"tableName\":\"" + table + "\",\"paymentMethod\":\"CASH\"}"))
                                        .andExpect(status().isCreated())
                                        .andExpect(jsonPath("$.discountAmount").value(expectedDiscount))
                                        .andExpect(jsonPath("$.total").value(300 - expectedDiscount));
                }
        }

        @Test
        void committeeOrdersKeepTheirDiscountThroughSaveReloadAndPayment() throws Exception {
                var session = signIn();
                mockMvc.perform(put("/api/discount-settings").session(session).contentType(APPLICATION_JSON)
                                .content("{\"enabled\":true,\"tiers\":[{\"fromAmount\":0,\"toAmount\":null,\"discountPercent\":80}]}"))
                                .andExpect(status().isOk());
                var item = menuItemRepository.save(MenuItem.create("Committee meal", null, "Quick Bites",
                                BigDecimal.ZERO, new BigDecimal("200")));
                mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Committee Rimo","committeeDiscountPercent":25,"completed":true,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                """
                                                .formatted(item.getId())))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.committeeDiscountPercent").value(25))
                                .andExpect(jsonPath("$.discountAmount").value(50))
                                .andExpect(jsonPath("$.total").value(150));
                mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Committee Rimo","completed":true,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                """
                                                .formatted(item.getId())))
                                .andExpect(status().isOk()).andExpect(jsonPath("$.committeeDiscountPercent").value(25));
                for (var member : java.util.List.of("Rjoe", "Rishi", "Dinda")) {
                        mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                        .content("""
                                                        {"tableName":"Committee %s","completed":false,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                        """
                                                        .formatted(member, item.getId())))
                                        .andExpect(status().isOk()).andExpect(jsonPath("$.committeeDiscountPercent")
                                                        .value(member.equals("Dinda") ? 20 : 0));
                }
                mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Committee Rishi","committeeDiscountPercent":100,"completed":false,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                """
                                                .formatted(item.getId())))
                                .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0));
                for (var invalidTable : java.util.List.of("Committee Unknown", "Table 1")) {
                        mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                        .content("""
                                                        {"tableName":"%s","committeeDiscountPercent":25,"completed":false,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                        """
                                                        .formatted(invalidTable, item.getId())))
                                        .andExpect(status().isBadRequest());
                }
                for (var percent : java.util.List.of("-1", "100.01", "1.001")) {
                        mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                        .content("""
                                                        {"tableName":"Committee Rimo","committeeDiscountPercent":%s,"completed":true,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                        """
                                                        .formatted(percent, item.getId())))
                                        .andExpect(status().isBadRequest());
                }
                mockMvc.perform(post("/api/payments").session(session).contentType(APPLICATION_JSON)
                                .content("{\"tableName\":\"Committee Rimo\",\"paymentMethod\":\"CASH\"}"))
                                .andExpect(status().isCreated()).andExpect(jsonPath("$.total").value(150))
                                .andExpect(jsonPath("$.discountPercent").value(25));
        }

        @Test
        void savesCustomTableNamesWithoutChangingSeatingIdentityAndRetainsThemAfterPayment() throws Exception {
                var session = signIn();
                var item = menuItemRepository
                                .save(MenuItem.create("Meal", null, BigDecimal.ZERO, new BigDecimal("100")));
                for (var table : java.util.List.of("Table 1", "Table 2")) {
                        mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                        .content("""
                                                        {"tableName":"%s","tableLabel":"  Family  ","completed":true,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                        """
                                                        .formatted(table, item.getId())))
                                        .andExpect(status().isOk())
                                        .andExpect(jsonPath("$.tableName").value(table))
                                        .andExpect(jsonPath("$.tableLabel").value("Family"));
                }
                mockMvc.perform(get("/api/open-orders").session(session))
                                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
                mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 1","completed":true,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                """
                                                .formatted(item.getId())))
                                .andExpect(status().isOk()).andExpect(jsonPath("$.tableLabel").value("Family"));
                mockMvc.perform(put("/api/open-orders").session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 1","tableLabel":"   ","completed":true,"lines":[{"menuItemId":%d,"quantity":1}]}
                                                """
                                                .formatted(item.getId())))
                                .andExpect(status().isOk()).andExpect(jsonPath("$.tableLabel").isEmpty())
                                .andExpect(jsonPath("$.tableName").value("Table 1"));
                mockMvc.perform(post("/api/payments").session(session).contentType(APPLICATION_JSON)
                                .content("{\"tableName\":\"Table 2\",\"paymentMethod\":\"CASH\"}"))
                                .andExpect(status().isCreated()).andExpect(jsonPath("$.tableLabel").value("Family"));
                mockMvc.perform(get("/api/history").session(session))
                                .andExpect(status().isOk()).andExpect(jsonPath("$[0].tableLabel").value("Family"));
        }

        @Test
        void migratesOnlyUnpaidCommitteeBillsToWholeBillDiscounts() throws Exception {
                var url = "jdbc:h2:mem:member_discount_migration;MODE=PostgreSQL";
                try (var connection = java.sql.DriverManager.getConnection(url, "sa", "");
                                var statement = connection.createStatement()) {
                        org.flywaydb.core.Flyway.configure()
                                        .dataSource(new org.springframework.jdbc.datasource.SingleConnectionDataSource(
                                                        connection, true))
                                        .initSql("CREATE DOMAIN IF NOT EXISTS TIMESTAMPTZ AS TIMESTAMP WITH TIME ZONE")
                                        .locations("classpath:db/migration").target("25").load().migrate();
                        statement.execute(
                                        """
                                                        INSERT INTO bill (bill_number,status,table_name,open_table_name,subtotal,discount_percent,discount_amount,committee_discount_percent,total)
                                                        VALUES ('M-RIMO','OPEN','Committee Rimo','Committee Rimo',300,25,50,25,250),
                                                               ('M-DINDA','OPEN','Committee Dinda','Committee Dinda',300,20,40,20,260),
                                                               ('M-TABLE','OPEN','Table 1','Table 1',300,25,50,NULL,250)
                                                        """);
                        statement.execute(
                                        """
                                                        INSERT INTO bill (bill_number,status,table_name,subtotal,discount_percent,discount_amount,committee_discount_percent,total,payment_method,cash_amount,online_amount,paid_at)
                                                        VALUES ('M-PAID','PAID','Committee Rimo',300,25,50,25,250,'CASH',250,0,CURRENT_TIMESTAMP)
                                                        """);
                        org.flywaydb.core.Flyway.configure()
                                        .dataSource(new org.springframework.jdbc.datasource.SingleConnectionDataSource(
                                                        connection, true))
                                        .initSql("CREATE DOMAIN IF NOT EXISTS TIMESTAMPTZ AS TIMESTAMP WITH TIME ZONE")
                                        .locations("classpath:db/migration").load().migrate();
                        var totals = java.util.Map.of("M-RIMO", "225", "M-DINDA", "240", "M-TABLE", "250", "M-PAID",
                                        "250");
                        try (var rows = statement.executeQuery("SELECT bill_number,total FROM bill")) {
                                while (rows.next()) {
                                        org.junit.jupiter.api.Assertions.assertEquals(0,
                                                        rows.getBigDecimal("total").compareTo(new BigDecimal(
                                                                        totals.get(rows.getString("bill_number")))));
                                }
                        }
                }
        }

        @Test
        void discoversAndAppliesSplitPaymentMigrationWithTheFullSchema() throws Exception {
                var url = "jdbc:h2:mem:split_full_schema;MODE=PostgreSQL";
                try (var connection = java.sql.DriverManager.getConnection(url, "sa", "")) {
                        var flyway = org.flywaydb.core.Flyway.configure().dataSource(url, "sa", "")
                                        .initSql("CREATE DOMAIN IF NOT EXISTS TIMESTAMPTZ AS TIMESTAMP WITH TIME ZONE")
                                        .locations("classpath:db/migration").load();
                        flyway.migrate();
                        org.junit.jupiter.api.Assertions.assertEquals("31",
                                        flyway.info().current().getVersion().toString());
                        try (var statement = connection.createStatement();
                                        var rows = statement
                                                        .executeQuery("SELECT cash_amount, online_amount, upi_qr_provider FROM bill")) {
                                org.junit.jupiter.api.Assertions.assertEquals(3, rows.getMetaData().getColumnCount());
                        }
                }
        }

        @Test
        void migratesLegacyPaymentConstraintsAndPreservesTheirAmounts() throws Exception {
                try (var connection = java.sql.DriverManager
                                .getConnection("jdbc:h2:mem:split_migration;MODE=PostgreSQL", "sa", "");
                                var statement = connection.createStatement()) {
                        statement.execute(
                                        """
                                                        CREATE TABLE bill (id INTEGER PRIMARY KEY, status VARCHAR(20), total NUMERIC(12,2),
                                                        payment_method VARCHAR(20) CHECK (payment_method IN ('CASH','ONLINE')))
                                                        """);
                        statement.execute("INSERT INTO bill VALUES (1,'PAID',100,'CASH'),(2,'PAID',70,'ONLINE')");
                        new db.migration.V22__add_split_payments()
                                        .migrate(new org.flywaydb.core.api.migration.Context() {
                                                public java.sql.Connection getConnection() {
                                                        return connection;
                                                }

                                                public org.flywaydb.core.api.configuration.Configuration getConfiguration() {
                                                        return null;
                                                }
                                        });
                        try (var rows = statement
                                        .executeQuery("SELECT cash_amount, online_amount FROM bill ORDER BY id")) {
                                org.junit.jupiter.api.Assertions.assertTrue(rows.next());
                                org.junit.jupiter.api.Assertions.assertEquals(0,
                                                rows.getBigDecimal(1).compareTo(new BigDecimal("100")));
                                org.junit.jupiter.api.Assertions.assertEquals(0, rows.getBigDecimal(2).signum());
                                org.junit.jupiter.api.Assertions.assertTrue(rows.next());
                                org.junit.jupiter.api.Assertions.assertEquals(0, rows.getBigDecimal(1).signum());
                                org.junit.jupiter.api.Assertions.assertEquals(0,
                                                rows.getBigDecimal(2).compareTo(new BigDecimal("70")));
                        }
                        statement.execute("INSERT INTO bill VALUES (3,'PAID',100,'SPLIT',30,70)");
                        for (var amounts : java.util.List.of("20,70", "-1,101", "NULL,100", "0,100")) {
                                org.junit.jupiter.api.Assertions.assertThrows(java.sql.SQLException.class,
                                                () -> statement.execute("INSERT INTO bill VALUES (4,'PAID',100,'SPLIT',"
                                                                + amounts + ")"));
                        }
                }
        }

        @Test
        void validatesSplitPaymentsAndAllocatesDailyClosingTotals() throws Exception {
                var session = signIn();
                mockMvc.perform(post("/api/daily-closings/start").session(session)).andExpect(status().isCreated());
                var menuItem = menuItemRepository
                                .save(MenuItem.create("Split meal", null, BigDecimal.ZERO, new BigDecimal("100.00")));
                var bill = Bill.createOpen("PP-SPLIT", "Table 1");
                bill.addLine(menuItem, 1, new BigDecimal("100.00"));
                bill.markCompleted(Instant.now());
                billRepository.save(bill);
                for (var amounts : java.util.List.of(
                                "\"cashAmount\":30,\"onlineAmount\":60",
                                "\"cashAmount\":30,\"onlineAmount\":80",
                                "\"cashAmount\":-1,\"onlineAmount\":101",
                                "\"cashAmount\":0,\"onlineAmount\":100",
                                "\"cashAmount\":30.001,\"onlineAmount\":69.999",
                                "\"cashAmount\":30")) {
                        mockMvc.perform(post("/api/payments").session(session).contentType(APPLICATION_JSON)
                                        .content("{\"tableName\":\"Table 1\",\"paymentMethod\":\"SPLIT\"," + amounts
                                                        + "}"))
                                        .andExpect(status().isBadRequest());
                }
                mockMvc.perform(post("/api/payments").session(session).contentType(APPLICATION_JSON)
                                .content("""
                                                {"tableName":"Table 1","paymentMethod":"SPLIT","cashAmount":30,"onlineAmount":70,"upiQrProvider":"SECONDARY"}
                                                """))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.paymentMethod").value("SPLIT"))
                                .andExpect(jsonPath("$.cashAmount").value(30))
                                .andExpect(jsonPath("$.onlineAmount").value(70))
                                .andExpect(jsonPath("$.upiQrProvider").value("SECONDARY"))
                                .andExpect(jsonPath("$.total").value(100));
                mockMvc.perform(get("/api/daily-closings/preview").session(session))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.cashSales").value(30))
                                .andExpect(jsonPath("$.onlineSales").value(70));
                mockMvc.perform(get("/api/history").session(session))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].cashAmount").value(30))
                                .andExpect(jsonPath("$[0].onlineAmount").value(70))
                                .andExpect(jsonPath("$[0].upiQrProvider").value("SECONDARY"));
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
                var primaryQrBill = Bill.createPaid("PP-PRIMARY-QR", "Outdoor 1", PaymentMethod.ONLINE, Instant.now());
                primaryQrBill.addLine(menuItem, 1, new BigDecimal("180.00"));
                primaryQrBill.markPaid(PaymentMethod.ONLINE, Instant.now(), BigDecimal.ZERO,
                                new BigDecimal("180.00"), UpiQrProvider.PRIMARY);
                billRepository.save(primaryQrBill);
                var secondaryQrBill = Bill.createPaid("PP-SECONDARY-QR", "Outdoor 2", PaymentMethod.ONLINE,
                                Instant.now());
                secondaryQrBill.addLine(menuItem, 1, new BigDecimal("60.00"));
                secondaryQrBill.markPaid(PaymentMethod.ONLINE, Instant.now(), BigDecimal.ZERO,
                                new BigDecimal("60.00"), UpiQrProvider.SECONDARY);
                billRepository.save(secondaryQrBill);
                expenseRepository.save(Expense.create("Rimo supplies", new BigDecimal("30.00"), "Rimo", null));
                expenseRepository.save(Expense.create("Rjoe supplies", new BigDecimal("5.00"), "Rjoe", null));
                expenseRepository.save(Expense.create("Rishi supplies", new BigDecimal("20.00"), "Rishi", null));
                expenseRepository.save(Expense.create("Cash supplies", new BigDecimal("75.00"), "Cash", null));
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
                                .andExpect(jsonPath("$.profits").value(230))
                                .andExpect(jsonPath("$.refunds").value(0))
                                .andExpect(jsonPath("$.expenses").value(130))
                                .andExpect(jsonPath("$.revenue").value(360))
                                .andExpect(jsonPath("$.paidOrderCount").value(3))
                                .andExpect(jsonPath("$.expenseCount").value(4))
                                .andExpect(jsonPath("$.individualTotals.length()").value(5))
                                .andExpect(jsonPath("$.individualTotals[0].source").value("Rimo (Secondary QR)"))
                                .andExpect(jsonPath("$.individualTotals[0].income").value(60))
                                .andExpect(jsonPath("$.individualTotals[0].expenses").value(30))
                                .andExpect(jsonPath("$.individualTotals[0].difference").value(30))
                                .andExpect(jsonPath("$.individualTotals[1].source").value("Rjoe"))
                                .andExpect(jsonPath("$.individualTotals[1].income").value(0))
                                .andExpect(jsonPath("$.individualTotals[1].difference").value(-5))
                                .andExpect(jsonPath("$.individualTotals[2].source").value("Rishi (Primary QR)"))
                                .andExpect(jsonPath("$.individualTotals[2].income").value(180))
                                .andExpect(jsonPath("$.individualTotals[2].difference").value(160))
                                .andExpect(jsonPath("$.individualTotals[3].source").value("Dinda"))
                                .andExpect(jsonPath("$.individualTotals[3].income").value(0))
                                .andExpect(jsonPath("$.individualTotals[3].expenses").value(0))
                                .andExpect(jsonPath("$.individualTotals[4].source").value("Cash"))
                                .andExpect(jsonPath("$.individualTotals[4].income").value(120))
                                .andExpect(jsonPath("$.individualTotals[4].expenses").value(75))
                                .andExpect(jsonPath("$.individualTotals[4].difference").value(45));

                expenseRepository.save(Expense.create("Rimo cleaning", new BigDecimal("10.00"), "Rimo", null));
                mockMvc.perform(get("/api/daily-closings/preview").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.expenses").value(140))
                                .andExpect(jsonPath("$.profits").value(220))
                                .andExpect(jsonPath("$.individualTotals[0].expenses").value(40))
                                .andExpect(jsonPath("$.individualTotals[0].difference").value(20));

                mockMvc.perform(post("/api/daily-closings/end").session(ownerSession))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.closingDate").value(businessDate))
                                .andExpect(jsonPath("$.startedAt").isNotEmpty())
                                .andExpect(jsonPath("$.cashSales").value(120))
                                .andExpect(jsonPath("$.onlineSales").value(240))
                                .andExpect(jsonPath("$.profits").value(220))
                                .andExpect(jsonPath("$.refunds").value(0))
                                .andExpect(jsonPath("$.expenses").value(140))
                                .andExpect(jsonPath("$.revenue").value(360))
                                .andExpect(jsonPath("$.paidOrderCount").value(3))
                                .andExpect(jsonPath("$.expenseCount").value(5))
                                .andExpect(jsonPath("$.individualTotals[0].expenses").value(40))
                                .andExpect(jsonPath("$.individualTotals[0].difference").value(20));

                mockMvc.perform(get("/api/daily-closings/status").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.active").value(false));

                mockMvc.perform(post("/api/daily-closings/end").session(ownerSession))
                                .andExpect(status().isConflict());

                mockMvc.perform(get("/api/daily-closings").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].closingDate").value(businessDate))
                                .andExpect(jsonPath("$[0].revenue").value(360))
                                .andExpect(jsonPath("$[0].profits").value(220))
                                .andExpect(jsonPath("$[0].individualTotals.length()").value(5))
                                .andExpect(jsonPath("$[0].individualTotals[2].source").value("Rishi (Primary QR)"));
        }

        @Test
        void includesOnlyExpensesRecordedAfterBusinessDayStart() throws Exception {
                var ownerSession = signIn();
                var expenseDate = LocalDate.now(BusinessDay.TIME_ZONE).minusDays(1);
                var expenseBeforeStart = expenseRepository.saveAndFlush(
                                Expense.create("Late-night supplies", new BigDecimal("800.00"), "Rimo", null));
                var secondExpenseBeforeStart = expenseRepository.saveAndFlush(
                                Expense.create("Night delivery", new BigDecimal("716.00"), "Rimo", null));
                var firstCreatedAt = expenseDate.atTime(0, 6).atZone(BusinessDay.TIME_ZONE).toInstant();
                var secondCreatedAt = expenseDate.atTime(0, 12).atZone(BusinessDay.TIME_ZONE).toInstant();
                jdbcTemplate.update("UPDATE expense SET created_at = ? WHERE id = ?",
                                java.sql.Timestamp.from(firstCreatedAt),
                                expenseBeforeStart.getId());
                jdbcTemplate.update("UPDATE expense SET created_at = ? WHERE id = ?",
                                java.sql.Timestamp.from(secondCreatedAt),
                                secondExpenseBeforeStart.getId());
                var startedAt = expenseDate.atTime(10, 27).atZone(BusinessDay.TIME_ZONE).toInstant();
                var expenseAfterStart = expenseRepository.saveAndFlush(
                                Expense.create("Morning supplies", new BigDecimal("50.00"), "Rimo", null));
                var afterStartCreatedAt = startedAt.plusSeconds(60);
                jdbcTemplate.update("UPDATE expense SET created_at = ? WHERE id = ?",
                                java.sql.Timestamp.from(afterStartCreatedAt), expenseAfterStart.getId());
                var state = businessDayStateRepository.findById(1).orElseThrow();
                state.start(startedAt);
                businessDayStateRepository.saveAndFlush(state);

                org.junit.jupiter.api.Assertions.assertTrue(firstCreatedAt.isBefore(startedAt));
                org.junit.jupiter.api.Assertions.assertTrue(secondCreatedAt.isBefore(startedAt));
                org.junit.jupiter.api.Assertions.assertTrue(afterStartCreatedAt.isAfter(startedAt));
                mockMvc.perform(get("/api/daily-closings/preview").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.closingDate").value(expenseDate.toString()))
                                .andExpect(jsonPath("$.expenses").value(50))
                                .andExpect(jsonPath("$.expenseCount").value(1))
                                .andExpect(jsonPath("$.individualTotals[0].source").value("Rimo (Secondary QR)"))
                                .andExpect(jsonPath("$.individualTotals[0].expenses").value(50))
                                .andExpect(jsonPath("$.individualTotals[0].difference").value(-50));

                mockMvc.perform(post("/api/daily-closings/end").session(ownerSession))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.expenses").value(50))
                                .andExpect(jsonPath("$.expenseCount").value(1))
                                .andExpect(jsonPath("$.individualTotals[0].expenses").value(50))
                                .andExpect(jsonPath("$.individualTotals[0].difference").value(-50));
        }

        @Test
        void assignsGapExpensesToTheNextBusinessDayAndTracksEdits() throws Exception {
                var ownerSession = signIn();
                var nextStartedAt = Instant.now().minusSeconds(1);
                var nextBusinessDate = BusinessDay.dateOf(nextStartedAt);
                var previousDate = nextBusinessDate.minusDays(1);
                var previousStartedAt = previousDate.atTime(10, 0).atZone(BusinessDay.TIME_ZONE).toInstant();
                var previousClosedAt = nextStartedAt.minusSeconds(120);
                var previousClosing = dailyClosingRepository.saveAndFlush(DailyClosing.create(
                                previousDate,
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                BigDecimal.ZERO,
                                0,
                                0,
                                previousStartedAt,
                                previousClosedAt));

                mockMvc.perform(post("/api/expenses")
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"After-close supplies","amount":100,"addedBy":"Rimo"}
                                                """))
                                .andExpect(status().isCreated());

                var savedExpense = expenseRepository.findAllByOrderByCreatedAtDesc().get(0);
                var gapCreatedAt = nextStartedAt.minusSeconds(60);
                jdbcTemplate.update("UPDATE expense SET created_at = ? WHERE id = ?",
                                java.sql.Timestamp.from(gapCreatedAt), savedExpense.getId());
                var businessDayState = businessDayStateRepository.findById(1).orElseThrow();
                businessDayState.start(nextStartedAt);
                businessDayStateRepository.saveAndFlush(businessDayState);

                mockMvc.perform(get("/api/daily-closings").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].expenses").value(0));

                mockMvc.perform(get("/api/daily-closings/preview").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.closingDate").value(nextBusinessDate.toString()))
                                .andExpect(jsonPath("$.expenses").value(100))
                                .andExpect(jsonPath("$.expenseCount").value(1))
                                .andExpect(jsonPath("$.individualTotals[0].source").value("Rimo (Secondary QR)"))
                                .andExpect(jsonPath("$.individualTotals[0].expenses").value(100))
                                .andExpect(jsonPath("$.individualTotals[0].difference").value(-100));

                mockMvc.perform(post("/api/daily-closings/end").session(ownerSession))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.expenses").value(100))
                                .andExpect(jsonPath("$.expenseCount").value(1))
                                .andExpect(jsonPath("$.individualTotals[0].expenses").value(100));

                mockMvc.perform(put("/api/expenses/{expenseId}", savedExpense.getId())
                                .session(ownerSession)
                                .contentType(APPLICATION_JSON)
                                .content("""
                                                {"title":"After-close supplies","amount":75,"addedBy":"Cash"}
                                                """))
                                .andExpect(status().isOk());

                mockMvc.perform(get("/api/daily-closings").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].expenses").value(75))
                                .andExpect(jsonPath("$[0].profits").value(-75))
                                .andExpect(jsonPath("$[0].individualTotals[0].expenses").value(0))
                                .andExpect(jsonPath("$[0].individualTotals[0].difference").value(0))
                                .andExpect(jsonPath("$[0].individualTotals[4].expenses").value(75))
                                .andExpect(jsonPath("$[0].individualTotals[4].difference").value(-75))
                                .andExpect(jsonPath("$[1].id").value(previousClosing.getId()))
                                .andExpect(jsonPath("$[1].expenses").value(0));
        }

        @Test
        void closesADayWithExpensesExceedingSales() throws Exception {
                var ownerSession = signIn();
                mockMvc.perform(post("/api/daily-closings/start").session(ownerSession))
                                .andExpect(status().isCreated());
                expenseRepository.save(Expense.create("Supplies", new BigDecimal("8404.00"), "Owner", null));

                mockMvc.perform(get("/api/daily-closings/preview").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.profits").value(-8404))
                                .andExpect(jsonPath("$.expenses").value(8404))
                                .andExpect(jsonPath("$.revenue").value(0));

                mockMvc.perform(post("/api/daily-closings/end").session(ownerSession))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.profits").value(-8404))
                                .andExpect(jsonPath("$.expenses").value(8404))
                                .andExpect(jsonPath("$.revenue").value(0));

                mockMvc.perform(get("/api/daily-closings/status").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$.active").value(false));
                mockMvc.perform(get("/api/daily-closings").session(ownerSession))
                                .andExpect(status().isOk())
                                .andExpect(jsonPath("$[0].profits").value(-8404));
                mockMvc.perform(post("/api/daily-closings/end").session(ownerSession))
                                .andExpect(status().isConflict());
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
                var paidBill = Bill.createPaid("PP-REFUND", "Table 1", PaymentMethod.SPLIT, Instant.now());
                paidBill.addLine(menuItem, 1, new BigDecimal("120.00"));
                paidBill.markPaid(PaymentMethod.SPLIT, Instant.now(), new BigDecimal("40.00"),
                                new BigDecimal("80.00"), UpiQrProvider.SECONDARY);
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
                                .andExpect(jsonPath("$.profits").value(0))
                                .andExpect(jsonPath("$.refunds").value(120))
                                .andExpect(jsonPath("$.expenses").value(0))
                                .andExpect(jsonPath("$.revenue").value(120));

                mockMvc.perform(post("/api/daily-closings/end").session(ownerSession))
                                .andExpect(status().isCreated())
                                .andExpect(jsonPath("$.profits").value(0))
                                .andExpect(jsonPath("$.refunds").value(120))
                                .andExpect(jsonPath("$.expenses").value(0))
                                .andExpect(jsonPath("$.revenue").value(120))
                                .andExpect(jsonPath("$.individualTotals[0].source").value("Rimo (Secondary QR)"))
                                .andExpect(jsonPath("$.individualTotals[0].income").value(80))
                                .andExpect(jsonPath("$.individualTotals[0].refunds").value(80))
                                .andExpect(jsonPath("$.individualTotals[0].difference").value(0))
                                .andExpect(jsonPath("$.individualTotals[4].source").value("Cash"))
                                .andExpect(jsonPath("$.individualTotals[4].income").value(40))
                                .andExpect(jsonPath("$.individualTotals[4].refunds").value(40))
                                .andExpect(jsonPath("$.individualTotals[4].difference").value(0));

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