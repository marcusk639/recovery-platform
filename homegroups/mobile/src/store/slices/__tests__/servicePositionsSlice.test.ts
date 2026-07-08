/**
 * Tests for servicePositionsSlice — regression coverage for the
 * rejectWithValue migration (Task 4): fetchServicePositionsForGroup,
 * createServicePosition, and updateServicePosition previously
 * `throw new Error(...)`, leaking RTK's default `action.error.message` into
 * `state.error`. They must now surface a sanitized `action.payload` string,
 * matching deleteServicePosition (already migrated) and the rest of the
 * codebase's slices.
 */

import {configureStore} from '@reduxjs/toolkit';
import servicePositionsReducer, {
  fetchServicePositionsForGroup,
  createServicePosition,
  updateServicePosition,
  deleteServicePosition,
} from '../servicePositionsSlice';

jest.mock('../../../models/ServicePositionModel', () => ({
  ServicePositionModel: {
    getPositionsForGroup: jest.fn(),
    createPosition: jest.fn(),
    updatePosition: jest.fn(),
    deletePosition: jest.fn(),
  },
}));

function buildStore() {
  return configureStore({
    reducer: {servicePositions: servicePositionsReducer},
  });
}

describe('servicePositionsSlice thunks — rejectWithValue error contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetchServicePositionsForGroup: rejects with a payload string (not error.message) when the model call throws', async () => {
    const {
      ServicePositionModel,
    } = require('../../../models/ServicePositionModel');
    ServicePositionModel.getPositionsForGroup.mockRejectedValueOnce(
      new Error('Firestore permission denied'),
    );

    const store = buildStore();
    const result = await store.dispatch(
      fetchServicePositionsForGroup('group-1') as any,
    );

    expect(result.type).toBe('servicePositions/fetchForGroup/rejected');
    expect(result.payload).toBe('Firestore permission denied');
    expect(result.error.message).not.toBe('Firestore permission denied');

    const state = store.getState().servicePositions;
    expect(state.error).toBe('Firestore permission denied');
    expect(state.status).toBe('failed');
  });

  it('createServicePosition: rejects with a payload string when the model call throws', async () => {
    const {
      ServicePositionModel,
    } = require('../../../models/ServicePositionModel');
    ServicePositionModel.createPosition.mockRejectedValueOnce(
      new Error('Permission denied: Only admins can create positions.'),
    );

    const store = buildStore();
    const result = await store.dispatch(
      createServicePosition({
        groupId: 'group-1',
        name: 'Treasurer',
      }) as any,
    );

    expect(result.type).toBe('servicePositions/create/rejected');
    expect(result.payload).toBe(
      'Permission denied: Only admins can create positions.',
    );

    const state = store.getState().servicePositions;
    expect(state.error).toBe(
      'Permission denied: Only admins can create positions.',
    );
    expect(state.status).toBe('failed');
  });

  it('updateServicePosition: rejects with a payload string when the model call throws', async () => {
    const {
      ServicePositionModel,
    } = require('../../../models/ServicePositionModel');
    ServicePositionModel.updatePosition.mockRejectedValueOnce(
      new Error('Permission denied: Only admins can update positions.'),
    );

    const store = buildStore();
    const result = await store.dispatch(
      updateServicePosition({
        groupId: 'group-1',
        positionId: 'position-1',
        updateData: {name: 'Secretary'},
      }) as any,
    );

    expect(result.type).toBe('servicePositions/update/rejected');
    expect(result.payload).toBe(
      'Permission denied: Only admins can update positions.',
    );

    const state = store.getState().servicePositions;
    expect(state.error).toBe(
      'Permission denied: Only admins can update positions.',
    );
    expect(state.status).toBe('failed');
  });

  it('deleteServicePosition (already-migrated reference thunk): rejects with a payload string when the model call throws', async () => {
    const {
      ServicePositionModel,
    } = require('../../../models/ServicePositionModel');
    ServicePositionModel.deletePosition.mockRejectedValueOnce(
      new Error('Permission denied: Only admins can delete positions.'),
    );

    const store = buildStore();
    const result = await store.dispatch(
      deleteServicePosition({
        groupId: 'group-1',
        positionId: 'position-1',
      }) as any,
    );

    expect(result.type).toBe('servicePositions/delete/rejected');
    expect(result.payload).toBe(
      'Permission denied: Only admins can delete positions.',
    );

    const state = store.getState().servicePositions;
    expect(state.error).toBe(
      'Permission denied: Only admins can delete positions.',
    );
    expect(state.status).toBe('failed');
  });

  it('createServicePosition: falls back to a generic message when a non-Error value is thrown', async () => {
    const {
      ServicePositionModel,
    } = require('../../../models/ServicePositionModel');
    ServicePositionModel.createPosition.mockRejectedValueOnce(
      'a string rejection',
    );

    const store = buildStore();
    const result = await store.dispatch(
      createServicePosition({
        groupId: 'group-1',
        name: 'Treasurer',
      }) as any,
    );

    expect(result.payload).toBe('Failed to create service position');
    const state = store.getState().servicePositions;
    expect(state.error).toBe('Failed to create service position');
  });
});
