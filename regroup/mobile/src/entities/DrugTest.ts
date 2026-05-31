import * as yup from 'yup';

export type DrugTestResult =
  | 'negative'
  | 'positive'
  | 'inconclusive'
  | 'refused';

export type DrugTestType = 'urine' | 'saliva' | 'breathalyzer' | 'hair';

export interface DrugTest {
  id: string;
  guestId: string;
  houseId: string;
  testDate: string; // ISO date
  result: DrugTestResult;
  testType: DrugTestType;
  substancesDetected: string[]; // empty if negative
  observedBy: string; // userId of observer
  observerName: string;
  notes: string;
  scheduledDate?: string; // ISO date if from random schedule
  isRandom: boolean;
  escalationTriggered: boolean;
  createdAt: string;
}

export const drugTestSchema = yup.object().shape({
  guestId: yup.string().required('Guest is required'),
  houseId: yup.string().required('House is required'),
  testDate: yup.string().required('Test date is required'),
  result: yup
    .string()
    .oneOf(['negative', 'positive', 'inconclusive', 'refused'])
    .required('Result is required'),
  testType: yup
    .string()
    .oneOf(['urine', 'saliva', 'breathalyzer', 'hair'])
    .required('Test type is required'),
  substancesDetected: yup.array().of(yup.string()).default([]),
  observedBy: yup.string().required('Observer is required'),
  observerName: yup.string().required('Observer name is required'),
  notes: yup.string().default(''),
  isRandom: yup.boolean().default(false),
});
