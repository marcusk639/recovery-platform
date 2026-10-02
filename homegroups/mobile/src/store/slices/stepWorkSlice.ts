// mobile/src/store/slices/stepWorkSlice.ts
import {createSlice, createAsyncThunk, createSelector} from '@reduxjs/toolkit';
import {addUserScopeReset} from '../userScope';
import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {RootState} from '../types';
import {
  StepProgressDocument,
  StepNoteDocument,
  CompletedStep,
} from '../../types/schema';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface StepWorkState {
  progress: StepProgressDocument | null;
  notes: Record<number, StepNoteDocument>;
  loading: boolean;
  error: string | null;
  /** Maintained by addUserScopeReset; see store/userScope.ts. */
  loadedForUserId: string | null;
}

const initialState: StepWorkState = {
  progress: null,
  notes: {},
  loading: false,
  error: null,
  loadedForUserId: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentUserId(): string {
  const user = auth().currentUser;
  if (!user) {
    throw new Error('Not authenticated');
  }
  return user.uid;
}

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

/** Load (or create) the step progress singleton document. */
export const loadStepProgress = createAsyncThunk(
  'stepWork/loadStepProgress',
  async (userId: string | undefined, {rejectWithValue}) => {
    try {
      const uid = userId ?? currentUserId();
      const snap = await firestore()
        .collection('users')
        .doc(uid)
        .collection('stepProgress')
        .doc('current')
        .get();

      if (!snap.exists) {
        return null;
      }

      const data = snap.data()!;
      return {
        currentStep: data.currentStep ?? 1,
        startedAt: data.startedAt,
        completedSteps: data.completedSteps ?? [],
        sponsorId: data.sponsorId,
        allowSponsorAccess: data.allowSponsorAccess ?? false,
      } as StepProgressDocument;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

/** Update the current step number (move forward or backward). */
export const updateCurrentStep = createAsyncThunk(
  'stepWork/updateCurrentStep',
  async (step: number, {rejectWithValue}) => {
    try {
      const uid = currentUserId();
      const ref = firestore()
        .collection('users')
        .doc(uid)
        .collection('stepProgress')
        .doc('current');

      const snap = await ref.get();
      if (!snap.exists) {
        // Create the document if it doesn't exist yet
        const now = firestore.Timestamp.now();
        await ref.set({
          currentStep: step,
          startedAt: now,
          completedSteps: [],
          allowSponsorAccess: false,
        });
      } else {
        await ref.set({currentStep: step}, {merge: true});
      }
      return step;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

/** Mark the current step as complete and advance to the next step. */
export const completeStep = createAsyncThunk(
  'stepWork/completeStep',
  async (
    {
      step,
      startedAt,
    }: {step: number; startedAt: FirebaseFirestoreTypes.Timestamp | null},
    {rejectWithValue},
  ) => {
    try {
      const uid = currentUserId();
      const ref = firestore()
        .collection('users')
        .doc(uid)
        .collection('stepProgress')
        .doc('current');

      const now = firestore.Timestamp.now();
      const nowDate = now.toDate();
      const startDate = startedAt ? startedAt.toDate() : nowDate;
      const durationDays = Math.max(
        0,
        Math.floor(
          (nowDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );

      const completedStep: CompletedStep = {
        step,
        completedAt: now,
        durationDays,
      };

      const nextStep = Math.min(step + 1, 12);

      await ref.set(
        {
          currentStep: nextStep,
          completedSteps: firestore.FieldValue.arrayUnion(completedStep),
          startedAt: now, // reset startedAt for the new step
        },
        {merge: true},
      );

      return {completedStep, nextStep};
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

/** Save (upsert) a step note. */
export const saveStepNote = createAsyncThunk(
  'stepWork/saveStepNote',
  async (
    {
      step,
      content,
      isPrivate,
    }: {step: number; content: string; isPrivate: boolean},
    {rejectWithValue},
  ) => {
    try {
      const uid = currentUserId();
      const now = firestore.Timestamp.now();
      const ref = firestore()
        .collection('users')
        .doc(uid)
        .collection('stepNotes')
        .doc(String(step));

      const note: Omit<StepNoteDocument, 'step'> & {step: number} = {
        step,
        content,
        isPrivate,
        updatedAt: now,
      };

      await ref.set(note, {merge: true});
      return note as StepNoteDocument;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

/** Load all step notes for a user (own or sponsor-viewed). */
export const loadStepNotes = createAsyncThunk(
  'stepWork/loadStepNotes',
  async (userId: string | undefined, {rejectWithValue}) => {
    try {
      const uid = userId ?? currentUserId();
      const snap = await firestore()
        .collection('users')
        .doc(uid)
        .collection('stepNotes')
        .get();

      const notes: Record<number, StepNoteDocument> = {};
      snap.docs.forEach(doc => {
        const data = doc.data();
        notes[data.step] = {
          step: data.step,
          content: data.content ?? '',
          updatedAt: data.updatedAt,
          isPrivate: data.isPrivate ?? true,
        };
      });
      return notes;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  },
);

// ---------------------------------------------------------------------------
// Slice
// ---------------------------------------------------------------------------

const stepWorkSlice = createSlice({
  name: 'stepWork',
  initialState,
  reducers: {
    clearStepWorkState: () => initialState,
  },
  extraReducers: builder => {
    builder
      // loadStepProgress
      .addCase(loadStepProgress.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadStepProgress.fulfilled, (state, action) => {
        state.loading = false;
        state.progress = action.payload;
      })
      .addCase(loadStepProgress.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // updateCurrentStep
      .addCase(updateCurrentStep.fulfilled, (state, action) => {
        if (state.progress) {
          state.progress.currentStep = action.payload;
        } else {
          state.progress = {
            currentStep: action.payload,
            startedAt: null as any,
            completedSteps: [],
            allowSponsorAccess: false,
          };
        }
      })
      .addCase(updateCurrentStep.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // completeStep
      .addCase(completeStep.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(completeStep.fulfilled, (state, action) => {
        state.loading = false;
        if (state.progress) {
          const {completedStep, nextStep} = action.payload;
          state.progress.completedSteps = [
            ...state.progress.completedSteps,
            completedStep,
          ];
          state.progress.currentStep = nextStep;
        }
      })
      .addCase(completeStep.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // saveStepNote
      .addCase(saveStepNote.fulfilled, (state, action) => {
        const note = action.payload;
        state.notes[note.step] = note;
      })
      .addCase(saveStepNote.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // loadStepNotes
      .addCase(loadStepNotes.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loadStepNotes.fulfilled, (state, action) => {
        state.loading = false;
        state.notes = action.payload;
      })
      .addCase(loadStepNotes.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });

    // Must come last: this registers a matcher, and RTK rejects any
    // addCase that follows one. Clears the slice when the signed-in user
    // changes — see store/userScope.ts.
    addUserScopeReset(builder, initialState);
  },
});

export const {clearStepWorkState} = stepWorkSlice.actions;
export default stepWorkSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectCurrentStep = (state: RootState): number =>
  state.stepWork.progress?.currentStep ?? 1;

export const selectCompletedSteps = (state: RootState): CompletedStep[] =>
  state.stepWork.progress?.completedSteps ?? [];

export const selectStepProgress = (state: RootState) => state.stepWork.progress;

export const selectStepWorkLoading = (state: RootState) =>
  state.stepWork.loading;

export const selectStepWorkError = (state: RootState) => state.stepWork.error;

/** Returns the note for a given step number (or undefined). */
export const selectStepNote = (step: number) => (state: RootState) =>
  state.stepWork.notes[step];

export const selectAllStepNotes = (state: RootState) => state.stepWork.notes;
