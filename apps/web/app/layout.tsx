import type { Metadata, Viewport } from 'next';
import './globals.css';
import './terraplan.css';

export const metadata: Metadata = {
  title: 'terraplan',
  description: 'Self-service Terraform plan and apply, with locks, approvals and guardrails.',
  icons: {
    icon: [{ url: '/favicon.png', type: 'image/png' }],
    apple: '/favicon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Bai+Jamjuree:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=JetBrains+Mono:wght@400;500;700&family=Outfit:wght@500;600;700&family=Space+Grotesk:wght@500;600;700&family=Syne:wght@600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Avoid landing flash when refreshing on #dashboard / post-login. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(/(?:^|[?&])signedIn=1(?:&|$)/.test(location.search))document.documentElement.classList.add('boot-splash');else if(location.hash==='#dashboard')document.documentElement.classList.add('boot-dash');}catch(e){}})();`,
          }}
        />
      </head>
      {/* terraplan.js sets data-dt (theme) on <body> at runtime. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
