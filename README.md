# Pet Puja Billing

A deliberately small, production-minded restaurant billing and management system with separate Admin and Captain access. The current scope provides a React application shell, Spring Boot API, database-backed menu editing, and one-host deployment setup.

## Stack

- React 19, TypeScript, and Vite
- Java 25 and Spring Boot 4
- H2 file database for local development, PostgreSQL 18 for deployment
- Flyway migrations and nginx for one-host deployment

## Local development

Prerequisites: Java 25 and Node.js 24 LTS or newer.

```bash
# Terminal 1: API
cd backend
export ADMIN_USERNAME='set-your-admin-username'
export ADMIN_PASSWORD='set-a-long-unique-admin-password'
export CAPTAIN_USERNAME='set-your-captain-username'
export CAPTAIN_PASSWORD='set-a-different-long-captain-password'
./mvnw -Dspring-boot.run.profiles=local spring-boot:run

# Terminal 2: web app
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` and `/actuator` to the API on port 8080. The API health endpoints are <http://localhost:8080/api/health> and <http://localhost:8080/actuator/health>.

The `local` profile stores data in `backend/data/pet-puja.mv.db`; it is ignored by git and survives API restarts. Flyway owns its schema. To use an installed PostgreSQL server instead, omit the `local` profile and set `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`.

## Local backup and restore

While running the `local` H2 profile, sign in and open the **Backup** tab to download a restorable ZIP archive. Create a backup before upgrading the application or making large menu/data changes.

To restore a downloaded backup:

1. Stop the backend application.
2. From `backend/`, move the current database aside:

	```bash
	mv data/pet-puja.mv.db data/pet-puja.before-restore.mv.db
	```

3. Find the H2 JAR Maven downloaded, then restore the archive into `backend/data`:

	```bash
	H2_JAR=$(find "$HOME/.m2/repository/com/h2database/h2" -type f -name 'h2-*.jar' | tail -n 1)
	java -cp "$H2_JAR" org.h2.tools.Restore -dir ./data -file "$HOME/Downloads/pet-puja-backup-YYYY-MM-DD-HHMMSS.zip"
	```

4. Start the backend again with the `local` profile. Keep the moved `pet-puja.before-restore.mv.db` file until the restored data is confirmed.

## Paid order corrections

Open **History**, select **Void / refund** on a paid order, choose the correction type, and enter a reason. Each paid order can be corrected once. The original paid order remains in History, while the negative adjustment appears in the Balance sheet and in a daily close created on the correction date. Previously saved daily closes remain unchanged.

## Operational safeguards

- Payments, menu deletions, voids/refunds, and daily closes require a final confirmation before the server records the change.
- A completed order can be paid and then turned into a final paid receipt using the server-issued bill number. The receipt can be downloaded or printed from the Table view before restarting that table.
- Open orders show their most recent confirmed save time. If a save fails, use **Retry save** to resend the exact change without rebuilding the order.
- History supports date, seating, payment method, and status filters.
- Daily close first shows the calculated cash, online, refunds, expenses, revenue, and record counts. Confirming saves an immutable snapshot.
- The Backup tab records the time of the most recent successful backup download in the current browser and warns if it is absent or more than seven days old. The browser status does not replace keeping the downloaded ZIP in a safe location.

## Tests and builds

```bash
cd backend && ./mvnw verify
cd frontend && npm test && npm run lint && npm run build
```

## Production deployment (no Docker)

Run on one host (for example a small EC2 instance) with native PostgreSQL, the Spring Boot jar, and nginx.

```bash
cd backend && ./mvnw -DskipTests package      # produces target/*.jar
cd ../frontend && npm ci && npm run build     # produces dist/
```

1. Install Java 25, PostgreSQL and nginx. Create the database and user; keep port 5432 private.
2. Copy `.env.example` to `/etc/pet-puja.env`, set `DB_*`, Admin and Captain values, and run the jar as a systemd service with `EnvironmentFile=/etc/pet-puja.env` and `ExecStart=java -jar /opt/pet-puja/app.jar`.
3. Copy `frontend/dist` to `/var/www/pet-puja`, and use `frontend/nginx.conf` as `/etc/nginx/conf.d/pet-puja.conf` after replacing `example.com`. It adds gzip, security headers, a login rate limit, and the HTTPS redirect.
4. Point a DNS name at the Elastic IP, open ports 80 and 443 (and SSH from your IP only), then run `sudo certbot certonly --nginx -d <domain>` and reload nginx. Set `SESSION_COOKIE_SECURE=true`.
5. Verify with `curl http://localhost/api/health`, and schedule `deploy/backup.sh` from cron.

### Backups on PostgreSQL

The in-app Backup tab only works with the H2 local profile and is hidden on PostgreSQL. Install `deploy/backup.sh` and run it nightly from cron; it keeps 14 days locally and copies to S3 if `S3_BUCKET` is set (attach an IAM role with `s3:PutObject`). Test a restore before launch:

```bash
createdb pet_puja_restore_test
pg_restore --no-owner -d pet_puja_restore_test /var/backups/pet-puja/<file>.dump
dropdb pet_puja_restore_test
```

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `DB_URL` | Backend JDBC URL | `jdbc:postgresql://localhost:5432/pet_puja` |
| `DB_USERNAME` | Database user | `pet_puja` |
| `DB_PASSWORD` | Database password | `pet_puja_local` for local development only |
| `spring.profiles.active=local` | File-backed H2 database | Recommended for local development |
| `ADMIN_USERNAME` | Admin login username; grants every workspace and menu management | Required |
| `ADMIN_PASSWORD` | Admin login password | Required |
| `CAPTAIN_USERNAME` | Captain login username; grants Table, read-only Menu, and History | Required |
| `CAPTAIN_PASSWORD` | Captain login password | Required |
| `RESTAURANT_NAME` | Public restaurant name shown in the app, documents, and payment QR | `Restaurant` |
| `UPI_VPA` | Public UPI payee address embedded in payment QR codes | Optional |
| `PORT` | Backend HTTP port | `8080` |
| `SESSION_COOKIE_SECURE` | Send the login session only over HTTPS | `false` locally, `true` in production over HTTPS |
| `VITE_API_BASE_URL` | Optional browser API origin | same origin |

Secrets belong in `.env` on the host or an external secret store; `.env` is ignored by git.
Set `RESTAURANT_NAME` and `UPI_VPA` in the backend environment file to control app branding and UPI QR details without rebuilding the frontend. Restart the backend after changing either value.
For existing deployments, move the current owner username and password values to `ADMIN_USERNAME` and `ADMIN_PASSWORD`, then set a separate Captain username and password before restarting the backend.

## Current boundaries

Flyway owns the schema for both local H2 and deployed PostgreSQL databases. Menu items persist a name, description, discount percentage, and price. Authentication mode is inferred from the matching Admin or Captain credentials and stored in the HTTP-only session. Admin can access every workspace and mutate the menu. Captain can use Table and History and view the menu without mutation controls; the backend independently rejects Captain requests to Admin-only APIs.
