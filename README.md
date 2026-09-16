# Pet Puja Billing

A deliberately small, production-minded base for a single-owner restaurant billing and management system. The current scope provides a React application shell, Spring Boot API, database-backed menu editing, and one-host deployment setup. Billing workflows, balance sheets, and stock checks will be added incrementally.

## Stack

- React 19, TypeScript, and Vite
- Java 21 and Spring Boot 4
- H2 file database for local development, PostgreSQL 18 for deployment
- Flyway migrations and nginx for one-host deployment

## Local development

Prerequisites: Java 21 and Node.js 24 LTS or newer. Docker is not required.

```bash
# Terminal 1: API
cd backend
export OWNER_USERNAME='set-your-owner-username'
export OWNER_PASSWORD='set-a-long-unique-password'
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

## Optional container deployment

This setup is intended for one small AWS EC2 instance with one Elastic IP. Install Docker Engine and the Compose plugin, allow inbound SSH and HTTP in the security group, and keep PostgreSQL private to the Compose network.

```bash
cp .env.example .env
# Set long, unique POSTGRES_PASSWORD and OWNER_PASSWORD values in .env.
docker compose -f compose.prod.yaml up -d --build
curl http://localhost/api/health
```

Persist and back up the `postgres-data` Docker volume. Terminate TLS on nginx after attaching a domain (for example with an nginx certificate mount or an AWS load balancer). Do not expose port 5432 publicly.

## Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `DB_URL` | Backend JDBC URL | `jdbc:postgresql://localhost:5432/pet_puja` |
| `DB_USERNAME` | Database user | `pet_puja` |
| `DB_PASSWORD` | Database password | `pet_puja_local` for local development only |
| `spring.profiles.active=local` | File-backed H2 database | Recommended for local no-Docker development |
| `OWNER_USERNAME` | Single owner login username | Required |
| `OWNER_PASSWORD` | Single owner login password | Required |
| `PORT` | Backend HTTP port | `8080` |
| `SESSION_COOKIE_SECURE` | Send the login session only over HTTPS | `false` locally, `true` in production Compose |
| `VITE_API_BASE_URL` | Optional browser API origin | same origin |

Secrets belong in `.env` on the host or an external secret store; `.env` is ignored by git.

## Current boundaries

Flyway owns the schema for both local H2 and deployed PostgreSQL databases. Menu items persist a name, description, discount percentage, and price. Authentication uses one owner username and password supplied through `OWNER_USERNAME` and `OWNER_PASSWORD`; the server stores its authenticated session in an HTTP-only cookie.

