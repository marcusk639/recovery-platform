import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { BreadcrumbBlogDetailsLeftSidebarComponent } from './breadcrumb-blog-details-left-sidebar.component';

describe('BreadcrumbBlogDetailsLeftSidebarComponent', () => {
  let component: BreadcrumbBlogDetailsLeftSidebarComponent;
  let fixture: ComponentFixture<BreadcrumbBlogDetailsLeftSidebarComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BreadcrumbBlogDetailsLeftSidebarComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BreadcrumbBlogDetailsLeftSidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
