import { Component, OnInit, Inject, PLATFORM_ID } from '@angular/core';
import { BaseComponent } from '../../base.component';
import { isPlatformBrowser } from '@angular/common';

declare var $: any;

@Component({
  selector: 'app-screenshot-one',
  templateUrl: './screenshot-one.component.html',
  styleUrls: ['./screenshot-one.component.css']
})
export class ScreenshotOneComponent extends BaseComponent implements OnInit {

  constructor(@Inject(PLATFORM_ID) protected platformId: Object) {
    super();
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      //@ts-ignore
      $('.app-screenshots').slick({
        dots: true,
        arrows: false,
        speed: 2000,
        slidesToShow: 4,
        slidesToScroll: 1,
        autoplay: true,
        autoplaySpeed: 3000,
        pauseOnHover: false,
        pauseOnFocus: false,
        responsive: [
          {
            breakpoint: 1024,
            settings: {
              slidesToShow: 3,
              slidesToScroll: 1
            }
          },
          {
            breakpoint: 600,
            settings: {
              slidesToShow: 2,
              slidesToScroll: 2,
              dots: false
            }
          },
          {
            breakpoint: 480,
            settings: {
              slidesToShow: 1,
              slidesToScroll: 1,
              dots: false
            }
          }
        ]
      });
    }

  }

}
