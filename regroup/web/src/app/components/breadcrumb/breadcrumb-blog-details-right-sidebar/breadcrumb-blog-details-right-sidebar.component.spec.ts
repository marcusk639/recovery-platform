import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { BreadcrumbBlogDetailsRightSidebarComponent } from './breadcrumb-blog-details-right-sidebar.component';

describe('BreadcrumbBlogDetailsRightSidebarComponent', () => {
  let component: BreadcrumbBlogDetailsRightSidebarComponent;
  let fixture: ComponentFixture<BreadcrumbBlogDetailsRightSidebarComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BreadcrumbBlogDetailsRightSidebarComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BreadcrumbBlogDetailsRightSidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
