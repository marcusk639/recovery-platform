/**
 * EditUserInfoForm — the avatar is uploaded, not saved as a phone path.
 *
 * The form used to save the picker's file path (file:///…) into the user,
 * guest and admin docs, so no other phone, and not this one after a
 * reinstall, could show it. Now a newly picked photo is uploaded to
 * users/{uid}/avatar first and its download URL saved everywhere; a failed
 * upload saves nothing and says so.
 */
let capturedProps: any = null;
jest.mock('../EditUserInfoFormView', () => (props: any) => {
  capturedProps = props;
  return null;
});

let mockStoredUser: any = { id: 'user-1', avatar: '' };
let mockGuestCopy: any = { id: 'guest-1', houseId: 'house-1', ethnicity: 'Stored' };
const mockUnwrap = jest.fn(() => Promise.resolve({ id: 'user-1' }));
const mockDispatch = jest.fn(() => ({ unwrap: mockUnwrap }));
jest.mock('../../../state/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) =>
    selector({
      user: { user: mockStoredUser },
      guests: { userAsGuest: mockGuestCopy },
      admin: { userAsAdmin: { id: 'admin-1' } },
    }),
}));

const mockUpdateUserThunkCreator = jest.fn((arg: any) => ({ type: 'user/updateUser', arg }));
jest.mock('../../../state/slices/userSlice', () => ({
  updateUser: (arg: any) => mockUpdateUserThunkCreator(arg),
}));

const mockGuestMutateAsync = jest.fn((_args: any) => Promise.resolve({}));
const mockAdminMutateAsync = jest.fn((_args: any) => Promise.resolve({}));
jest.mock('../../../state/queries/guestQueries', () => ({
  useUpdateGuest: () => ({ mutateAsync: mockGuestMutateAsync }),
}));
jest.mock('../../../state/queries/adminQueries', () => ({
  useUpdateAdmin: () => ({ mutateAsync: mockAdminMutateAsync }),
}));
jest.mock('../../../hooks/useSelectedHouse', () => ({
  useSelectedHouse: () => ({ house: null }),
}));

const mockAvatarForSave = jest.fn();
const mockDeleteRemovedAvatar = jest.fn((..._args: unknown[]) => Promise.resolve());
jest.mock('../profileAvatar', () => ({
  avatarForSave: (...args: unknown[]) => mockAvatarForSave(...args),
  deleteRemovedAvatar: (...args: unknown[]) => mockDeleteRemovedAvatar(...args),
  isRemoteImageUri: jest.requireActual('../profileAvatar').isRemoteImageUri,
}));
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

const mockAlert = jest.spyOn(require('react-native').Alert, 'alert');

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import EditUserInfoFormWrapper, {
  AVATAR_UPLOAD_FAILED_MESSAGE,
  AVATAR_UPLOAD_FAILED_TITLE,
  AVATAR_DEMO_MESSAGE,
  AVATAR_DEMO_TITLE,
} from '../EditUserInfoForm';
import { DEMO_ACCOUNT_EMAIL } from '../../../util/user';
import { auth } from '../../../../firebase-setup';
import { setUserAsGuest } from '../../../state/slices/guestsSlice';
import { setUserAsAdmin } from '../../../state/slices/adminSlice';

const PICKED = 'file:///var/mobile/tmp/IMG_0001.jpg';
const URL = 'https://mock-storage/users/uid-1/avatar';

const renderAndPick = (avatar: string | null, contentType?: string | null) => {
  const goBack = jest.fn();
  render(<EditUserInfoFormWrapper navigation={{ goBack } as any} />);
  act(() => {
    capturedProps.setFieldValue('avatar', avatar);
    if (contentType !== undefined) capturedProps.setFieldValue('avatarContentType', contentType);
  });
  act(() => {
    capturedProps.handleSubmit();
  });
  return goBack;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStoredUser = { id: 'user-1', avatar: '' };
  mockGuestCopy = { id: 'guest-1', houseId: 'house-1', ethnicity: 'Stored' };
  (auth as any).currentUser = { uid: 'uid-1' };
  // Like the real one: a picked photo needs an account to upload as.
  mockAvatarForSave.mockImplementation(async (avatar: string, _stored: string, uid: string) => {
    if (avatar !== PICKED) return avatar;
    if (!uid) throw new Error('profileAvatar: no signed-in account to upload as');
    return URL;
  });
});

