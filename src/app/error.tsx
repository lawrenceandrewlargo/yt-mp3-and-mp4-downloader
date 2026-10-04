'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="error-page"><h1>The workbench could not load</h1><p>Check the application logs and database configuration.</p><button onClick={reset}>Try again</button></main>; }
