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

  beforeEach(() => {
    initializeSubscription = jasmine.createSpy('initializeSubscription');
    deleteAccount = jasmine.createSpy('deleteAccount').and.resolveTo({ deleted: true });
    signOut = jasmine.createSpy('signOut').and.resolveTo(undefined);
    deleteDoc = jasmine
      .createSpy('delete')
      .and.callFake(() => Promise.resolve({ delete: () => Promise.resolve() }));
    currentUser = null;

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
});
