export type ApiKeyPrincipal<Role extends string = string> = {
  name: string;
  apiKey: string;
  roles: readonly Role[];
};

export function findApiKeyPrincipal<Role extends string, T extends ApiKeyPrincipal<Role>>(
  principals: readonly T[],
  providedApiKey: string | null | undefined
): T | null {
  if (!providedApiKey) {
    return null;
  }

  return principals.find((principal) => principal.apiKey === providedApiKey) ?? null;
}

export function getMissingRoles<Role extends string>(
  grantedRoles: readonly Role[],
  requiredRoles: readonly Role[]
): Role[] {
  return requiredRoles.filter((role) => !grantedRoles.includes(role));
}

export function hasRequiredRoles<Role extends string>(
  grantedRoles: readonly Role[],
  requiredRoles: readonly Role[]
): boolean {
  return getMissingRoles(grantedRoles, requiredRoles).length === 0;
}

