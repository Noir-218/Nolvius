import { getFacilityClient } from './facilityClient';
import type { Database } from '../types/database.types';

type TableName = keyof Database['public']['Tables'];

// Các bảng dữ liệu chung cần đồng bộ, được sắp xếp theo thứ tự khóa ngoại
// (Bảng cha phải được đồng bộ trước bảng con)
export const SYNC_TABLES: TableName[] = [
  'product_categories',
  'ingredient_categories',
  'ingredient_order_types',
  'suppliers',
  'ingredients',
  'ingredient_units',
  'products',
  'recipes',
];
// Khai báo các cột dùng để giải quyết xung đột (Conflict Resolution) khi Upsert
// Mặc định Supabase sẽ dùng Khóa chính (id), nhưng một số bảng có Unique Constraint khác
const ON_CONFLICT_MAP: Partial<Record<TableName, string>> = {
  ingredient_units: 'ingredient_id,unit_name',
};

export interface SyncProgress {
  table: string;
  status: 'pending' | 'syncing' | 'success' | 'error';
  message?: string;
  count?: number;
}

/**
 * Đồng bộ dữ liệu chung từ cơ sở Nguồn sang cơ sở Đích
 */
export async function syncDataBetweenFacilities(
  sourceFacility: { id: string; supabase_url: string; supabase_anon_key: string },
  destFacility: { id: string; supabase_url: string; supabase_anon_key: string },
  tablesToSync: TableName[],
  onProgress: (progress: SyncProgress) => void
) {
  const sourceClient = getFacilityClient(sourceFacility.id, sourceFacility.supabase_url, sourceFacility.supabase_anon_key);
  const destClient = getFacilityClient(destFacility.id, destFacility.supabase_url, destFacility.supabase_anon_key);

  for (const table of tablesToSync) {
    try {
      onProgress({ table, status: 'syncing' });

      // Lấy toàn bộ dữ liệu từ bảng của cơ sở nguồn
      const { data: sourceData, error: fetchError } = await sourceClient
        .from(table)
        .select('*');

      if (fetchError) throw fetchError;

      if (!sourceData || sourceData.length === 0) {
        onProgress({ table, status: 'success', message: 'Không có dữ liệu', count: 0 });
        continue;
      }

      // Lấy onConflict nếu có, mặc định là id
      const onConflict = ON_CONFLICT_MAP[table] || 'id';

      // Upsert dữ liệu vào cơ sở đích
      const { error: upsertError } = await destClient
        .from(table)
        .upsert(sourceData as any, { onConflict });

      if (upsertError) throw upsertError;

      onProgress({ table, status: 'success', count: sourceData.length });
    } catch (error: any) {
      console.error(`Lỗi đồng bộ bảng ${table}:`, error);
      onProgress({ table, status: 'error', message: error.message || 'Lỗi không xác định' });
      // Nếu một bảng lỗi, có thể ngừng đồng bộ các bảng sau do phụ thuộc khóa ngoại
      throw new Error(`Đồng bộ thất bại tại bảng ${table}: ${error.message}`);
    }
  }
}
