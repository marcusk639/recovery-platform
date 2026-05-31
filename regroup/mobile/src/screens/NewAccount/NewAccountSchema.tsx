import * as yup from 'yup';
import SchemaConstants from '../../entities/SchemaConstants';
import { parseISO, startOfDay, isAfter } from 'date-fns';

export const newAccountSchema = yup.object().shape({
  firstName: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(1, SchemaConstants.stringMin(0))
    .max(50, SchemaConstants.stringMax(50)),
  lastName: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(1, SchemaConstants.stringMin(0))
    .max(50, SchemaConstants.stringMax(50)),
  middleInitial: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(1, SchemaConstants.stringMin(0))
    .max(1, SchemaConstants.stringMax(1)),
  phoneNumber: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(10, SchemaConstants.stringMin(10))
    .max(14, SchemaConstants.stringMax(15)),
  gender: yup.string().required().oneOf(['male', 'female', 'non-binary']),
  // ethnicity: yup
  //   .string()
  //   .required(SchemaConstants.REQUIRED)
  //   .min(1, SchemaConstants.stringMin(0))
  //   .max(20, SchemaConstants.stringMax(20)),
  maritalStatus: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(0, SchemaConstants.stringMin(0))
    .max(20, SchemaConstants.stringMax(20)),
  housingStatus: yup
    .string()
    .required(SchemaConstants.REQUIRED)
    .min(0, SchemaConstants.stringMin(0))
    .max(20, SchemaConstants.stringMax(20)),
  dateOfBirth: yup
    .string()
    .test(
      'Maximum date',
      'error.no.future.date',
      value =>
        !value || !isAfter(startOfDay(parseISO(value)), startOfDay(new Date())),
    )
    .required(SchemaConstants.REQUIRED),
});
