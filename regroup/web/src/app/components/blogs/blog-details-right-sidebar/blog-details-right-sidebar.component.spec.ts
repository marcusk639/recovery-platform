import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { BlogDetailsRightSidebarComponent } from './blog-details-right-sidebar.component';

describe('BlogDetailsRightSidebarComponent', () => {
  let component: BlogDetailsRightSidebarComponent;
  let fixture: ComponentFixture<BlogDetailsRightSidebarComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BlogDetailsRightSidebarComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BlogDetailsRightSidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
