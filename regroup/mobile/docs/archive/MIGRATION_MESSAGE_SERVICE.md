# Message Service Firestore Migration

## Overview
Migrating message service from Firebase Realtime Database to Firestore for better querying, scalability, and consistency with other collections.

## Current State (Realtime Database)

### Data Structure
```
/house-chat
  /{houseId}
    /{messageId}
      - text, senderId, sortKey, createdAt, etc.

/direct-messages
  /{conversationId}  // sorted IDs joined
    /{messageId}
      - text, senderId, sortKey, createdAt, read, etc.
```

### Limitations
- Limited querying capabilities
- No compound indexes
- Harder to maintain consistency
- Different API from rest of app (uses Firestore)

## Target State (Firestore)

### Data Structure
```
/houses/{houseId}/chat
  /{messageId}
    - text, senderId, sortKey, createdAt, etc.

/direct-messages/{conversationId}/chat
  /{messageId}
    - text, senderId, sortKey, createdAt, read, etc.
```

### Benefits
- Compound queries
- Better pagination
- Consistent with other collections
- Better offline support
- Automatic indexing

## Migration Steps (DOCUMENT ONLY - DO NOT EXECUTE)

### 1. Backend Data Migration Script

```javascript
// Migration script to run on backend (Node.js)
const admin = require('firebase-admin');
const db = admin.database();
const firestore = admin.firestore();

async function migrateHouseChats() {
  const houseChatRef = db.ref('house-chat');
  const snapshot = await houseChatRef.once('value');
  const houseChats = snapshot.val();

  for (const houseId in houseChats) {
    const messages = houseChats[houseId];

    for (const messageId in messages) {
      const message = messages[messageId];

      // Write to Firestore
      await firestore
        .collection('houses')
        .doc(houseId)
        .collection('chat')
        .doc(messageId)
        .set({
          ...message,
          createdAt: admin.firestore.Timestamp.fromMillis(message.createdAt),
        });
    }

    console.log(`Migrated house chat: ${houseId}`);
  }
}

async function migrateDirectMessages() {
  const directMessageRef = db.ref('direct-messages');
  const snapshot = await directMessageRef.once('value');
  const conversations = snapshot.val();

  for (const conversationId in conversations) {
    const messages = conversations[conversationId];

    for (const messageId in messages) {
      const message = messages[messageId];

      // Write to Firestore
      await firestore
        .collection('direct-messages')
        .doc(conversationId)
        .collection('chat')
        .doc(messageId)
        .set({
          ...message,
          createdAt: admin.firestore.Timestamp.fromMillis(message.createdAt),
        });
    }

    console.log(`Migrated conversation: ${conversationId}`);
  }
}

// Run migration
async function migrate() {
  await migrateHouseChats();
  await migrateDirectMessages();
  console.log('Migration complete!');
}

migrate().catch(console.error);
```

### 2. Deployment Strategy

1. **Phase 1: Dual Write** (1 week)
   - Update app to write to BOTH Realtime DB and Firestore
   - Read from Realtime DB
   - Verify data consistency

2. **Phase 2: Migration** (1-2 days)
   - Run migration script to copy historical data
   - Verify all data migrated correctly
   - Keep Realtime DB as backup

3. **Phase 3: Switch Read** (1 week)
   - Update app to read from Firestore
   - Keep dual write active
   - Monitor for issues

4. **Phase 4: Cleanup** (after 2 weeks)
   - Stop writing to Realtime DB
   - Archive Realtime DB data
   - Remove Realtime DB code

### 3. Required Firestore Indexes

```json
// firestore.indexes.json
{
  "indexes": [
    {
      "collectionGroup": "chat",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "sortKey", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "chat",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "read", "order": "ASCENDING" },
        { "fieldPath": "sortKey", "order": "ASCENDING" }
      ]
    }
  ]
}
```

### 4. Verification Checklist

- [ ] All house chats migrated
- [ ] All direct messages migrated
- [ ] Message counts match
- [ ] Timestamps converted correctly
- [ ] Read status preserved
- [ ] sortKey values intact
- [ ] No data loss
- [ ] App reads from Firestore successfully
- [ ] Real-time updates working
- [ ] Pagination working

## Rollback Plan

If issues arise:
1. Switch app back to reading from Realtime DB (instant)
2. Investigate Firestore data issues
3. Re-run migration script if needed
4. Realtime DB data remains intact as backup

## Performance Considerations

- Firestore has 1 write/second/document limit (not an issue for chat)
- Better query performance with indexes
- Better offline caching
- More predictable pricing

## Impact

- **Frontend**: App code updated to use Firestore APIs
- **Backend**: Migration script required
- **Database**: Dual storage during transition
- **Users**: No visible changes, better reliability
