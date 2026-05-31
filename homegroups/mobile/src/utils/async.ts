export const mapAsync = async <T, R>(
  array: T[],
  callback: (item: T, index: number, array: T[]) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];
  for (let i = 0; i < array.length; i++) {
    const result = await callback(array[i], i, array);
    results.push(result);
  }
  return results;
};
