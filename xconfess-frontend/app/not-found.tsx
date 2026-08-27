import Link from 'next/link';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="bg-zinc-900 rounded-xl p-8 max-w-md w-full border border-zinc-800 text-center">
                <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center">
                        <span className="text-3xl font-bold text-zinc-400">404</span>
                    </div>
                </div>

                <h2 className="text-xl font-bold text-white mb-2">Page Not Found</h2>
                <p className="text-gray-400 text-sm mb-6">
                    The page you&apos;re looking for doesn&apos;t exist or has been moved.
                </p>

                <Link
                    href="/"
                    className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm transition-colors font-medium"
                >
                    Back to Home
                </Link>
            </div>
        </div>
    );
}
