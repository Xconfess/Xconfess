# Error Handling Implementation Examples

This document provides real-world examples of how to implement error handling in your components.

## Example 1: Confession Form with Error Handling

```tsx
'use client';

import { useState } from 'react';
import { useAsyncForm } from '@/app/lib/hooks/useAsyncForm';
import { useApiError } from '@/app/lib/hooks/useApiError';
import apiClient from '@/app/lib/api/client';
import LoadingSpinner from '@/app/components/common/LoadingSpinner';

interface ConfessionFormData {
  content: string;
  category?: string;
  isAnonymous: boolean;
}

export function EnhancedConfessionForm() {
  const [formData, setFormData] = useState<ConfessionFormData>({
    content: '',
    isAnonymous: true,
  });

  const { execute, loading, error, reset } = useAsyncForm(
    async () => {
      const response = await apiClient.post('/api/confessions', formData);
      return response.data;
    },
    {
      onSuccess: () => {
        setFormData({ content: '', isAnonymous: true });
      },
      successMessage: 'Your confession has been posted!',
      context: 'Confession Form Submission',
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.content.trim()) {
      return;
    }

    await execute();
  };

  if (loading) {
    return <LoadingSpinner message="Posting your confession..." />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <textarea
          value={formData.content}
          onChange={(e) =>
            setFormData({ ...formData, content: e.target.value })
          }
          placeholder="Share your confession..."
          className="w-full bg-zinc-800 text-white rounded p-3"
          rows={5}
          disabled={loading}
        />
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading || !formData.content.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded transition-colors"
        >
          {loading ? 'Posting...' : 'Post'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded transition-colors"
        >
          Clear
        </button>
      </div>
    </form>
  );
}
```

## Example 2: Data Fetching with Error Boundary

```tsx
'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/app/lib/api/client';
import { getErrorMessage } from '@/app/lib/utils/errorHandler';
import LoadingSpinner from '@/app/components/common/LoadingSpinner';
import SkeletonLoader, { CardSkeleton } from '@/app/components/common/SkeletonLoader';
import ErrorState from '@/app/components/common/ErrorState';
import { ErrorBoundary } from '@/app/components/common/ErrorBoundary';

interface Confession {
  id: string;
  content: string;
  createdAt: string;
}

function ConfessionListContent() {
  const [confessions, setConfessions] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfessions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/api/confessions');
      setConfessions(response.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfessions();
  }, []);

  if (loading) {
    return <CardSkeleton count={3} />;
  }

  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={fetchConfessions}
        title="Failed to Load Confessions"
        description="Unable to fetch confessions at this time"
      />
    );
  }

  if (confessions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p>No confessions yet. Be the first to share!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {confessions.map((confession) => (
        <div
          key={confession.id}
          className="bg-zinc-800 rounded-lg p-4 border border-zinc-700"
        >
          <p className="text-white">{confession.content}</p>
          <p className="text-xs text-gray-500 mt-2">
            {new Date(confession.createdAt).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}

export function ConfessionList() {
  return (
    <ErrorBoundary>
      <ConfessionListContent />
    </ErrorBoundary>
  );
}
```

## Example 3: Authentication with Error Handling

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import apiClient from '@/app/lib/api/client';
import { useAsyncForm } from '@/app/lib/hooks/useAsyncForm';
import { isUnauthorized } from '@/app/lib/utils/errorHandler';

interface LoginFormData {
  email: string;
  password: string;
}

export function LoginForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });

  const { execute, loading, error } = useAsyncForm(
    async () => {
      const response = await apiClient.post('/api/auth/login', formData);
      const { token } = response.data;
      // AUTH_TOKEN_KEY from '@/app/lib/api/constants'
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      return response.data;
    },
    {
      onSuccess: () => {
        router.push('/dashboard');
      },
      successMessage: 'Welcome back!',
      context: 'Login',
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await execute();
    } catch (err) {
      if (isUnauthorized(err)) {
        // Handle specific error case
        setFormData({ ...formData, password: '' });
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Email
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) =>
            setFormData({ ...formData, email: e.target.value })
          }
          className="w-full bg-zinc-800 text-white rounded px-3 py-2"
          disabled={loading}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Password
        </label>
        <input
          type="password"
          value={formData.password}
          onChange={(e) =>
            setFormData({ ...formData, password: e.target.value })
          }
          className="w-full bg-zinc-800 text-white rounded px-3 py-2"
          disabled={loading}
          required
        />
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700 rounded p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded transition-colors font-medium"
      >
        {loading ? 'Logging in...' : 'Log In'}
      </button>
    </form>
  );
}
```

## Example 4: Search with API Error Handling

```tsx
'use client';

import { useState, useCallback, useEffect } from 'react';
import apiClient from '@/app/lib/api/client';
import { useGlobalToast } from '@/app/components/common/Toast';
import { getErrorMessage } from '@/app/lib/utils/errorHandler';
import LoadingSpinner from '@/app/components/common/LoadingSpinner';
import ErrorState from '@/app/components/common/ErrorState';

interface SearchResult {
  id: string;
  title: string;
  content: string;
}

