# Navigation Migration Guide

## Overview

This guide explains how to migrate from the old navigation system to the improved architecture.

## Migration Status

> **✅ Migration Complete (May 2026)**
> All 5 phases shipped. `ImprovedNavigationService` is the only navigation service.
> Compatibility shims, feature flags, and `MigrationControlPanel` have been removed.
> The remaining sections below are preserved as a historical record of the migration approach.

## How to Use the Migration

### 1. Development Testing

In development mode, you can access the Migration Control Panel from the splash screen:

1. Launch the app in development mode
2. On the splash screen, tap the "Migration" button in the top-right corner
3. Use the control panel to test different migration states

### 2. Enabling Gradual Rollout

```typescript
import { enableGradualRollout } from './src/navigation/migration-utils';

// Enable gradual rollout (recommended for testing)
enableGradualRollout();
```

### 3. Enabling Full Migration

```typescript
import { enableFullMigration } from './src/navigation/migration-utils';

// Enable full migration (production ready)
enableFullMigration();
```

### 4. Rolling Back

```typescript
import { rollbackMigration } from './src/navigation/migration-utils';

// Rollback to old navigation service
rollbackMigration();
```

## Migration Phases

### Phase 1: Preparation ✅

- [x] Created improved navigation service
- [x] Created improved navigators
- [x] Created test utilities
- [x] Created migration utilities

### Phase 2: Backward Compatibility ✅

- [x] Updated navigation service with compatibility layer
- [x] Added migration manager with feature flags
- [x] Created migration control panel
- [x] Added comprehensive logging

### Phase 3: Gradual Migration (Next)

- [ ] Test with real users
- [ ] Monitor performance
- [ ] Fix any issues found
- [ ] Gradually increase rollout percentage

### Phase 4: Full Migration

- [ ] Enable for all users
- [ ] Remove fallback code
- [ ] Clean up old navigation code

### Phase 5: Cleanup

- [ ] Remove migration utilities
- [ ] Remove old navigation service
- [ ] Update documentation

## Testing

### Running Tests

```bash
# Run navigation tests
npm test -- --testPathPattern=navigation

# Run migration tests specifically
npm test -- --testPathPattern=migration
```

### Manual Testing

1. Use the Migration Control Panel to test different scenarios
2. Test all user types (anonymous, guest, admin, super admin)
3. Test invitation flows
4. Test navigation between screens
5. Test deep linking

## Monitoring

### Logs

Migration logs are available in development mode. Look for:

```
[Navigation Migration] Using improved navigation for getInitialRoute
[Navigation Migration] Using old navigation for getInitialRoute
```

### Performance

Monitor app startup time and navigation performance during migration.

## Troubleshooting

### Common Issues

1. **Navigation not working after migration**

   - Check migration status with `checkMigrationStatus()`
   - Rollback if necessary with `rollbackMigration()`

2. **Performance issues**

   - Check if improved navigation is causing delays
   - Monitor memory usage

3. **Type errors**
   - Ensure all imports are updated
   - Check TypeScript configuration

### Rollback Procedure

If issues are found:

1. Call `rollbackMigration()` immediately
2. Investigate the issue
3. Fix the problem
4. Test again before re-enabling

## Best Practices

1. **Always test in development first**
2. **Use gradual rollout for production**
3. **Monitor logs and performance**
4. **Have rollback plan ready**
5. **Test all user scenarios**

## API Changes

### Old API (Still Supported)

```typescript
NavigationService.getInitialRoute(user, invitation);
NavigationService.getInitialAuthRoute(user, invitation);
NavigationService.getInitialMainRoute(user);
```

### New API (Recommended)

```typescript
NavigationService.getInitialNavigation(user, invitation);
// Returns: { initialRoute, authInitialRoute, initialMainRoute }
```

## Support

For issues or questions about the migration:

1. Check this guide first
2. Review the test suite
3. Use the Migration Control Panel for debugging
4. Check the migration logs
