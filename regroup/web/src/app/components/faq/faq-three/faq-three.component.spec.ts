import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { FaqThreeComponent } from './faq-three.component';

describe('FaqThreeComponent', () => {
  let component: FaqThreeComponent;
  let fixture: ComponentFixture<FaqThreeComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ FaqThreeComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(FaqThreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
