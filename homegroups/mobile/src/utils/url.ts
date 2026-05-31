/**
 * Parses a deep link URL and returns the path and query parameters
 * @param url The URL to parse
 * @returns An object containing the path and parsed parameters
 */
export const parseDeepLinkUrl = (
  url: string,
): {path: string; params: {[key: string]: string}} => {
  // Handle custom URL scheme (homegroups-app://)
  if (url.startsWith('homegroups-app://')) {
    const [baseUrl, queryString] = url.split('?');
    const path = baseUrl.split('://')[1];
    const params = parseQueryString(queryString);
    return {path, params};
  }

  // Handle universal links (https://)
  if (url.startsWith('https://')) {
    try {
      const parsedUrl = new URL(url);
      const path = parsedUrl.pathname;
      const params = parseQueryString(parsedUrl.search.substring(1));
      return {path, params};
    } catch (e) {
      console.error('Error parsing universal link URL:', e);
      return {path: '', params: {}};
    }
  }

  return {path: '', params: {}};
};

/**
 * Parses a query string into an object of key-value pairs
 * @param queryString The query string to parse (without the leading '?')
 * @returns An object containing the parsed parameters
 */
export const parseQueryString = (
  queryString?: string,
): {[key: string]: string} => {
  const params: {[key: string]: string} = {};

  if (!queryString) {
    return params;
  }

  queryString.split('&').forEach(param => {
    const [key, value] = param.split('=');
    if (key) {
      params[key] = value || '';
    }
  });

  return params;
};
