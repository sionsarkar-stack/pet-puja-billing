# Pet Puja Billing

A deliberately small, production-minded base for a single-owner restaurant billing and management system. The current scope provides a React application shell, Spring Boot API, PostgreSQL schema, and one-host deployment setup. Billing workflows, balance sheets, stock checks, menu editing, and authentication will be added incrementally.

## Stack

- React 19, TypeScript, and Vite
- Java 21 and Spring Boot 4
- PostgreSQL 18 with Flyway migrations
- Docker Compose and nginx for one-host deployment

## Local development

Prerequisites: Java 21, Node.js 24 LTS or newer, and Docker.

```bash
# Start PostgreSQL
docker compose up -d database

# Terminal 1: API
cd backend
./mvnw spring-boot:run

# Terminal 2: web app
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` and `/actuator` to the API on port 8080. The API health endpoints are <http://localhost:8080/api/health> and <http://localhost:8080/actuator/health>.

Default local database values are intentionally development-only and can be overridden with `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`.

## Tests and builds

```bash
cd backend && ./mvnw verify
cd frontend && npm test && npm run lint && npm run build
```

## EC2 deployment

This setup is intended for one small AWS EC2 instance with one Elastic IP. Install Docker Engine and the Compose plugin, allow inbound SSH and HTTP in the security group, and keep PostgreSQL private to the Compose network.

```bash
cp .env.example .env
# Set a long, unique POSTGRES_PASSWORD in .env
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
| `PORT` | Backend HTTP port | `8080` |
| `VITE_API_BASE_URL` | Optional browser API origin | same origin |

Secrets belong in `.env` on the host or an external secret store; `.env` is ignored by git.

## Current boundaries

Flyway owns the schema. Initial domain models cover menu items, inventory items, bills, and bill lines without prematurely implementing business workflows. Authentication is intentionally not scaffolded yet. When it is added, enforce one owner account with at most four active device sessions on the server; never rely on a browser-only device limit.

