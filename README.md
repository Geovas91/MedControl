# MedControl

MedControl is a Next.js 16 SaaS starter for doctors and small clinics. It uses mock data only, so it can be run and reviewed without a database or external services.

## Tech Stack

- Next.js 16
- TypeScript
- Tailwind CSS
- App Router
- Lucide React icons

## Features

- Public landing page with hero, features, pricing, and contact CTA
- Authentication-ready login and signup screens
- Responsive dashboard layout with sidebar navigation
- Patients module with mock list, search, create form, and detail page
- Appointments module with mock daily agenda and create form
- Payments module with mock income and pending balance tracking
- Settings placeholder for future clinic configuration
- Clean medical SaaS UI for desktop and mobile

## Getting Started

Use Node.js 20.9 or newer.

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open the app:

```text
http://localhost:3000
```

Build for production:

```bash
npm run build
```

Start the production build:

```bash
npm run start
```

## Project Structure

```text
app/
  page.tsx                    Landing page
  (auth)/                     Login and signup screens
  dashboard/                  Dashboard routes and modules
components/
  dashboard/                  Dashboard shell and page primitives
  ui/                         Reusable UI components
lib/
  mock-data.ts                Local mock patients, appointments, payments
  types.ts                    Domain types
  utils.ts                    Formatting and class helpers
```

## Data

The app currently reads from `lib/mock-data.ts`. The sample records are fictional and intended for UI development only. No Supabase, Prisma, database, or API integration is connected yet.
