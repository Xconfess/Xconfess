import { SetMetadata } from '@nestjs/common';

export const OWNERSHIP_META = 'ownership_meta';

export interface OwnershipMeta {
  /** Request param / body / query key that holds the owner's user ID */
  paramKey: string;
  /** When true, admin-role users bypass the ownership check */
  adminBypass?: boolean;
}

export const Ownership = (meta: OwnershipMeta) => SetMetadata(OWNERSHIP_META, meta);