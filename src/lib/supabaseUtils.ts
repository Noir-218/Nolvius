import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fetches all rows from a Supabase query by paginating through the results.
 * This circumvents the PostgREST max-rows server limit (default 1000).
 * 
 * @param query The base Supabase query (e.g. supabase.from('table').select('*').eq('x', 1))
 * @param chunkSize Number of rows to fetch per request (default 1000)
 * @returns Array of all matched rows
 */
export async function fetchAllSupabase(query: any, chunkSize = 1000): Promise<any[]> {
  let allData: any[] = [];
  let from = 0;
  let to = chunkSize - 1;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await query.range(from, to);
    
    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allData = [...allData, ...data];
      if (data.length < chunkSize) {
        hasMore = false;
      } else {
        from += chunkSize;
        to += chunkSize;
      }
    } else {
      hasMore = false;
    }
  }

  return allData;
}
