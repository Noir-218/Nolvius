import { masterSupabase } from './facilityClient';

// Re-export masterSupabase thành supabase để không làm gãy các file import cũ
export const supabase = masterSupabase;
