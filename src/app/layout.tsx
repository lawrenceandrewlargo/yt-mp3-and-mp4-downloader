import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Media Lab · Research Downloader', description: 'A personal workbench for media metadata, formats, and permission-based local downloads.' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
