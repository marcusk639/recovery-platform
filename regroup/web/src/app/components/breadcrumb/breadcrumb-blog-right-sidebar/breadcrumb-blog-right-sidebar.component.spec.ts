import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { BreadcrumbBlogRightSidebarComponent } from './breadcrumb-blog-right-sidebar.component';

describe('BreadcrumbBlogRightSidebarComponent', () => {
  let component: BreadcrumbBlogRightSidebarComponent;
  let fixture: ComponentFixture<BreadcrumbBlogRightSidebarComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BreadcrumbBlogRightSidebarComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BreadcrumbBlogRightSidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
