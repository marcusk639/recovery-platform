import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { BrandComponent } from './brand.component';

describe('BrandComponent', () => {
  let component: BrandComponent;
  let fixture: ComponentFixture<BrandComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BrandComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BrandComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
