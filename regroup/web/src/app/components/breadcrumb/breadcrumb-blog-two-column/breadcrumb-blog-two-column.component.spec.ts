import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { BreadcrumbBlogTwoColumnComponent } from './breadcrumb-blog-two-column.component';

describe('BreadcrumbBlogTwoColumnComponent', () => {
  let component: BreadcrumbBlogTwoColumnComponent;
  let fixture: ComponentFixture<BreadcrumbBlogTwoColumnComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BreadcrumbBlogTwoColumnComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BreadcrumbBlogTwoColumnComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
