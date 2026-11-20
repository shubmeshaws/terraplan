import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-tp-bg p-8 text-tp-fg">
      <p className="font-display text-3xl font-bold">
        <span>terra</span>
        <span className="text-[#ffae1a]">plan</span>
      </p>
      <h1 className="font-display text-xl">This page does not exist.</h1>
      <Link href="/" className="font-medium text-tp-accent underline underline-offset-4">
        Back to terraplan
      </Link>
    </main>
  );
}
