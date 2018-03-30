export async function fetchOrNull(promise) {
  try {
    return await promise;
  } catch (err) {
    if (err.statusCode === 404) {
      return null;
    }
    throw err;
  }
}
