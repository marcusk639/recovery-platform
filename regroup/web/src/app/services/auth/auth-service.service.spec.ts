import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { AngularFirestore } from '@angular/fire/firestore';
import { AngularFireAuth } from '@angular/fire/auth';
import { CloudFunctionService } from '../functions/cloud-function.service';
import { AuthService } from './auth-service.service';
import { User } from 'src/app/entities/User';

describe('AuthServiceService', () => {
  let service: AuthService;
  let initializeSubscription: jasmine.Spy;
  let deleteAccount: jasmine.Spy;
  let signOut: jasmine.Spy;
  let deleteDoc: jasmine.Spy;
  let currentUserDelete: jasmine.Spy;
  let currentUser: { uid: string; delete: jasmine.Spy } | null;
  // What onAuthStateChanged reports first (autoLogin / signedInAccount).
  let authState: { uid: string; email: string; isAnonymous: boolean } | null;

  beforeEach(() => {
    initializeSubscription = jasmine.createSpy('initializeSubscription');
    deleteAccount = jasmine.createSpy('deleteAccount').and.resolveTo({ deleted: true });
    signOut = jasmine.createSpy('signOut').and.resolveTo(undefined);
    deleteDoc = jasmine
      .createSpy('delete')
      .and.callFake(() => Promise.resolve({ delete: () => Promise.resolve() }));
    currentUser = null;
    authState = null;

    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        {
          provide: AngularFirestore,
          useValue: {
            collection: () => ({
              doc: () => ({
                get: deleteDoc,
                delete: () => Promise.resolve(),
                valueChanges: () => ({ subscribe: () => {} }),
              }),
              valueChanges: () => ({ subscribe: () => {} }),
              snapshotChanges: () => ({ pipe: () => ({ subscribe: () => {} }) }),
            }),
          },
        },
        {
          provide: AngularFireAuth,
          useValue: {
            get currentUser() {
              return Promise.resolve(currentUser);
            },
            signOut,
            // Async like Firebase: autoLogin reads its unsubscribe inside the callback.
            onAuthStateChanged: (cb: (u: unknown) => void) => {
              setTimeout(() => cb(authState));
              return () => undefined;
            },
          },
        },
        {
          provide: CloudFunctionService,
          useValue: { initializeSubscription, deleteAccount },
        },
      ],
    });
    service = TestBed.inject(AuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('cleans up the orphaned Auth user and Firestore doc when subscription init fails, then rethrows', async () => {
    const user = new User();
    user.email = 'retry-me@example.com';
    user.password = 'Sup3rSecret!';

    const createdUser = { ...user, id: 'uid-123' } as User;
    spyOn(service as any, 'createUser').and.resolveTo(createdUser);
    const deleteSpy = spyOn(service, 'delete').and.resolveTo(undefined);
    currentUserDelete = jasmine.createSpy('delete').and.resolveTo(undefined);
    currentUser = { uid: 'uid-123', delete: currentUserDelete };

    initializeSubscription.and.rejectWith(new Error('Your card was declined.'));

    await expectAsync(
      service.subscribeOperator(user, 'pm_123', 'traditional', 'starter', 'month'),
    ).toBeRejectedWithError('Your card was declined.');

    // The server removes both, cancelling any subscription it recorded.
    expect(deleteAccount).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(currentUserDelete).not.toHaveBeenCalled();
  });

  it('keeps the account and signs out when the server cleanup fails', async () => {
    const user = new User();
    user.email = 'timed-out@example.com';
    const createdUser = { ...user, id: 'uid-789' } as User;
    spyOn(service as any, 'createUser').and.resolveTo(createdUser);
    const deleteSpy = spyOn(service, 'delete').and.resolveTo(undefined);
    currentUserDelete = jasmine.createSpy('delete').and.resolveTo(undefined);
    currentUser = { uid: 'uid-789', delete: currentUserDelete };
    // A transient Stripe failure while cancelling: the subscription may be live.
    deleteAccount.and.rejectWith({ code: 'functions/internal', message: 'Try again.' });
    initializeSubscription.and.rejectWith(new Error('deadline-exceeded'));

    await expectAsync(
      service.subscribeOperator(user, 'pm_123', 'traditional', 'starter', 'month'),
    ).toBeRejectedWithError('deadline-exceeded');

    expect(signOut).toHaveBeenCalled();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(currentUserDelete).not.toHaveBeenCalled();
  });

  it('keeps the account when the server cannot confirm the subscription is cancelled', async () => {
    const user = new User();
    user.email = 'unverified@example.com';
    const createdUser = { ...user, id: 'uid-321' } as User;
    spyOn(service as any, 'createUser').and.resolveTo(createdUser);
    const deleteSpy = spyOn(service, 'delete').and.resolveTo(undefined);
    currentUserDelete = jasmine.createSpy('delete').and.resolveTo(undefined);
    currentUser = { uid: 'uid-321', delete: currentUserDelete };
    deleteAccount.and.rejectWith({
      code: 'functions/failed-precondition',
      message: 'has not been cancelled',
    });
    initializeSubscription.and.rejectWith(new Error('internal'));

    await expectAsync(
      service.subscribeOperator(user, 'pm_123', 'traditional', 'starter', 'month'),
    ).toBeRejectedWithError('internal');

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(currentUserDelete).not.toHaveBeenCalled();
  });

  it('does not attempt cleanup when subscription init succeeds', async () => {
    const user = new User();
    user.email = 'happy-path@example.com';
    const createdUser = { ...user, id: 'uid-456' } as User;
    spyOn(service as any, 'createUser').and.resolveTo(createdUser);
    const deleteSpy = spyOn(service, 'delete').and.resolveTo(undefined);
    initializeSubscription.and.resolveTo({ status: 'trialing' });

    const result = await service.subscribeOperator(
      user,
      'pm_123',
      'traditional',
      'starter',
      'month',
    );

    expect(result).toEqual(createdUser);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('does not attempt cleanup when Auth user creation itself fails', async () => {
    const user = new User();
    user.email = 'never-created@example.com';
    spyOn(service as any, 'createUser').and.rejectWith(new Error('Email already in use.'));
    const deleteSpy = spyOn(service, 'delete').and.resolveTo(undefined);

    await expectAsync(
      service.subscribeOperator(user, 'pm_123', 'traditional', 'starter', 'month'),
    ).toBeRejectedWithError('Email already in use.');

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(initializeSubscription).not.toHaveBeenCalled();
  });

  describe('signed-in checkout for an existing account (M9)', () => {
    it('finds no account when signed out, or signed in anonymously', async () => {
      expect(await service.signedInAccount()).toBeNull();
      authState = { uid: 'anon-1', email: null, isAnonymous: true };
      expect(await service.signedInAccount()).toBeNull();
    });

    it('returns the stored record, with the id and email from Auth', async () => {
      authState = { uid: 'uid-9', email: 'op@example.com', isAnonymous: false };
      const stored = { ...new User(), firstName: 'Ann', email: '' } as User;
      spyOn(service, 'getUser').and.resolveTo(stored);
      const account = await service.signedInAccount();
      expect(account).toEqual(
        jasmine.objectContaining({ id: 'uid-9', uid: 'uid-9', email: 'op@example.com', firstName: 'Ann' }),
      );
    });

    it('subscribes the existing account without creating one', async () => {
      const createUser = spyOn(service as any, 'createUser');
      const user = { ...new User(), id: 'uid-9', email: 'op@example.com' } as User;
      initializeSubscription.and.resolveTo({ id: 'uid-9', claimGranted: true });

      await service.subscribeExistingOperator(user, 'pm_1', 'traditional', 'starter', 'year');

      expect(initializeSubscription).toHaveBeenCalledWith(user, 'pm_1', 'traditional', 'starter', 'year');
      expect(createUser).not.toHaveBeenCalled();
    });

    it('never deletes or signs out the existing account when checkout fails', async () => {
      const user = { ...new User(), id: 'uid-9', email: 'op@example.com' } as User;
      const refusal = { code: 'functions/failed-precondition', details: { reason: 'plan-exists' } };
      initializeSubscription.and.rejectWith(refusal);

      await expectAsync(
        service.subscribeExistingOperator(user, 'pm_1', 'traditional', 'starter'),
      ).toBeRejectedWith(refusal);

      expect(deleteAccount).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
    });
  });
});
