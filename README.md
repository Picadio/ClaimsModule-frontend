
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

## Verification

```powershell
npm test -- --watch=false
npx playwright install chromium
npm run test:e2e
```

The browser test uses synthetic API responses and a 1280-pixel viewport. The same flow can be run from the UI against the configured demo environment to check SQL persistence, Hangfire and Azure Blob Storage.
