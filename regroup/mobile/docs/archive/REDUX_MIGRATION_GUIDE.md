# Redux Toolkit Migration Guide

## Overview

This guide explains how to migrate from old Redux actions/reducers to new Redux Toolkit (RTK) slices.

## Migration Status

### ✅ Completed
- Core RTK store configuration (`state/store.ts`)
- RTK slices for all major entities:
  - `userSlice` - Authentication and user management
  - `housesSlice` - House operations
  - `guestsSlice` - Guest management
  - `meetingsSlice` - Meeting search and check-in
  - `navigationSlice` - Navigation state
  - `uiSlice` - UI state (modals, loading, toasts)
  - `authSlice` - Auth token management
  - `themeSlice` - Theme preferences

### 🔄 In Progress
- Gradual component migration from old Redux to RTK
- Backward compatibility layer (both old and new reducers running)

### 📋 TODO
- Migrate remaining components to use RTK slices
- Remove old Redux infrastructure (`store/actions`, `store/reducers`)
- Cleanup backward compatibility layer

## Architecture

### Old Redux Pattern
```typescript
// ❌ OLD WAY - Don't use in new code
import { connect } from 'react-redux';
import * as userActions from '../../store/actions/user';

class MyComponent extends Component {
  componentDidMount() {
    this.props.login(email, password);
  }
}

export default connect(mapStateToProps, userActions)(MyComponent);
```

### New RTK Pattern
```typescript
// ✅ NEW WAY - Use this
import { useAppDispatch, useAppSelector } from '../../state/hooks';
import { login } from '../../state/slices';

const MyComponent: React.FC = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(state => state.userRTK.user);
  const loggingIn = useAppSelector(state => state.userRTK.loggingIn);

  const handleLogin = async () => {
    await dispatch(login({ email, password })).unwrap();
  };

  return <View>...</View>;
};
```

## Slice Reference

### User Slice (`userRTK`)

**State:** `state.userRTK`

**Actions:**
- `login({ email, password })` - Login with email/password
- `anonymouslyLogin()` - Anonymous login
- `autoLogin(firebaseUser)` - Auto-login from stored auth
- `logout()` - Logout user
- `updateUserRTK({ user, updates })` - Update user data
- `createUser(userData)` - Create new user
- `initializeInvitation(invitation)` - Set invitation
- `setSignUpRole(role)` - Set signup role
- `clearUserError()` - Clear errors

**Example:**
```typescript
const dispatch = useAppDispatch();
const { user, loggingIn, error } = useAppSelector(state => state.userRTK);

// Login
const handleLogin = async () => {
  try {
    await dispatch(login({ email, password })).unwrap();
    console.log('Logged in successfully');
  } catch (error) {
    console.error('Login failed:', error);
  }
};

// Logout
const handleLogout = () => {
  dispatch(logout());
};
```

### Houses Slice (`housesRTK`)

**State:** `state.housesRTK`

**Actions:**
- `getHouse(houseId)` - Fetch single house
- `getHouses(houseIds)` - Fetch multiple houses
- `searchForHouses(searchParams)` - Search houses
- `createHouse(houseData)` - Create new house
- `updateHouse({ houseId, updates })` - Update house
- `addIssue({ house, issue })` - Add issue to house
- `removeIssue({ house, issue })` - Remove issue from house
- `selectHouse(house)` - Select active house
- `clearHouseError()` - Clear errors

**Example:**
```typescript
const dispatch = useAppDispatch();
const { selectedHouse, houses, updatingHouse } = useAppSelector(
  state => state.housesRTK
);

// Get house
useEffect(() => {
  dispatch(getHouse(houseId));
}, [houseId, dispatch]);

// Update house
const handleUpdate = async () => {
  await dispatch(updateHouse({ houseId, updates: { name: 'New Name' } })).unwrap();
};

// Select house
dispatch(selectHouse(house));
```

### Guests Slice (`guestsRTK`)

**State:** `state.guestsRTK`

**Actions:**
- `getGuests(houseId)` - Fetch house guests
- `getGuest(guestId)` - Fetch single guest
- `updateGuest({ guest, updates })` - Update guest
- `createGuest(guestData)` - Create new guest
- `deleteGuest({ guestId, houseId })` - Delete guest
- `customizePhase({ guest, phaseConfig })` - Customize guest phase
- `selectGuest({ guestId, guests })` - Select active guest
- `cacheGuests(guests)` - Cache guests
- `clearGuestError()` - Clear errors

**Example:**
```typescript
const dispatch = useAppDispatch();
const { selectedGuest, guests, updatingGuest } = useAppSelector(
  state => state.guestsRTK
);

// Get guests for a house
useEffect(() => {
  dispatch(getGuests(houseId));
}, [houseId, dispatch]);

// Update guest
const handleUpdate = async () => {
  await dispatch(updateGuest({
    guest: selectedGuest,
    updates: { phase: 'phase2' }
  })).unwrap();
};

// Select guest
dispatch(selectGuest({ guestId, guests: null }));
```

### Meetings Slice (`meetingsRTK`)

**State:** `state.meetingsRTK`

**Actions:**
- `searchForMeetings(searchInput)` - Search meetings
- `checkIntoMeeting({ checkInInput, meeting, force })` - Check into meeting
- `addMeeting({ meeting, isGuest })` - Add new meeting
- `updateMeetingRTK({ meetingId, updates })` - Update meeting
- `deleteMeeting(meetingId)` - Delete meeting
- `clearMeetingError()` - Clear errors
- `resetCheckInStatus()` - Reset check-in state
- `clearMeetings()` - Clear meetings list

