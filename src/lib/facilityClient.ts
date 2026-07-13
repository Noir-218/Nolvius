import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

const masterUrl = import.meta.env.VITE_SUPABASE_URL;
const masterAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!masterUrl || !masterAnonKey) {
  throw new Error('Missing Supabase environment variables! Check your .env file.');
}

// Client cố định kết nối đến database Master (quản lý Auth, Users, Facilities, user_facility_access)
export const masterSupabase = createClient<Database>(masterUrl, masterAnonKey);

// Cache lưu trữ các client đã được khởi tạo để tránh tạo đi tạo lại
const clientCache: Record<string, SupabaseClient<Database>> = {};

/**
 * Trả về Supabase Client cho cơ sở tương ứng
 */
export function getFacilityClient(
  facilityId: string,
  url: string,
  anonKey: string
): SupabaseClient<Database> {
  // Nếu cơ sở được chọn chính là Master DB, sử dụng luôn masterSupabase client để giữ được session đăng nhập hiện tại
  if (url === masterUrl) {
    return masterSupabase;
  }

  if (!clientCache[facilityId]) {
    clientCache[facilityId] = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: false, // Tắt persist session cho client cơ sở để tránh xung đột đăng nhập của Master DB
        autoRefreshToken: false, // Vì auth chạy ở Master DB, client cơ sở không cần quản lý refresh token của riêng nó
      },
    });
  }
  return clientCache[facilityId];
}
