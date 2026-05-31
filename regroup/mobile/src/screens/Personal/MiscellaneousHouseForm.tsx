import React, { Fragment } from 'react';
import { View } from 'react-native';
import { normalize } from '../../styles/theme';
import MiscellaneousForm, { MiscellaneousFormProps } from './MiscellaneousForm';
import RatsTextInput from '../../components/rats-text-input/rats-text-input';
import { House } from '../../entities/House';
import { renderField } from '../../util/form';
import { camelCaseToDisplayForm, getPickerItems } from '../../util/display';
import { Field } from 'formik';
import RatsPicker from '../../components/rats-picker/rats-picker';

interface MiscellanousHouseFormProps extends MiscellaneousFormProps {
  house?: House;
  fieldName: 'complaint' | 'issue' | 'description';
  fieldPlaceholder?: string;
}

export const MiscellaneousHouseForm = (props: MiscellanousHouseFormProps) => {
  const { fieldName, fieldPlaceholder } = props;
  const renderView = (field: JSX.Element) => {
    return <View style={{ marginVertical: normalize(5) }}>{field}</View>;
  };
  const fields = (
    <Fragment>
      {fieldName === 'issue' &&
        renderView(
          <Field
            component={RatsPicker}
            name="type"
            label="Type"
            items={getPickerItems(
              { Guest: 'guest', House: 'house', Maintenance: 'maintenance' },
              undefined,
              true,
            )}
          />,
        )}
      {renderView(
        renderField(
          fieldName,
          fieldPlaceholder
            ? fieldPlaceholder
            : `Describe ${
                fieldName === 'complaint' ? 'your' : 'the'
              } ${fieldName}...`,
          RatsTextInput,
          false,
          camelCaseToDisplayForm(fieldName),
          'string',
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          8,
        ),
      )}
    </Fragment>
  );
  return React.createElement(
    MiscellaneousForm({ [fieldName]: '' }, fields, props, { [fieldName]: '' }),
  );
};
