import { Logo } from '../components';

export function ConfigError({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="flex justify-center">
        <Logo width={200} />
      </h1>
      <p role="alert" className="rounded-md border border-danger bg-surface-200 p-4">
        {message}
      </p>
      <p className="text-ink-muted">
        Copy <code>.env.example</code> to <code>.env.local</code>, fill in the Supabase values, then
        restart the dev server.
      </p>
    </main>
  );
}
