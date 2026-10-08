export function ConfigError({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="text-center text-3xl font-semibold">Next Rep</h1>
      <p role="alert" className="rounded-lg bg-red-950 p-3 text-red-200">
        {message}
      </p>
      <p className="text-ink-muted">
        Copy <code>.env.example</code> to <code>.env.local</code>, fill in the Supabase values, then
        restart the dev server.
      </p>
    </main>
  );
}
