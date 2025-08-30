## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── demo1/             
│   ├── demo2/             
│   ├── demo3/             
│   ├── demo4/             
│   ├── demo5/             
│   ├── layout.tsx         # Root layout with sidebar
│   └── page.tsx           # Home page
├── components/
│   ├── ui/                # shadcn/ui components
│   └── app-sidebar.tsx    # Custom sidebar component
├── lib/
│   └── utils.ts           # Utility functions
└── styles/
    └── globals.css        # Global styles
```

## Technologies Used

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Modern component library
- **Recharts** - Chart library for data visualization
- **Lucide React** - Beautiful icons

## Getting Started

1. Install dependencies:
   ```bash
   yarn install
   ```

2. Run the development server:
   ```bash
   yarn dev
   ```

3. Open [http://localhost:3000](http://localhost:3000) in your browser
