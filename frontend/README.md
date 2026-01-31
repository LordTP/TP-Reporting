# Teliporter Reporting Platform - Frontend

React + TypeScript + Vite frontend for the Teliporter multi-tenant reporting platform.

## Features

- Modern React 18 with TypeScript
- Tailwind CSS for styling
- shadcn/ui components
- React Router for navigation
- TanStack Query for data fetching
- Zustand for state management
- Recharts for data visualization
- React Hook Form + Zod for forms

## Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Styling**: TailwindCSS
- **UI Components**: shadcn/ui (Radix UI)
- **State Management**: Zustand + React Query
- **Routing**: React Router v6
- **Forms**: React Hook Form + Zod
- **Charts**: Recharts

## Quick Start

### Prerequisites

- Node.js 18+ and npm

### Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Start development server:
```bash
npm run dev
```

4. Application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
```

Built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ui/              # shadcn/ui base components
│   │   ├── layout/          # Layout components (Sidebar, Header, etc.)
│   │   ├── charts/          # Chart components (Sales, Budget, etc.)
│   │   └── common/          # Common components (DataTable, DatePicker, etc.)
│   ├── features/            # Feature-based modules
│   │   ├── auth/            # Authentication
│   │   ├── dashboards/      # Dashboard management
│   │   ├── sales/           # Sales data
│   │   ├── square/          # Square integration
│   │   ├── locations/       # Location management
│   │   ├── budgets/         # Budget management
│   │   └── users/           # User management
│   ├── pages/               # Page components
│   ├── hooks/               # Custom React hooks
│   ├── store/               # Zustand stores
│   ├── lib/                 # Utilities and helpers
│   ├── types/               # TypeScript type definitions
│   ├── config/              # Configuration files
│   ├── App.tsx              # Root component
│   └── main.tsx             # Application entry point
├── public/                  # Static files
├── index.html               # HTML template
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript configuration
├── vite.config.ts           # Vite configuration
└── tailwind.config.js       # Tailwind configuration
```

## Development

### Adding New Components

For shadcn/ui components:
```bash
npx shadcn-ui@latest add [component-name]
```

### Code Style

- Use TypeScript for all files
- Follow React best practices
- Use functional components with hooks
- Use TanStack Query for server state
- Use Zustand for client state

### API Integration

The app uses Axios for API calls with automatic token refresh:

```typescript
import { apiClient } from '@/lib/api-client'

// GET request
const data = await apiClient.get('/endpoint')

// POST request
const result = await apiClient.post('/endpoint', { data })
```

## Testing

Run tests:
```bash
npm test
```

## Environment Variables

See `.env.example` for available environment variables.

- `VITE_API_BASE_URL`: Backend API URL (default: http://localhost:8000/api/v1)

## License

Proprietary - All rights reserved
