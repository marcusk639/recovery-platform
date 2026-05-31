import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { BreadcrumbBlogThreeColumnComponent } from './breadcrumb-blog-three-column.component';

describe('BreadcrumbBlogThreeColumnComponent', () => {
  let component: BreadcrumbBlogThreeColumnComponent;
  let fixture: ComponentFixture<BreadcrumbBlogThreeColumnComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BreadcrumbBlogThreeColumnComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BreadcrumbBlogThreeColumnComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
