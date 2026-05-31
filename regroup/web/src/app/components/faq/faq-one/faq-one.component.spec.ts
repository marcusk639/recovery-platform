import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { FaqOneComponent } from './faq-one.component';

describe('FaqOneComponent', () => {
  let component: FaqOneComponent;
  let fixture: ComponentFixture<FaqOneComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ FaqOneComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(FaqOneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
