import { firestore } from '../../firebase-setup';
import * as crud from './crud';
import Organization from '../entities/Organization';

const orgCollection = firestore.collection('organizations');

/**
 * Create a new organization
 */
export async function createOrganization(
  orgData: Partial<Organization>,
): Promise<Organization> {
  const organization = {
    ...orgData,
    id: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Organization;

  return crud.create<Organization>(orgCollection, organization);
}

/**
 * Get organization by ID
 */
export async function getOrganization(orgId: string): Promise<Organization> {
  return crud.get<Organization>(orgCollection, orgId);
}

/**
 * Update organization
 */
export async function updateOrganization(
  orgId: string,
  updates: Partial<Organization>,
): Promise<void> {
  return crud.update<Organization>(orgCollection, { id: orgId, ...updates });
}

/**
 * Delete organization
 */
export async function deleteOrganization(orgId: string): Promise<void> {
  const org = await getOrganization(orgId);
  return crud.deleteObject<Organization>(orgCollection, org);
}

/**
 * Get organizations for a user
 */
export async function getUserOrganizations(
  userId: string,
): Promise<Organization[]> {
  return crud.getByAttribute<Organization>(
    orgCollection,
    'ownerId',
    '==',
    userId,
  );
}
