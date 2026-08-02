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

      const { data: sourceData, error: fetchError } = await sourceClient
        .from(table)
        .select('*');

      if (fetchError) throw fetchError;

      if (!sourceData || sourceData.length === 0) {
        onProgress({ table, status: 'success', message: 'Không có dữ liệu', count: 0 });
        continue;
      }

      // Xử lý đặc biệt cho bảng recipes: Xóa các công thức cũ của các sản phẩm sắp được đồng bộ
      // để tránh tình trạng nhân đôi do ID của recipes thay đổi mỗi khi được chỉnh sửa
      if (table === 'recipes') {
        const productIds = Array.from(new Set(sourceData.map((r: any) => r.product_id).filter(Boolean)));
        if (productIds.length > 0) {
          const { error: deleteError } = await destClient
            .from('recipes')
            .delete()
            .in('product_id', productIds);
          
          if (deleteError) {
            console.warn(`Lỗi khi xóa công thức cũ: ${deleteError.message}`);
          }
        }
      }

      const onConflict = ON_CONFLICT_MAP[table] || 'id';

      const { error: upsertError } = await destClient
        .from(table)
        .upsert(sourceData as any, { onConflict });

      if (upsertError) throw upsertError;

      onProgress({ table, status: 'success', count: sourceData.length });
    } catch (error: any) {
      console.error(`Lỗi đồng bộ bảng ${table}:`, error);
      onProgress({ table, status: 'error', message: error.message || 'Lỗi không xác định' });
      throw new Error(`Đồng bộ thất bại tại bảng ${table}: ${error.message}`);
    }
  }
}

// ─────────────────────────────────────────────
//  SCHEMA SYNC
// ─────────────────────────────────────────────

export interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

export interface MissingColumn extends ColumnInfo {
  status: 'pending' | 'applying' | 'added' | 'exists' | 'error';
  message?: string;
}

/**
 * Lấy toàn bộ thông tin schema (danh sách cột) của một cơ sở
 * Yêu cầu RPC function get_schema_info() đã được deploy trên Supabase project đó
 */
export async function getSchemaInfo(
  facility: { id: string; supabase_url: string; supabase_anon_key: string }
): Promise<ColumnInfo[]> {
  const client = getFacilityClient(facility.id, facility.supabase_url, facility.supabase_anon_key);
  // @ts-ignore: Functions not yet in generated database.types.ts
  const { data, error } = await client.rpc('get_schema_info');
  if (error) throw new Error(`Không thể đọc schema từ ${facility.id}: ${error.message}`);
  return (data || []) as ColumnInfo[];
}

/**
 * So sánh schema nguồn vs đích, trả về danh sách cột còn thiếu ở đích
 */
export function diffSchemas(sourceSchema: ColumnInfo[], destSchema: ColumnInfo[]): MissingColumn[] {
  const destSet = new Set(
    destSchema.map(c => `${c.table_name}::${c.column_name}`)
  );

  return sourceSchema
    .filter(c => !destSet.has(`${c.table_name}::${c.column_name}`))
    .map(c => ({ ...c, status: 'pending' as const }));
}

/**
 * Áp dụng danh sách cột thiếu vào cơ sở đích bằng cách gọi RPC apply_column_migration
 * Yêu cầu RPC function apply_column_migration() đã được deploy trên Supabase project đó
 */
export async function applyMissingColumns(
  destFacility: { id: string; supabase_url: string; supabase_anon_key: string },
  missingColumns: MissingColumn[],
  onProgress: (col: MissingColumn) => void
): Promise<void> {
  const destClient = getFacilityClient(destFacility.id, destFacility.supabase_url, destFacility.supabase_anon_key);

  for (const col of missingColumns) {
    onProgress({ ...col, status: 'applying' });
    try {
      // @ts-ignore: Functions not yet in generated database.types.ts
      const { data, error } = await destClient.rpc('apply_column_migration', {
        p_table_name: col.table_name,
        p_column_name: col.column_name,
        p_data_type: col.data_type,
        p_is_nullable: col.is_nullable,
        p_column_default: col.column_default,
      });

      if (error) throw error;

      const result = data as string;
      onProgress({
        ...col,
        status: result === 'EXISTS' ? 'exists' : 'added',
        message: result === 'EXISTS' ? 'Đã tồn tại' : 'Đã thêm thành công',
      });
    } catch (error: any) {
      onProgress({ ...col, status: 'error', message: error.message });
    }
  }
}
