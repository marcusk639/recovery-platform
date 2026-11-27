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
const mockUnwrap = jest.fn(() => Promise.resolve({ id: 'user-1' }));
const mockDispatch = jest.fn(() => ({ unwrap: mockUnwrap }));
jest.mock('../../../state/store', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: (selector: any) =>
    selector({
      user: { user: mockStoredUser },
      guests: { userAsGuest: { id: 'guest-1', houseId: 'house-1' } },
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
jest.mock('../profileAvatar', () => ({
  avatarForSave: (...args: unknown[]) => mockAvatarForSave(...args),
}));
jest.mock('../../../util/logging', () => ({ logException: jest.fn() }));

const mockAlert = jest.spyOn(require('react-native').Alert, 'alert');

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import EditUserInfoFormWrapper, {
  AVATAR_UPLOAD_FAILED_MESSAGE,
  AVATAR_UPLOAD_FAILED_TITLE,
} from '../EditUserInfoForm';
import { auth } from '../../../../firebase-setup';

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
  (auth as any).currentUser = { uid: 'uid-1' };
  mockAvatarForSave.mockImplementation(async (avatar: string) =>
    avatar === PICKED ? URL : avatar,
  );
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
    expect(mockAvatarForSave).not.toHaveBeenCalled();
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
});
