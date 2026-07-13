import React, { createContext, useContext, useState, useEffect } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import { getFacilityClient } from '../lib/facilityClient';
import { supabase } from '../lib/supabase'; // Sử dụng Master DB làm fallback mặc định
import type { Database } from '../types/database.types';

export interface Facility {
  id: string;
  name: string;
  address: string | null;
  supabase_url: string;
  supabase_anon_key: string;
  google_script_url?: string | null;
}

interface FacilityContextType {
  facilities: Facility[];
  currentFacility: Facility | null;
  facilityClient: SupabaseClient<Database>;
  loadingFacilities: boolean;
  selectFacility: (facility: Facility) => void;
  setFacilitiesList: (list: Facility[]) => void;
  setLoading: (loading: boolean) => void;
  clearFacility: () => void;
}

const FacilityContext = createContext<FacilityContextType | undefined>(undefined);

export const FacilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [currentFacility, setCurrentFacility] = useState<Facility | null>(null);
  const [facilityClient, setFacilityClient] = useState<SupabaseClient<Database>>(supabase);
  const [loadingFacilities, setLoadingFacilities] = useState(false);

  // Khôi phục cơ sở đã chọn từ localStorage khi khởi động
  useEffect(() => {
    const savedFacility = localStorage.getItem('current_facility');
    if (savedFacility) {
      try {
        const facility = JSON.parse(savedFacility) as Facility;
        setCurrentFacility(facility);
        const client = getFacilityClient(facility.id, facility.supabase_url, facility.supabase_anon_key);
        setFacilityClient(client);
      } catch (e) {
        console.error('Lỗi phân tích cú pháp cơ sở lưu trữ:', e);
      }
    }
  }, []);

  const selectFacility = (facility: Facility) => {
    setCurrentFacility(facility);
    localStorage.setItem('current_facility', JSON.stringify(facility));
    const client = getFacilityClient(facility.id, facility.supabase_url, facility.supabase_anon_key);
    setFacilityClient(client);
  };

  const setFacilitiesList = (list: Facility[]) => {
    setFacilities(list);
  };

  const setLoading = (loading: boolean) => {
    setLoadingFacilities(loading);
  };

  const clearFacility = () => {
    setCurrentFacility(null);
    setFacilityClient(supabase);
    localStorage.removeItem('current_facility');
  };

  return (
    <FacilityContext.Provider
      value={{
        facilities,
        currentFacility,
        facilityClient,
        loadingFacilities,
        selectFacility,
        setFacilitiesList,
        setLoading,
        clearFacility,
      }}
    >
      {children}
    </FacilityContext.Provider>
  );
};

export const useFacility = () => {
  const context = useContext(FacilityContext);
  if (!context) {
    throw new Error('useFacility phải được sử dụng bên trong FacilityProvider');
  }
  return context;
};
