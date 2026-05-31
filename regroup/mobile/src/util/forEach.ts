export const asyncForEach = async <T>(
  list: Record<string, T>,
  fn: (item: T, key: string) => Promise<any>,
) => {
  const keys = Object.keys(list);
  for (let i = 0; i < keys.length; i++) {
    const currentKey = keys[i];
    const item = list[currentKey];
    await fn(item, currentKey);
  }
};
