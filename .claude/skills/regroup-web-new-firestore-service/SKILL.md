---
name: regroup-web-new-firestore-service
description: Scaffold a new Angular service extending BaseFirestoreService<T> with its spec file and entity type. Usage: /new-firestore-service EntityName collectionName
---

> **Unit:** `regroup/web/` — all relative paths below resolve from there. From the repo root:
> `cd "${CLAUDE_PROJECT_DIR:-$(pwd)}/regroup/web"` first.
# New Firestore Service

Given `EntityName` and `collectionName` arguments from the user, generate the following:

## 1. Entity file (if it doesn't already exist)

Create `src/app/entities/<EntityName>.ts`:

```typescript
import { BaseEntity } from './BaseEntity';

class <EntityName> extends BaseEntity {
  // TODO: add fields specific to <EntityName>
}

export { <EntityName> };
```

## 2. Service file

Create `src/app/services/<entity-name>.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import BaseFirestoreService from './base-service';
import { <EntityName> } from '../entities/<EntityName>';
import { AngularFirestore } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class <EntityName>Service extends BaseFirestoreService<<EntityName>> {
  constructor(protected firestore: AngularFirestore) {
    super(firestore, '<collectionName>');
  }
}
```

## 3. Spec file

Create `src/app/services/<entity-name>.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { <EntityName>Service } from './<entity-name>.service';

describe('<EntityName>Service', () => {
  let service: <EntityName>Service;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(<EntityName>Service);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
```

## Notes

- `<entity-name>` is the kebab-case version of `<EntityName>` (e.g., `WeeklyReport` → `weekly-report`).
- `BaseFirestoreService` provides: `get(id)`, `getByAttribute(attr, op, val)`, `create(obj)`, `update(id, partial)`, `delete(id)`, `add(obj)`.
- Add domain-specific methods (like `HouseService.getHouses()`) after generation.
- The entity must extend `BaseEntity` from `src/app/entities/BaseEntity.ts`.
