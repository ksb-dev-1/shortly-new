import Link from "next/link";

export function Footer() {
  return (
    <footer>
      {/* inner wrapper, not the footer itself: mx-auto on a direct flex child
          shrinks it to its content instead of centering a full-width container */}
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-2xl font-semibold tracking-tight">
              Shortly<span className="text-brand">.</span>
            </span>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              A small, deliberate URL shortener.
            </p>
          </div>

          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link
              href="/signup"
              className="transition-colors hover:text-foreground"
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="transition-colors hover:text-foreground"
            >
              Log in
            </Link>
          </nav>
        </div>

        <p className="mt-10 border-t pt-6 font-mono text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Shortly
        </p>
      </div>
    </footer>
  );
}
