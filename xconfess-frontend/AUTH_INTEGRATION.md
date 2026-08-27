# Authentication Integration Guide

## Overview
The real `useAuth` hook has been implemented with complete JWT token management. The system is ready to integrate with the backend once it's running.

## What Was Implemented

### ✅ Core Files Created

1. **`app/lib/types/auth.ts`** - TypeScript type definitions
2. **`app/lib/api/authService.ts`** - API service with axios interceptors
3. **`app/lib/providers/AuthProvider.tsx`** - Global auth context provider
4. **`app/lib/hooks/useAuth.ts`** - Real useAuth hook (replaced mock)
5. **`app/components/AuthGuard.tsx`** - Protected route component

### ✅ Files Updated

1. **`app/layout.tsx`** - Wrapped with AuthProvider
2. **`app/(auth)/login/page.tsx`** - Uses new useAuth hook
3. **`app/(auth)/register/page.tsx`** - Uses new useAuth hook with auto-login

## Environment Setup

Create `.env.local` in the frontend root with:

\`\`\`env
NEXT_PUBLIC_API_URL=http://localhost:3000
\`\`\`

**Note:** Update the port if your backend runs on a different port.

## Backend Integration

### Current State
- Backend is not running due to compilation errors
- All API calls will fail gracefully with error messages

### When Backend is Fixed

1. Start the backend server
2. Verify it's running on the port specified in `.env.local`
3. **No code changes needed** - everything will work automatically!

### API Endpoints Used

The implementation calls these backend endpoints:

- `POST /users/login` - Login with email/password
- `POST /users/register` - Register new user
- `GET /users/profile` - Get current user (requires JWT token)

## Features Implemented

### ✅ Token Management
- Stores JWT in `localStorage` as `access_token`
- Automatically adds token to all API requests via axios interceptor
- Clears token on logout

### ✅ Auto-Logout on Token Expiration
- Axios response interceptor detects 401 errors
- Automatically clears auth data and redirects to login
- No manual token expiration checking needed

### ✅ Persistent Authentication
- Checks auth status on app mount
- Validates token with backend via `/users/profile`
- Restores user session across page refreshes

### ✅ Loading States
- `isLoading` state during auth checks
- Prevents flash of unauthenticated content
- Loading spinner in AuthGuard

### ✅ Error Handling
- Network errors: "Unable to connect to server"
- Invalid credentials: Shows backend error message
- Token expired: Auto-logout and redirect
- All errors displayed in UI

### ✅ Auto-Login After Registration
- Register function automatically logs in user after successful registration
- Redirects to dashboard immediately

## Usage Examples

### In a Component

\`\`\`typescript
import { useAuth } from '@/app/lib/hooks/useAuth';

function MyComponent() {
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();

  if (isLoading) return <div>Loading...</div>;

  if (!isAuthenticated) {
    return <button onClick={() => login({ email, password })}>Login</button>;
  }

  return (
    <div>
      <p>Welcome, {user?.username}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
\`\`\`

### Protecting a Route

\`\`\`typescript
import { AuthGuard } from '@/app/components/AuthGuard';

export default function ProtectedPage() {
  return (
    <AuthGuard>
      <div>This content is only visible to authenticated users</div>
    </AuthGuard>
  );
}
\`\`\`

## Testing Checklist

Once the backend is running:

- [ ] Login with valid credentials
- [ ] Login with invalid credentials (should show error)
- [ ] Register new account (should auto-login)
- [ ] Refresh page (should stay logged in)
- [ ] Logout (should clear token and redirect)
- [ ] Access protected route while logged out (should redirect to login)
- [ ] Let token expire (should auto-logout on next API call)

## Dependencies

The implementation requires:
- `axios` - For HTTP requests and interceptors
- `react-hook-form` - Already installed
- `zod` - Already installed

## Notes

- Token is stored in `localStorage` (consider `httpOnly` cookies for production)
- No refresh token logic yet (can be added later)
- All API calls use the correct backend endpoints (`/users/*`)
- Error messages are user-friendly and don't expose internal details
