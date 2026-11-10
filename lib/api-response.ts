export async function readApiResponse<T>(response: Response, fallback = "Could not read the server response. Please try again."): Promise<T> {
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error(fallback); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(fallback);
  return data as T;
}
