import * as yup from 'yup';
import SchemaConstants from './SchemaConstants';
import { BaseEntity } from './BaseEntity';

class Organization extends BaseEntity {
  name: string = '';
  owners: string[] = [];
  associates?: string[] = [];
  houseIds?: string[] = [];
  numberOfHouses: number | string = 0;
}

export const orgSchema = yup.object().shape({
  name: yup.string().required(SchemaConstants.REQUIRED),
  // numberOfHouses: yup
  //   .number()
  //   .typeError(SchemaConstants.NUMBER)
  //   .required(SchemaConstants.REQUIRED)
  //   .integer(SchemaConstants.INTEGER)
  //   .min(1, SchemaConstants.numberMin(1))
});

export default Organization;
