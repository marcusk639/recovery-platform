import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { PricingFourComponent } from './pricing-four.component';

describe('PricingFourComponent', () => {
  let component: PricingFourComponent;
  let fixture: ComponentFixture<PricingFourComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PricingFourComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PricingFourComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
