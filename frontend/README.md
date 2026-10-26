This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deploy the frontend to Vercel

Import the repository in Vercel and set **Root Directory** to `frontend`. Vercel detects
Next.js automatically; use the standard install and build settings (`npm install` and
`npm run build`). Add this environment variable in the Vercel project settings for each
environment:

```text
NEXT_PUBLIC_API_URL=https://ctf-platform-api.onrender.com
```

The example uses the Render service name in `render.yaml`; after deploying, copy the API's
actual `onrender.com` URL from its Render dashboard into this variable. Set `CORS_ALLOWED_ORIGINS` on that
service to the Vercel production domain and any preview domains that should be able to call
it, comma separated. The site uses bearer tokens from the browser and does not need
cross-site cookies.

The repository-root `render.yaml` deploys the platform API, five public challenge services,
and HookRelay's two private helpers. It stores SQLite and uploaded files on a Render disk and
seeds the challenge records when the API starts. Render's Blueprint will ask for the admin
password and allowed Vercel origins. The challenge flags are generated once and shared with
their matching services so scoring stays aligned. The API disk and two private helper services
use paid Render plans; the five public challenge services use the free plan by default.

Vercel hosts the Next.js frontend; Render hosts the API and challenge services. Vercel
supports FastAPI functions, but this backend uses SQLite and uploaded files, so the Render
disk keeps its data durable across deploys. Vercel does not run this Docker Compose stack.

See Vercel's [Next.js deployment guide](https://vercel.com/docs/frameworks/full-stack/nextjs),
[Root Directory settings](https://vercel.com/docs/builds/configure-a-build#root-directory),
and [FastAPI deployment notes](https://vercel.com/docs/frameworks/backend/fastapi). For the
backend, see [Render Blueprints](https://render.com/docs/blueprint-spec),
[private networking](https://render.com/docs/private-network), and
[persistent disks](https://render.com/docs/disks).

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
