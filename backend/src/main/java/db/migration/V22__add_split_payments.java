package db.migration;

import java.util.ArrayList;

import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

public class V22__add_split_payments extends BaseJavaMigration {
    @Override
    public void migrate(Context context) throws Exception {
        var connection = context.getConnection();
        var constraints = new ArrayList<String>();
        try (var statement = connection.createStatement();
                var rows = statement.executeQuery("""
                        SELECT tc.constraint_name, cc.check_clause
                        FROM information_schema.table_constraints tc
                        JOIN information_schema.check_constraints cc
                          ON cc.constraint_schema = tc.constraint_schema AND cc.constraint_name = tc.constraint_name
                        WHERE LOWER(tc.table_name) = 'bill' AND tc.table_schema = current_schema()
                          AND tc.constraint_type = 'CHECK'
                        """)) {
            while (rows.next()) {
                if (rows.getString(2).toLowerCase(java.util.Locale.ROOT).contains("payment_method")) {
                    constraints.add(rows.getString(1));
                }
            }
        }
        try (var statement = connection.createStatement()) {
            for (var constraint : constraints) {
                statement.execute("ALTER TABLE bill DROP CONSTRAINT \"" + constraint.replace("\"", "\"\"") + "\"");
            }
            statement.execute("ALTER TABLE bill ADD COLUMN cash_amount NUMERIC(12,2) CHECK (cash_amount >= 0)");
            statement.execute("ALTER TABLE bill ADD COLUMN online_amount NUMERIC(12,2) CHECK (online_amount >= 0)");
            statement.execute("""
                    UPDATE bill SET cash_amount = CASE WHEN payment_method = 'CASH' THEN total ELSE 0 END,
                                    online_amount = CASE WHEN payment_method = 'ONLINE' THEN total ELSE 0 END
                    WHERE status = 'PAID'
                    """);
            statement.execute(
                    "ALTER TABLE bill ADD CONSTRAINT bill_payment_method_check CHECK (payment_method IN ('CASH','ONLINE','SPLIT'))");
            statement.execute(
                    "ALTER TABLE bill ADD CONSTRAINT bill_payment_amounts_check CHECK (cash_amount + online_amount = total)");
            statement.execute("""
                    ALTER TABLE bill ADD CONSTRAINT bill_split_amounts_check CHECK
                    (payment_method <> 'SPLIT' OR (cash_amount IS NOT NULL AND online_amount IS NOT NULL
                     AND cash_amount > 0 AND online_amount > 0))
                    """);
        }
    }
}