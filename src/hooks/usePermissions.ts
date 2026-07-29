import { useAuth } from '../contexts/AuthContext';

export type ActionPermission = 'hide' | 'view' | 'edit';

export function usePermissions(): { getPagePermission: (page: string) => ActionPermission; isMaster: boolean };
export function usePermissions(pageName: string): { canView: boolean; canEdit: boolean; isHidden: boolean; isMaster: boolean; permission: ActionPermission };
export function usePermissions(pageName?: string) {
  const { role, actionPermissions } = useAuth();

  const getPagePermission = (page: string): ActionPermission => {
    if (role === 'master') {
      return 'edit';
    }

    if (actionPermissions && actionPermissions[page]) {
      return actionPermissions[page] as ActionPermission;
    }

    // Default permission if not set
    return 'edit';
  };

  if (!pageName) {
    return {
      getPagePermission,
      isMaster: role === 'master'
    };
  }

  const permission = getPagePermission(pageName);

  return {
    canView: permission !== 'hide',
    canEdit: permission === 'edit',
    isHidden: permission === 'hide',
    isMaster: role === 'master',
    permission
  };
};