**Example:**
```typescript
const dispatch = useAppDispatch();
const { meetings, searchingForMeetings, checkingIn } = useAppSelector(
  state => state.meetingsRTK
);

// Search meetings
const handleSearch = () => {
  dispatch(searchForMeetings({ location, filters }));
};

// Check into meeting
const handleCheckIn = async () => {
  try {
    await dispatch(checkIntoMeeting({
      checkInInput,
      meeting,
      force: false
    })).unwrap();
    console.log('Checked in successfully');
  } catch (error) {
    console.error('Check-in failed:', error);
  }
};
```

### Navigation Slice (`navigation`)

**State:** `state.navigation`

**Actions:**
- `setTitle(title)` - Set navigation title
- `setModalShowing(showing)` - Set modal visibility

**Example:**
```typescript
const dispatch = useAppDispatch();

// Set title
dispatch(setTitle('House Overview'));

// Toggle modal
dispatch(setModalShowing(true));
```

### UI Slice (`ui`)

**State:** `state.ui`

**Actions:**
- `showModal({ modalType, props })` - Show modal
- `hideModal()` - Hide current modal
- `hideAllModals()` - Hide all modals
- `setLoading(key)` - Set loading state
- `clearLoading(key)` - Clear loading state
- `showToast({ message, type, duration })` - Show toast
- `hideToast()` - Hide toast

**Example:**
```typescript
const dispatch = useAppDispatch();

// Show loading
dispatch(setLoading('fetchingData'));

// Show modal
dispatch(showModal({ modalType: 'confirm', props: { message: 'Are you sure?' } }));

// Show toast
dispatch(showToast({ message: 'Success!', type: 'success', duration: 3000 }));
```

## Migration Checklist

For each component using old Redux:

1. **Remove old imports:**
   ```typescript
   // ❌ Remove
   import { connect } from 'react-redux';
   import * as userActions from '../../store/actions/user';
   ```

2. **Add new imports:**
   ```typescript
   // ✅ Add
   import { useAppDispatch, useAppSelector } from '../../state/hooks';
   import { login, logout } from '../../state/slices';
   ```

3. **Convert class to functional component:**
   - Remove `connect()` HOC
   - Use hooks: `useAppDispatch()`, `useAppSelector()`
   - Convert lifecycle methods to `useEffect()`
   - Convert methods to `useCallback()`

4. **Update state access:**
   ```typescript
   // ❌ Old
   const { user } = this.props;

   // ✅ New
   const user = useAppSelector(state => state.userRTK.user);
   ```

5. **Update action dispatching:**
   ```typescript
   // ❌ Old
   this.props.login(email, password);

   // ✅ New
   const dispatch = useAppDispatch();
   await dispatch(login({ email, password })).unwrap();
   ```

6. **Handle async actions properly:**
   ```typescript
   // RTK async thunks return promises
   try {
     const result = await dispatch(someAsyncAction()).unwrap();
     console.log('Success:', result);
   } catch (error) {
     console.error('Failed:', error);
   }
   ```

## State Path Reference

### Old Redux State Paths → New RTK State Paths

| Old Path | New Path | Notes |
|----------|----------|-------|
| `state.user.user` | `state.userRTK.user` | User data |
| `state.user.loggingIn` | `state.userRTK.loggingIn` | Login status |
| `state.houses.selectedHouse` | `state.housesRTK.selectedHouse` | Selected house |
| `state.houses.houses` | `state.housesRTK.houses` | All houses |
| `state.guests.selectedGuest` | `state.guestsRTK.selectedGuest` | Selected guest |
| `state.guests.guests` | `state.guestsRTK.guests` | All guests |
| `state.meetings.meetings` | `state.meetingsRTK.meetings` | Meetings list |
| `state.meetings.checkingIn` | `state.meetingsRTK.checkingIn` | Check-in status |

## Common Patterns

### Loading States
```typescript
const { loading, error } = useAppSelector(state => ({
  loading: state.userRTK.loggingIn || state.housesRTK.updatingHouse,
  error: state.userRTK.error || state.housesRTK.error,
}));
```

### Combining Multiple Async Actions
```typescript
const handleSetup = async () => {
  try {
    const user = await dispatch(createUser(userData)).unwrap();
    const house = await dispatch(createHouse({ ...houseData, userId: user.id })).unwrap();
    await dispatch(selectHouse(house));
  } catch (error) {
    console.error('Setup failed:', error);
  }
};
```

### Optimistic Updates
```typescript
// Update local state immediately
dispatch(updateSelectedGuest({ ...guest, name: newName }));

// Then sync with server
try {
  await dispatch(updateGuest({ guest, updates: { name: newName } })).unwrap();
} catch (error) {
  // Revert on failure
  dispatch(getGuest(guest.id));
}
```

## Testing with RTK

```typescript
import { configureStore } from '@reduxjs/toolkit';
import userReducer from '../../state/slices/userSlice';

describe('User operations', () => {
  let store;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        userRTK: userReducer,
      },
    });
  });

  it('should login successfully', async () => {
    await store.dispatch(login({ email: 'test@test.com', password: 'pass' }));
    const state = store.getState();
    expect(state.userRTK.loggedIn).toBe(true);
  });
});
```

## Next Steps

1. Gradually migrate components from old Redux to RTK slices
2. Test each migration thoroughly
3. Once all components use RTK, remove old Redux infrastructure:
   - Delete `store/actions` directory
   - Delete `store/reducers` directory
   - Remove old reducers from `state/store.ts`
4. Update App.tsx to remove old `connect()` usage
