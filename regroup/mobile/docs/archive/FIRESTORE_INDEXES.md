# Firestore Composite Indexes

Source of truth: `firebase/firestore.indexes.json`

## Overview

11 composite indexes deployed across 4 collection groups. All use `COLLECTION` query scope.

---

## `na-meetings`

### Index 1
| Field | Order |
|-------|-------|
| `day` | ASC |
| `gehoash` | ASC |

**Used by:** Meeting search filtered by day, then geo-hash radius.

### Index 2
| Field | Order |
|-------|-------|
| `gehoash` | ASC |
| `day` | ASC |

**Used by:** Meeting search filtered by geo-hash first, then day. Inverse of Index 1 to support both query orderings.

---

## `activities`

### Index 3
| Field | Order |
|-------|-------|
| `guestId` | ASC |
| `timestamp` | DESC |

**Used by:** Fetch all activities for a guest, newest first.

### Index 4
| Field | Order |
|-------|-------|
| `guestId` | ASC |
| `status` | ASC |
| `timestamp` | DESC |

**Used by:** Fetch guest activities filtered by status (e.g. `ACTIVE`), newest first.

### Index 5
| Field | Order |
|-------|-------|
| `guestId` | ASC |
| `type` | ASC |
| `timestamp` | DESC |

**Used by:** Fetch guest activities filtered by type (e.g. `MEETING`, `CHORE`), newest first.

### Index 6
| Field | Order |
|-------|-------|
| `houseId` | ASC |
| `timestamp` | DESC |

**Used by:** Fetch all activities for a house, newest first (house manager view).

### Index 7
| Field | Order |
|-------|-------|
| `houseId` | ASC |
| `status` | ASC |
| `timestamp` | DESC |

**Used by:** Fetch house activities filtered by status, newest first.

### Index 8
| Field | Order |
|-------|-------|
| `houseId` | ASC |
| `type` | ASC |
| `timestamp` | DESC |

**Used by:** Fetch house activities filtered by type, newest first.

### Index 9
| Field | Order |
|-------|-------|
| `guestId` | ASC |
| `type` | ASC |
| `status` | ASC |
| `timestamp` | DESC |

**Used by:** Fetch guest activities filtered by both type AND status (e.g. active meetings today), newest first. Most selective guest query.

### Index 10
| Field | Order |
|-------|-------|
| `houseId` | ASC |
| `type` | ASC |
| `status` | ASC |
| `timestamp` | DESC |

**Used by:** Fetch house activities filtered by both type AND status, newest first. Most selective house query.

---

## `week-summaries`

### Index 11
| Field | Order |
|-------|-------|
| `guestId` | ASC |
| `houseId` | ASC |
| `startDate` | DESC |

**Used by:** Fetch weekly summary reports for a guest at a specific house, most recent first.

---

## `guest-reports`

### Index 12
| Field | Order |
|-------|-------|
| `houseId` | ASC |
| `startDate` | DESC |

**Used by:** Fetch guest reports for a house ordered by start date descending (report history view).

---

## Adding New Indexes

1. Add the index definition to `firebase/firestore.indexes.json`
2. Update this document with the new index and which query it supports
3. Deploy with: `firebase deploy --only firestore:indexes`

> Note: Index deployment can take several minutes. Queries requiring an index will fail with a Firestore error that includes a direct link to create the index in the Firebase console.
