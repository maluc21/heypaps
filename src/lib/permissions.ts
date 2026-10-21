/**
 * Matriz de permisos tipada (plan §5.1).
 * Rol = quién sos. Permiso = qué podés hacer. Entitlement = cuánto permite tu plan.
 * Vive en código versionado, no en la base de datos.
 */

export type StoreRole = 'owner' | 'editor' | 'viewer'
export type PlatformRole = 'superadmin' | 'support'

export type StorePermission =
  | 'store.update'
  | 'store.delete'
  | 'member.manage'
  | 'billing.manage'
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'variant.stock'
  | 'category.manage'
  | 'tag.manage'
  | 'product.read'

const STORE_PERMISSIONS: Record<StoreRole, StorePermission[]> = {
  owner: [
    'store.update',
    'store.delete',
    'member.manage',
    'billing.manage',
    'product.create',
    'product.update',
    'product.delete',
    'variant.stock',
    'category.manage',
    'tag.manage',
    'product.read',
  ],
  editor: [
    'product.create',
    'product.update',
    'variant.stock',
    'category.manage',
    'tag.manage',
    'product.read',
  ],
  viewer: ['product.read'],
}

export function can(role: StoreRole | undefined, permission: StorePermission): boolean {
  if (!role) return false
  return STORE_PERMISSIONS[role].includes(permission)
}

export function canManageStore(role: StoreRole | undefined): boolean {
  return can(role, 'store.update') || can(role, 'store.delete')
}

export function canManageMembers(role: StoreRole | undefined): boolean {
  return can(role, 'member.manage')
}

export function canManageBilling(role: StoreRole | undefined): boolean {
  return can(role, 'billing.manage')
}

export function canCreateProduct(role: StoreRole | undefined): boolean {
  return can(role, 'product.create')
}

export function canUpdateProduct(role: StoreRole | undefined): boolean {
  return can(role, 'product.update')
}

export function canDeleteProduct(role: StoreRole | undefined): boolean {
  return can(role, 'product.delete')
}

export function canManageVariantStock(role: StoreRole | undefined): boolean {
  return can(role, 'variant.stock')
}

export function canManageCategory(role: StoreRole | undefined): boolean {
  return can(role, 'category.manage')
}

export function canManageTag(role: StoreRole | undefined): boolean {
  return can(role, 'tag.manage')
}

export function canReadProduct(role: StoreRole | undefined): boolean {
  return can(role, 'product.read')
}

export function isPlatformRole(role: PlatformRole | undefined, expected: PlatformRole): boolean {
  return role === expected
}
