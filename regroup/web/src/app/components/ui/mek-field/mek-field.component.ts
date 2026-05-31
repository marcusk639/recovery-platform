import { Component, OnInit, Input, forwardRef } from '@angular/core';
import { FormGroup, ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { formErrors } from '../../../util/error';

@Component({
  selector: 'mek-field',
  templateUrl: './mek-field.component.html',
  styleUrls: ['./mek-field.component.css'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      multi: true,
      useExisting: forwardRef(() => MekFieldComponent)
    }
  ]
})
export class MekFieldComponent implements OnInit, ControlValueAccessor {
  @Input() type?: string;
  @Input() required?: boolean = false;
  @Input() name: string;
  @Input() placeholder?: string = '';
  @Input() iconStyle?: string;
  @Input() formControlName: string;
  @Input() formGroup: FormGroup;
  @Input() customError?: string;
  error: any;

  constructor() { }

  ngOnInit(): void {
    this.formGroup.get(this.formControlName).valueChanges.subscribe(values => {
      this.error = this.getError();
    })
    this.formGroup.get(this.formControlName).statusChanges.subscribe(status => {
      this.error = this.getError();
    })
  }

  get formControl() {
    return this.formGroup.get(this.formControlName);
  }

  get showErrors() {
    return this.customError || this.formControl && this.formControl.invalid && (this.formControl.dirty || this.formControl.touched);
  }

  getError() {
    const errors = this.formControl.errors;
    if (errors) {
      const keys = Object.keys(errors);
      const firstKey = keys && keys.length && keys[0];
      if (errors[firstKey] && typeof errors[firstKey] === 'string') {
        return errors[firstKey];
      }
      return formErrors[firstKey];
    }
  }

  writeValue() { }

  registerOnChange() { }

  registerOnTouched() { }
}
