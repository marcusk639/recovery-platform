import { async, ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';

import { BlogDetailsLeftSidebarComponent } from './blog-details-left-sidebar.component';

describe('BlogDetailsLeftSidebarComponent', () => {
  let component: BlogDetailsLeftSidebarComponent;
  let fixture: ComponentFixture<BlogDetailsLeftSidebarComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ BlogDetailsLeftSidebarComponent ],
      schemas: [NO_ERRORS_SCHEMA],
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(BlogDetailsLeftSidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
