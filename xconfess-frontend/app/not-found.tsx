import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
            <div className="bg-[var(--surface)] rounded-xl p-8 max-w-md w-full border border-[var(--border)] text-center">
                <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-[var(--surface-muted)] rounded-full flex items-center justify-center">
                        <span className="text-3xl font-semibold text-[var(--text-muted)]">404</span>
                    </div>
                </div>

                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">Page Not Found</h2>
                <p className="text-[var(--text-muted)] text-sm mb-6">
                    The page you&apos;re looking for doesn&apos;t exist or has been moved.
                </p>

                <Link
                    href="/"
                    className="inline-block bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white px-6 py-2.5 rounded-lg text-sm transition-colors font-medium"
                >
                    Back to Home
                </Link>
            </div>
        </div>
    );
}
