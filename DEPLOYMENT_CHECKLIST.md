# Failed Notification Jobs Dashboard - Deployment Checklist

This checklist is specific to the failed notification jobs dashboard release flow. For cross-system release gates covering backend, frontend, contracts, rollback, and post-release verification, start with [docs/release-readiness-checklist.md](docs/release-readiness-checklist.md) and then use this document for the dashboard-specific checks below.

## Pre-Deployment Checklist.

### Code Review
- [ ] Review all new files for code quality
- [ ] Verify TypeScript types are correct
- [ ] Check for any console.log statements
- [ ] Ensure no hardcoded values
- [ ] Verify error handling is comprehensive
- [ ] Check for security vulnerabilities

### Testing
- [ ] Run all tests: `npm test`
- [ ] Verify all tests pass
- [ ] Check test coverage: `npm test -- --coverage`
- [ ] Run linter: `npm run lint`
- [ ] Type check: `npx tsc --noEmit`
- [ ] Manual testing on desktop
- [ ] Manual testing on tablet
- [ ] Manual testing on mobile
- [ ] Test with slow network (throttling)
- [ ] Test with mock mode enabled
- [ ] Test with real backend API

### Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

### Accessibility Testing
- [ ] Keyboard navigation works
- [ ] Screen reader announces correctly
- [ ] Color contrast meets WCAG AA
- [ ] Focus indicators visible
- [ ] ARIA labels present
- [ ] No accessibility errors in DevTools

### Performance Testing
- [ ] Initial load time < 1s
- [ ] Filter changes < 500ms
- [ ] Page navigation < 300ms
- [ ] No memory leaks
- [ ] No console errors
- [ ] Lighthouse score > 90

### Integration Testing
- [ ] Backend API endpoints working
- [ ] Authentication working
- [ ] Authorization (admin only) working
- [ ] Pagination working correctly
- [ ] Filters working correctly
- [ ] Replay action working
- [ ] Error handling working
- [ ] Optimistic updates working

### Documentation Review
- [ ] README.md is complete
- [ ] VISUAL_GUIDE.md is accurate
- [ ] API_SPEC.md matches backend
- [ ] Code comments are clear
- [ ] Type definitions are documented

## Deployment Steps

### 1. Frontend Deployment

#### Install Dependencies
```bash
cd xconfess-frontend
npm install
```

#### Run Tests
```bash
npm test
```

#### Build for Production
```bash
npm run build
```

#### Verify Build
```bash
npm start
# Navigate to http://localhost:3000/admin/notifications
# Verify page loads and works correctly
```

#### Deploy to Staging
```bash
# Your deployment command here
# e.g., vercel deploy --prod
```

#### Smoke Test on Staging
- [ ] Navigate to staging URL
- [ ] Login as admin
- [ ] Navigate to /admin/notifications
- [ ] Verify page loads
- [ ] Test filtering
- [ ] Test pagination
- [ ] Test replay action
- [ ] Check console for errors

### 2. Backend Verification

#### Verify Endpoints Exist
```bash
# Test list endpoint
curl -X GET "https://api.staging.example.com/admin/notifications/dlq?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Test replay endpoint
curl -X POST "https://api.staging.example.com/admin/notifications/dlq/JOB_ID/replay" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Test replay"}'
```

#### Verify Responses
- [ ] List endpoint returns correct structure
- [ ] Pagination works correctly
- [ ] Filters work correctly
- [ ] Replay endpoint returns success
- [ ] Error responses are correct
- [ ] Authentication is enforced
- [ ] Authorization is enforced

### 3. Database/Queue Verification

#### Check BullMQ Queue
- [ ] Failed jobs are in DLQ
- [ ] Job data structure is correct
- [ ] Timestamps are accurate
- [ ] Replay moves jobs correctly

### 4. Monitoring Setup

