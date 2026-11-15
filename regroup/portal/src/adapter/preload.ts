// Must be the first import in the entry point.
// components/rats-search-bar assigns navigator.geolocation while loading, which
// throws in a browser, where it is a getter-only property.
Object.defineProperty(navigator, 'geolocation', {
  value: navigator.geolocation,
  writable: true,
  configurable: true,
});