describe('EditUserInfoForm avatar', () => {
  it('uploads a picked photo as the signed-in account and saves its URL to the user, guest and admin docs', async () => {
    const goBack = renderAndPick(PICKED, 'image/png');

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(mockAvatarForSave).toHaveBeenCalledWith(PICKED, '', 'uid-1', 'image/png');
    const { updates } = mockUpdateUserThunkCreator.mock.calls[0][0];
    expect(updates.avatar).toBe(URL);
    expect(mockGuestMutateAsync.mock.calls[0][0].updatedGuest.avatar).toBe(URL);
    expect(mockAdminMutateAsync.mock.calls[0][0].updates.avatar).toBe(URL);
  });

  it("never saves the picked photo's content type", async () => {
    const goBack = renderAndPick(PICKED, 'image/png');

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    const { updates } = mockUpdateUserThunkCreator.mock.calls[0][0];
    expect('avatarContentType' in updates).toBe(false);
  });

  it('says so, saves nothing and stays on the form when the upload fails', async () => {
    mockAvatarForSave.mockRejectedValueOnce(new Error('storage/unauthorized'));
    const goBack = renderAndPick(PICKED, 'image/jpeg');

    await waitFor(() =>
      expect(mockAlert).toHaveBeenCalledWith(
        AVATAR_UPLOAD_FAILED_TITLE,
        AVATAR_UPLOAD_FAILED_MESSAGE,
      ),
    );
    expect(mockUpdateUserThunkCreator).not.toHaveBeenCalled();
    expect(mockGuestMutateAsync).not.toHaveBeenCalled();
    expect(mockAdminMutateAsync).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('refuses to upload with no signed-in account, and says so', async () => {
    (auth as any).currentUser = null;
    const goBack = renderAndPick(PICKED);

    await waitFor(() =>
      expect(mockAlert).toHaveBeenCalledWith(
        AVATAR_UPLOAD_FAILED_TITLE,
        AVATAR_UPLOAD_FAILED_MESSAGE,
      ),
    );
    expect(mockAvatarForSave).toHaveBeenCalledWith(PICKED, '', '', undefined);
    expect(mockUpdateUserThunkCreator).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('saves the rest of the profile when the avatar did not change', async () => {
    mockStoredUser = { id: 'user-1', avatar: URL };
    render(<EditUserInfoFormWrapper navigation={{ goBack: jest.fn() } as any} />);
    act(() => {
      capturedProps.handleSubmit();
    });

    await waitFor(() => expect(mockUpdateUserThunkCreator).toHaveBeenCalled());
    expect(mockAvatarForSave).toHaveBeenCalledWith(URL, URL, 'uid-1', undefined);
    expect(mockUpdateUserThunkCreator.mock.calls[0][0].updates.avatar).toBe(URL);
  });

  it('saves a removed avatar as removed', async () => {
    mockStoredUser = { id: 'user-1', avatar: URL };
    const goBack = renderAndPick('', null);

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(mockUpdateUserThunkCreator.mock.calls[0][0].updates.avatar).toBe('');
  });

  it("deletes a removed photo's file, only after the profile saved", async () => {
    mockStoredUser = { id: 'user-1', avatar: URL };
    const goBack = renderAndPick('', null);

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(mockDeleteRemovedAvatar).toHaveBeenCalledWith('', URL, 'uid-1');
    expect(mockUpdateUserThunkCreator.mock.invocationCallOrder[0]).toBeLessThan(
      mockDeleteRemovedAvatar.mock.invocationCallOrder[0],
    );
  });

  it('deletes nothing when the save fails', async () => {
    mockStoredUser = { id: 'user-1', avatar: URL };
    mockUnwrap.mockRejectedValueOnce(new Error('network down'));
    renderAndPick('', null);

    await waitFor(() =>
      expect(mockAlert).toHaveBeenCalledWith('Update Failed', expect.any(String)),
    );
    expect(mockDeleteRemovedAvatar).not.toHaveBeenCalled();
    // Logged, not only shown: the alert alone left no trace of why.
    expect(require('../../../util/logging').logException).toHaveBeenCalledWith(
      expect.any(Error),
      'EditUserInfoForm: profile save failed',
    );
  });

  // The Profile tab falls back to these store copies (an admin-set guest photo
  // shows there); left as loaded, a removed photo kept showing from them.
  it("refreshes the store's guest and admin copies with what was saved", async () => {
    mockStoredUser = { id: 'user-1', avatar: URL, sobrietyDate: '2026-01-01' };
    const goBack = renderAndPick('', null);

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    const guestCopy = mockDispatch.mock.calls
      .map(([action]: any[]) => action)
      .find((action: any) => action?.type === setUserAsGuest.type);
    const adminCopy = mockDispatch.mock.calls
      .map(([action]: any[]) => action)
      .find((action: any) => action?.type === setUserAsAdmin.type);
    expect(guestCopy?.payload).toMatchObject({
      id: 'guest-1',
      houseId: 'house-1',
      avatar: '',
      sobrietyDate: '2026-01-01',
    });
    expect(adminCopy?.payload).toMatchObject({ id: 'admin-1', avatar: '' });
    // A field the form left unset keeps the copy's value (Firestore keeps it too).
    expect(guestCopy.payload.ethnicity).toBe('Stored');
  });

  it('leaves the store copies alone when their save fails', async () => {
    mockStoredUser = { id: 'user-1', avatar: URL };
    mockGuestMutateAsync.mockRejectedValueOnce(new Error('network down'));
    renderAndPick('', null);

    await waitFor(() =>
      expect(mockAlert).toHaveBeenCalledWith('Update Failed', expect.any(String)),
    );
    const types = mockDispatch.mock.calls.map(([action]: any[]) => action?.type);
    expect(types).not.toContain(setUserAsGuest.type);
    expect(types).not.toContain(setUserAsAdmin.type);
    // The guest doc still holds the photo's URL, so its file stays.
    expect(mockDeleteRemovedAvatar).not.toHaveBeenCalled();
  });

  // A removal whose guest save failed left the user doc at "" and the guest
  // copy at the URL; the retry must still delete the file.
  it("deletes the removed photo's file on a retry after a partial save", async () => {
    mockStoredUser = { id: 'user-1', avatar: '' };
    mockGuestCopy = { ...mockGuestCopy, avatar: URL };
    const goBack = renderAndPick('', null);

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(mockDeleteRemovedAvatar).toHaveBeenCalledWith('', URL, 'uid-1');
  });

  it('tells the demo account a photo is disabled, and uploads and saves nothing', async () => {
    mockStoredUser = { id: 'user-1', avatar: '', email: DEMO_ACCOUNT_EMAIL };
    const goBack = renderAndPick(PICKED, 'image/jpeg');

    await waitFor(() =>
      expect(mockAlert).toHaveBeenCalledWith(AVATAR_DEMO_TITLE, AVATAR_DEMO_MESSAGE),
    );
    expect(mockAvatarForSave).not.toHaveBeenCalled();
    expect(mockUpdateUserThunkCreator).not.toHaveBeenCalled();
    expect(goBack).not.toHaveBeenCalled();
  });

  it("saves the demo account's profile when the photo did not change", async () => {
    mockStoredUser = { id: 'user-1', avatar: '', email: DEMO_ACCOUNT_EMAIL };
    render(<EditUserInfoFormWrapper navigation={{ goBack: jest.fn() } as any} />);
    act(() => {
      capturedProps.handleSubmit();
    });

    await waitFor(() => expect(mockUpdateUserThunkCreator).toHaveBeenCalled());
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it("uploads a new pick over an older build's stored phone path", async () => {
    const legacy = 'file:///var/mobile/old/IMG_0000.jpg';
    mockStoredUser = { id: 'user-1', avatar: legacy };
    const goBack = renderAndPick(PICKED, 'image/jpeg');

    await waitFor(() => expect(goBack).toHaveBeenCalled());
    expect(mockAvatarForSave).toHaveBeenCalledWith(PICKED, legacy, 'uid-1', 'image/jpeg');
    expect(mockUpdateUserThunkCreator.mock.calls[0][0].updates.avatar).toBe(URL);
  });
});
