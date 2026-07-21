# PulseQLab

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.7.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## PulseQ Laboratory portal

This repo contains a standalone **Laboratory** portal (Angular 22 + PrimeNG v22, FastAPI backend).

### Backend
```bash
cd ../backend   # the backend lives as a sibling of this repo, at the same level as PulseQ-Lab/
pip install -r requirements.txt
python seed.py                 # creates a demo hospital, admin + lab users, sample catalog
uvicorn app.main:app --reload --port 8123
```
- Auth: `labtech` / `lab123` (lab role) or `admin` / `admin123`.
- API base: `http://localhost:8123/api/v1/staff/laboratory`.
- Realtime: WebSocket pub/sub at `/api/v1/staff/laboratory/ws?room=hospital_<id>` (and `doctor_<id>`).
- Reports are written as PDFs to `backend/reports/` with a stable `report_pdf_path`.

### Frontend
```bash
npm install
npm start                      # ng serve -> http://localhost:4200
```
- Under the main app the portal lives at `/staff/laboratory/...`; on a `lab.*` subdomain it serves from the root. All internal links go through `laboratoryPath()` so both modes work.
- Login screen is at `/staff/laboratory/auth/login`.

> Dev note: `angular.json` uses `allowedHosts: ["*"]` so the SSR server accepts `localhost`/`127.0.0.1`. Tighten this for production.