#### Add Monitoring
- [ ] Set up error tracking (e.g., Sentry)
- [ ] Set up performance monitoring
- [ ] Set up API monitoring
- [ ] Set up uptime monitoring

#### Configure Alerts
- [ ] Alert on high error rate
- [ ] Alert on slow response times
- [ ] Alert on failed replays
- [ ] Alert on authentication failures

### 5. Documentation

#### Update Documentation
- [ ] Update API documentation
- [ ] Update user guide
- [ ] Update admin guide
- [ ] Update changelog

#### Notify Team
- [ ] Notify frontend team
- [ ] Notify backend team
- [ ] Notify QA team
- [ ] Notify product team
- [ ] Notify support team

## Post-Deployment Checklist

### Immediate Verification (0-1 hour)
- [ ] Page loads successfully
- [ ] No console errors
- [ ] Authentication works
- [ ] Authorization works
- [ ] Data displays correctly
- [ ] Filters work
- [ ] Pagination works
- [ ] Replay action works

### Short-term Monitoring (1-24 hours)
- [ ] Monitor error rates
- [ ] Monitor performance metrics
- [ ] Monitor API response times
- [ ] Check user feedback
- [ ] Review logs for issues

### Medium-term Monitoring (1-7 days)
- [ ] Analyze usage patterns
- [ ] Review performance trends
- [ ] Check for edge cases
- [ ] Gather user feedback
- [ ] Identify improvement areas

## Rollback Plan

### If Issues Occur

#### Minor Issues (UI bugs, non-critical)
1. Create hotfix branch
2. Fix issue
3. Test thoroughly
4. Deploy hotfix

#### Major Issues (data loss, security, crashes)
1. Immediately rollback deployment
2. Investigate root cause
3. Fix in development
4. Re-test thoroughly
5. Re-deploy when ready

### Rollback Commands
```bash
# Rollback to previous version
# Your rollback command here
# e.g., vercel rollback
```

### Rollback Verification
- [ ] Previous version is live
- [ ] No errors in console
- [ ] All features working
- [ ] Users can access site

## Success Criteria

### Functional
- ✅ All features working as expected
- ✅ No critical bugs
- ✅ Performance meets targets
- ✅ Accessibility standards met

### Technical
- ✅ All tests passing
- ✅ No console errors
- ✅ No memory leaks
- ✅ API integration working

### User Experience
- ✅ Page loads quickly
- ✅ Interactions are smooth
- ✅ Error messages are clear
- ✅ Mobile experience is good

### Business
- ✅ Admins can monitor failed jobs
- ✅ Admins can replay failed jobs
- ✅ Reduces manual intervention
- ✅ Improves notification reliability

## Known Issues

### Non-blocking Issues
- None at this time

### Future Enhancements
- Real-time updates
- Bulk actions
- Export to CSV
- Advanced search

## Support Plan

### Level 1 Support (Users)
- Check documentation
- Check browser console
- Try different browser
- Clear cache and cookies

### Level 2 Support (Developers)
- Check error logs
- Check API responses
- Check database/queue
- Enable debug mode

### Level 3 Support (DevOps)
- Check server logs
- Check infrastructure
- Check monitoring
- Escalate if needed

## Contact Information

### Frontend Team
- Lead: [Name]
- Email: [Email]
- Slack: [Channel]

### Backend Team
- Lead: [Name]
- Email: [Email]
- Slack: [Channel]

### DevOps Team
- Lead: [Name]
- Email: [Email]
- Slack: [Channel]

## Sign-off

### Development Team
- [ ] Frontend Lead: _________________ Date: _______
- [ ] Backend Lead: _________________ Date: _______
- [ ] QA Lead: _________________ Date: _______

### Management
- [ ] Product Manager: _________________ Date: _______
- [ ] Engineering Manager: _________________ Date: _______

## Notes

_Add any additional notes or observations here_

---

**Deployment Date**: __________
**Deployed By**: __________
**Version**: 1.0.0
**Status**: ⏳ Pending Deployment
