import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { PricingOneComponent } from './pricing-one.component';

describe('PricingOneComponent', () => {
  let component: PricingOneComponent;
  let fixture: ComponentFixture<PricingOneComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PricingOneComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PricingOneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
