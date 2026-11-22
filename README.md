# Claims Module Frontend

Angular 21 frontend for the ClaimsModule .NET API. It includes the claims list, First Notice of Loss intake, and claim detail screens. See [Frontend plan](FRONTEND-PLAN.md) for the requirements, API decisions and Azure integration steps.

## Run locally

Use a compatible Node.js version and npm. Node 24 was used for development. [Angular version compatibility](https://angular.dev/reference/versions)

1. Start the sibling ClaimsModule API with its HTTPS profile at `https://localhost:7273`. Follow the backend README for SQL Server, EF migrations and demo credentials.
2. In this directory, run:

   ```powershell
   npm ci
   npm start
   ```

3. Open [the Angular app](http://localhost:4200/) and sign in with one of the configured demo accounts. Sign out and use a different account to approve a reserve.

The local Angular proxy forwards `/api` to the HTTPS backend on loopback. Its development-only certificate exception supports the local ASP.NET certificate. To change the local API port, edit `proxy.conf.json`.

## Build and host

```powershell
npm run build
```

Deploy `dist/claims-module-frontend/browser` to a static host with a single-page app fallback. The build includes `staticwebapp.config.json` for Azure Static Web Apps. When hosting the frontend and API on distinct origins, configure public `apiOrigin` in `public/config.js` before the build, or set it in the published `config.js`. Configure the API's allowed frontend origin and request headers in CORS. `demoHandlerId` is optional and allows an elevated demo user to assign the configured handler when opening a Draft. It is a public identifier. Demo credentials and signing keys belong in backend configuration.

### Azure App Service on Linux

Use the Node 24 LTS stack. Build with `npm ci` and `npm run build`. Include `prepare-runtime-config.cjs` and `dist/claims-module-frontend/browser` at their repository-relative paths in the deployed package. The Angular output directory must be writable at startup.

In **Environment variables**, set `CLAIMS_API_ORIGIN` to the public HTTPS origin of the API. Supply only the origin, for example `https://example.azurewebsites.net`. The optional `CLAIMS_DEMO_HANDLER_ID` provides the public demo handler identifier. The startup script generates the browser's `config.js` on each start. Keep credentials and other secrets on the API side.

In **Configuration → Stack settings**, set the startup command:

```sh
node /home/site/wwwroot/prepare-runtime-config.cjs && pm2 serve /home/site/wwwroot/dist/claims-module-frontend/browser "$PORT" --no-daemon --spa
```

Allow the exact public UI origin in the API's CORS policy so browser requests can reach the separate API origin.

## Verification

```powershell
node --test tests/runtime-config.test.cjs
npm test -- --watch=false
npx playwright install chromium
npm run test:e2e
```

The browser test uses synthetic API responses and a 1280-pixel viewport. The same flow can be run from the UI against the configured demo environment to check SQL persistence, Hangfire and Azure Blob Storage.

To run the browser test against an Azure demo, provide these variables in a local environment file outside the repository.

- `CLAIMS_LIVE_BASE_URL` is the frontend URL.
- `CLAIMS_LIVE_HANDLER_PASSWORD` and `CLAIMS_LIVE_SUPERVISOR_PASSWORD` are the passwords for the demo accounts.

```powershell
node --env-file="$env:TEMP\claims-live.env" node_modules/@playwright/test/cli.js test --config playwright.azure.config.ts
```

The test creates a synthetic claim and uploads a text file. The claim remains available for audit in the demo database.
