# Reaction Persistence Testing Guide

## Overview
This document provides step-by-step testing instructions to verify that reactions are properly persisted to the backend.

## Prerequisites
- Backend server running on port 5000 (or configured port)
- Frontend server running on port 3000 (or configured port)
- Valid user account with login credentials
- Database accessible and migrations applied

## Test Scenarios

### 1. User Login and Anonymous User ID Storage

**Steps:**
1. Navigate to the login page
2. Enter valid credentials
3. Click "Sign in"
4. Open browser DevTools > Application/Storage > Local Storage
5. Verify the following keys exist:
   - `xconfess_access_token`
   - `xconfess_user_data`
   - `xconfess_anonymous_user_id` (NEW)

**Expected Result:**
- All three keys should be present
- `xconfess_anonymous_user_id` should contain a valid UUID

### 2. Add Reaction - Like

**Steps:**
1. Log in to the application
2. Navigate to a confession detail page
3. Click the "👍 Like" button
4. Observe the UI updates

**Expected Result:**
- Button should show visual feedback (animation, color change)
- Count should increment immediately (optimistic update)
- After server response, count should reflect actual backend count
- No error messages should appear

**Backend Verification:**
```sql
-- Check reactions table
SELECT * FROM reaction 
WHERE confession_id = '<confession-uuid>' 
  AND emoji = '👍'
ORDER BY created_at DESC;
```

### 3. Add Reaction - Love

**Steps:**
1. Log in to the application
2. Navigate to a confession detail page
3. Click the "❤️ Love" button
4. Observe the UI updates

**Expected Result:**
- Button should show visual feedback
- Count should increment
- Reaction persisted in database

**Backend Verification:**
```sql
-- Check reactions table
SELECT * FROM reaction 
WHERE confession_id = '<confession-uuid>' 
  AND emoji = '❤️'
ORDER BY created_at DESC;
```

### 4. Reaction Persistence After Page Reload

**Steps:**
1. Add a reaction (like or love) to a confession
2. Note the current count
3. Reload the page (F5 or Cmd+R)
4. Observe the reaction count

**Expected Result:**
- Reaction count should persist after reload
- Count should match the value before reload
- Backend should return the persisted count

### 5. Invalid Reaction Type

**Steps:**
1. Open browser DevTools > Console
2. Execute the following in the console:
```javascript
fetch('/api/confessions/<confession-id>/react', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'x-anonymous-user-id': localStorage.getItem('xconfess_anonymous_user_id')
  },
  body: JSON.stringify({ type: 'invalid' })
}).then(r => r.json()).then(console.log);
```

**Expected Result:**
- Status: 400 Bad Request
- Response body should contain:
  ```json
  {
    "error": "Invalid reaction type",
    "message": "Reaction type must be 'like' or 'love'"
  }
  ```

### 6. Missing Anonymous User ID

**Steps:**
1. Open browser DevTools > Application/Storage > Local Storage
2. Remove `xconfess_anonymous_user_id` key
3. Try to add a reaction
4. Observe the response

**Expected Result:**
- Status: 401 Unauthorized
- Response body should contain:
  ```json
  {
    "error": "Missing anonymous user ID",
    "message": "Anonymous user ID is required. Please ensure you are logged in."
  }
  ```
- UI should show error message to the user

### 7. Backend Error Handling

**Steps:**
1. Stop the backend server
2. Try to add a reaction
3. Observe the UI response

**Expected Result:**
- UI should show error message
- Reaction count should rollback to original value
- Button state should return to inactive

### 8. Multiple Reactions

**Steps:**
1. Add a "Like" reaction to a confession
2. Add a "Love" reaction to the same confession
3. Verify both counts increment

**Expected Result:**
- Both reaction types should be tracked independently
- Counts should be accurate for each type

### 9. Reaction Count Consistency

**Steps:**
1. Open the same confession in two different browser tabs
2. Add a reaction in Tab 1
3. Reload Tab 2
4. Compare counts

**Expected Result:**
- Count in Tab 2 should reflect the reaction from Tab 1
- Counts should be consistent across tabs

## Backend API Verification

### Check Reaction Endpoint

```bash
# Test adding a reaction
curl -X POST http://localhost:5000/reactions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{
    "confessionId": "<confession-uuid>",
    "anonymousUserId": "<anonymous-user-uuid>",
    "emoji": "👍"
  }'
```

**Expected Response:**
- Status: 201 Created
- Body should contain the created reaction object

### Database Verification

```sql
-- Count reactions by type for a confession
SELECT 
  emoji,
  COUNT(*) as count
FROM reaction
WHERE confession_id = '<confession-uuid>'
GROUP BY emoji;

-- Verify anonymous user exists
SELECT * FROM anonymous_user 
WHERE id = '<anonymous-user-uuid>';

-- Check user-anonymous mapping
SELECT * FROM user_anonymous_users
WHERE anonymous_user_id = '<anonymous-user-uuid>';
```

## Common Issues and Troubleshooting

### Issue: Anonymous User ID not stored after login

**Solution:**
- Check backend `/users/login` endpoint returns `anonymousUserId`
- Verify frontend saves it to localStorage
- Check browser console for errors

### Issue: 401 Unauthorized when adding reaction

**Possible Causes:**
- Anonymous user ID not in localStorage
- Invalid or expired token
- Backend not receiving the header

**Solution:**
- Log in again to get a fresh anonymous user ID
- Check DevTools Network tab for request headers

### Issue: Reaction count doesn't update

**Possible Causes:**
- Backend API error
- Network connection issue
- Database constraint violation

**Solution:**
- Check browser console for errors
- Check backend logs
- Verify database connection

### Issue: Reaction count incorrect after reload

**Possible Causes:**
- Caching issue
- Backend not returning correct aggregation

**Solution:**
- Clear browser cache
- Check backend aggregation logic
- Verify database query results

## Success Criteria

✅ All test scenarios pass without errors  
✅ Reactions persist to database  
✅ Reaction counts are accurate after page reload  
✅ Invalid inputs return proper validation errors  
✅ UI provides clear feedback on success/failure  
✅ No console errors during normal operation  
✅ Database contains correct reaction records  
