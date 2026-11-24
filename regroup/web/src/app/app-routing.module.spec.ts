import { routes } from './app-routing.module';

// Launch item M6: the purchased site template's demo pages (lorem ipsum, sample
// reviews, a placeholder FAQ) must not be served as Regroup pages.
const TEMPLATE_DEMO_PATHS = [
  'theme-three',
  'theme-four',
  'theme-five',
  'theme-six',
  'blog-two-column',
  'blog-three-column',
  'blog-left-sidebar',
  'blog-right-sidebar',
  'blog-details-left-sidebar',
  'blog-details-right-sidebar',
  'reviews',
  'faq',
];

describe('app routes', () => {
  it('sends each template demo page to the home page', () => {
    for (const path of TEMPLATE_DEMO_PATHS) {
      const route = routes.find((r) => r.path === path);
      expect(route).withContext(path).toBeDefined();
      expect(route?.component).withContext(path).toBeUndefined();
      expect(route?.redirectTo).withContext(path).toBe('');
      expect(route?.pathMatch).withContext(path).toBe('full');
    }
  });

  it('keeps the catch-all last', () => {
    expect(routes[routes.length - 1].path).toBe('**');
  });
});
