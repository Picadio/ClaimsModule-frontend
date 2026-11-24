# ClaimsModule Frontend

An Angular 21 web application for the ClaimsModule insurance claims management API. The application supports First Notice of Loss (FNOL), claim management, and role-based claims workflows.

## Live Demo

- [Frontend application](https://claimsmodule-frontend-hqdzhxe4cadhcvhn.spaincentral-01.azurewebsites.net/)
- [Backend API (Swagger)](https://claimsmodule-e3hshfhjh3csd3d6.spaincentral-01.azurewebsites.net/swagger/index.html)
- [Backend repository](https://github.com/Picadio/ClaimsModule)

## Features

- Claims list and claim detail views.
- First Notice of Loss intake.
- Claim lifecycle management and handler assignment.
- Role-based reserve submission and approval workflows.
- Claim document uploads.
- Demo account registration with handler, supervisor, and manager roles.

## Technology Stack

| Technology | Purpose |
| --- | --- |
| Angular 21 | Frontend framework |
| Node.js 24 and npm | Development and build tooling |
| ASP.NET Core / .NET 9 | Backend API |
| Playwright | End-to-end browser testing |
| Azure App Service | Application hosting |

## Getting Started

### Prerequisites

- Node.js 24 LTS (used during development) and npm. See [Angular version compatibility](https://angular.dev/reference/versions).
- A running [ClaimsModule backend](https://github.com/Picadio/ClaimsModule), configured with SQL Server or Azure SQL and applied EF Core migrations.

### Run locally

1. Start the backend using its HTTPS launch profile at `https://localhost:7273`. Follow the backend README for database configuration and migrations.
2. From the frontend repository root, install dependencies and start the development server:

   ```sh
   npm ci
   npm start
   ```

3. Open [http://localhost:4200/](http://localhost:4200/).
4. Select **Create a demo account**. Register a handler to submit claims and a separate supervisor or manager to approve reserves.

The Angular development proxy forwards `/api` requests to the local HTTPS backend. Its development-only certificate exception supports the local ASP.NET development certificate. To change the backend port, update `proxy.conf.json`.

## Configuration

The frontend supports public runtime configuration through `config.js`.

| Browser configuration | Azure environment variable | Purpose |
| --- | --- | --- |
| `apiOrigin` | `CLAIMS_API_ORIGIN` | Public HTTPS origin of the backend API. |
| `demoHandlerId` | `CLAIMS_DEMO_HANDLER_ID` | Optional preferred demo handler identifier. |

When opening a Draft claim, elevated users can select a handler from the organization's active user directory.

For separate frontend and backend origins, configure the exact frontend origin and required request headers in the backend CORS policy. Keep credentials, database connections, and JWT signing keys in backend configuration. Browser configuration is public and must not contain secrets.

## Build

Create a production build:

```sh
npm ci
npm run build
```

The build output is located at:

```text
dist/claims-module-frontend/browser
```

Deploy this directory to a static host with a single-page application fallback. The build includes `staticwebapp.config.json` for Azure Static Web Apps.

For static hosting, configure `apiOrigin` in `public/config.js` before building, or update the published `config.js` after deployment.

## Testing

Run runtime configuration tests, frontend tests, and Playwright end-to-end tests:

```sh
node --test tests/runtime-config.test.cjs
npm test -- --watch=false
npx playwright install chromium
npm run test:e2e
```

The browser test uses synthetic API responses and a 1280-pixel viewport. It does not verify real backend persistence.

## Related Documentation

- [ClaimsModule backend](https://github.com/Picadio/ClaimsModule) - API setup, database migrations, configuration, and deployment.
- [Backend architecture](https://github.com/Picadio/ClaimsModule/blob/master/ARCHITECTURE.md) - system design and architecture.
- [Angular documentation](https://angular.dev/) - frontend framework documentation.
