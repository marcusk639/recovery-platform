import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { PricingThreeComponent } from './pricing-three.component';

describe('PricingThreeComponent', () => {
  let component: PricingThreeComponent;
  let fixture: ComponentFixture<PricingThreeComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PricingThreeComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PricingThreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
