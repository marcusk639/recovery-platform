import React from "react";
import { Field } from "formik";
import { FilterFormProps } from "../../forms/FilterForm";
import FilterBuilder, {
  FilterBuilderConfig,
} from "../../components/filters/FilterBuilder";
import RatsTextInput from "../../components/rats-text-input/rats-text-input";
import { HouseSearchFilter } from "../../entities/HouseSearch";

interface Props extends FilterFormProps {
  filters: HouseSearchFilter;
  currentLocation: boolean;
  clearCurrentLocation: () => void;
}

// "Any" maps to '' (not the literal string 'any') to match the
// HouseSearchFilter.gender "no filter" sentinel (src/entities/HouseSearch.tsx)
// and searchForHouses's falsy check (src/services/house.tsx) — a truthy
// 'any' would filter for house.gender === 'any', which no house ever has.
export const genderPickerItems = {
  Male: "male",
  Female: "female",
  "Non-binary": "non-binary",
  Any: "",
};

export const HouseSearchFilterForm = (props: Props) => {
  let googleRef: any;

  const onReset = () => {
    props.clearCurrentLocation();
    if (googleRef) {
      googleRef.setAddressText("");
    }
  };

  const config: FilterBuilderConfig<HouseSearchFilter> = {
    fields: [
      {
        name: "gender",
        label: "Gender",
        type: "picker",
        items: genderPickerItems,
        itemsConfig: { includeAll: true },
      },
      {
        name: "location",
        label: "Location",
        type: "custom",
        customRender: () => (
          <Field
            address={true}
            styleType="secondary"
            showCurrentLocation={props.currentLocation}
            component={RatsTextInput}
            placeholder="Location"
            name="location"
            label="Location"
            setRef={(instance: any) => (googleRef = instance)}
            keyboardType="default"
            pathToAddress="location."
          />
        ),
      },
    ],
    defaultValues: new HouseSearchFilter(),
    filterValues: props.filters,
    onReset,
  };

  return <FilterBuilder config={config} {...props} />;
};
