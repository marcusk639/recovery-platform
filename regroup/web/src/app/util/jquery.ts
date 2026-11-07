/**
 * The page's jQuery, or null when it isn't loaded.
 *
 * src/index.html loads jQuery, Bootstrap and the theme plugins from
 * src/assets/js. They were missing from every build until #180 (regroup/.gitignore
 * ignored **\/*.min.js), and a script can still fail to load. Calling a missing
 * $ in ngOnInit throws and aborts Angular's first render pass, which leaves the
 * home page without its header and hero text, so callers skip the jQuery
 * behaviour instead.
 */
export function jquery(): any {
  const $ = typeof window === 'undefined' ? undefined : (window as any).$;
  return typeof $ === 'function' ? $ : null;
}

/** jQuery, if it is loaded and has `plugin` (e.g. slick, tooltip, modal); null otherwise. */
export function jqueryPlugin(plugin: string): any {
  const $ = jquery();
  return $ && $.fn && typeof $.fn[plugin] === 'function' ? $ : null;
}