export function SearchComponent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useGlobalToast();

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get('/api/search', {
        params: { q: searchQuery },
      });
      setResults(response.data);
      
      if (response.data.length === 0) {
        toast.info('No results found');
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await search(query);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search..."
          className="flex-1 bg-zinc-800 text-white rounded px-3 py-2"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded transition-colors"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {loading && <LoadingSpinner message="Searching..." />}

      {error && (
        <ErrorState
          error={error}
          onRetry={() => search(query)}
          title="Search Failed"
        />
      )}

      {!loading && !error && results.length > 0 && (
        <div className="space-y-2">
          {results.map((result) => (
            <div
              key={result.id}
              className="bg-zinc-800 rounded p-3 border border-zinc-700"
            >
              <h4 className="font-medium text-white">{result.title}</h4>
              <p className="text-sm text-gray-400">{result.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Example 5: Profile Update with Validation Errors

```tsx
'use client';

import { useState } from 'react';
import apiClient from '@/app/lib/api/client';
import { useApiError } from '@/app/lib/hooks/useApiError';
import { getErrorMessage, getErrorStatusCode } from '@/app/lib/utils/errorHandler';

interface ProfileData {
  username: string;
  bio: string;
}

export function ProfileUpdateForm() {
  const [formData, setFormData] = useState<ProfileData>({
    username: '',
    bio: '',
  });
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const { handleError, handleSuccess } = useApiError({
    context: 'Profile Update',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationErrors({});

    try {
      setLoading(true);
      const response = await apiClient.put('/api/profile', formData);
      handleSuccess('Profile updated successfully');
      setFormData(response.data);
    } catch (err) {
      const statusCode = getErrorStatusCode(err);
      
      // Handle validation errors (422)
      if (statusCode === 422) {
        const validationErrors = (err as any).response?.data?.errors || {};
        setValidationErrors(validationErrors);
        handleError(err, 'Please fix the errors below');
      } else {
        handleError(err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Username
        </label>
        <input
          type="text"
          value={formData.username}
          onChange={(e) =>
            setFormData({ ...formData, username: e.target.value })
          }
          className={`w-full bg-zinc-800 text-white rounded px-3 py-2 ${
            validationErrors.username ? 'border border-red-500' : ''
          }`}
          disabled={loading}
        />
        {validationErrors.username && (
          <p className="text-red-400 text-xs mt-1">
            {validationErrors.username}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">
          Bio
        </label>
        <textarea
          value={formData.bio}
          onChange={(e) =>
            setFormData({ ...formData, bio: e.target.value })
          }
          className={`w-full bg-zinc-800 text-white rounded px-3 py-2 ${
            validationErrors.bio ? 'border border-red-500' : ''
          }`}
          disabled={loading}
          rows={4}
        />
        {validationErrors.bio && (
          <p className="text-red-400 text-xs mt-1">
            {validationErrors.bio}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white px-4 py-2 rounded transition-colors font-medium"
      >
        {loading ? 'Saving...' : 'Save Profile'}
      </button>
    </form>
  );
}
```

## Example 6: Handling Multiple Async Operations

```tsx
'use client';

import { useState, useCallback } from 'react';
import apiClient from '@/app/lib/api/client';
import { useGlobalToast } from '@/app/components/common/Toast';
import { getErrorMessage } from '@/app/lib/utils/errorHandler';

interface OperationStatus {
  [key: string]: {
    loading: boolean;
    error: string | null;
  };
}

export function MultiOperationComponent() {
  const [status, setStatus] = useState<OperationStatus>({});
  const toast = useGlobalToast();

  const executeOperation = useCallback(
    async (key: string, operation: () => Promise<void>) => {
      setStatus((prev) => ({
        ...prev,
        [key]: { loading: true, error: null },
      }));

      try {
        await operation();
        setStatus((prev) => ({
          ...prev,
          [key]: { loading: false, error: null },
        }));
        toast.success('Operation completed');
      } catch (err) {
        const errorMessage = getErrorMessage(err);
        setStatus((prev) => ({
          ...prev,
          [key]: { loading: false, error: errorMessage },
        }));
        toast.error(errorMessage);
      }
    },
    [toast]
  );

  const handleDelete = () => {
    executeOperation('delete', async () => {
      await apiClient.delete('/api/item/123');
    });
  };

  const handleArchive = () => {
    executeOperation('archive', async () => {
      await apiClient.post('/api/item/123/archive');
    });
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleDelete}
        disabled={status.delete?.loading}
        className="bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white px-4 py-2 rounded"
      >
        {status.delete?.loading ? 'Deleting...' : 'Delete'}
      </button>

      {status.delete?.error && (
        <p className="text-red-400 text-sm">{status.delete.error}</p>
      )}

      <button
        onClick={handleArchive}
        disabled={status.archive?.loading}
        className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 text-white px-4 py-2 rounded"
      >
        {status.archive?.loading ? 'Archiving...' : 'Archive'}
      </button>

      {status.archive?.error && (
        <p className="text-red-400 text-sm">{status.archive.error}</p>
      )}
    </div>
  );
}
```

These examples demonstrate the complete error handling system in action. Adapt them to your specific use cases.
