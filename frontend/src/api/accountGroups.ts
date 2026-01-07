import { get, put } from "../utils/apiClient";

export type AccountGroup = {
  id: string;
  name: string;
};

export type AccountGroupMembership = {
  account_id: string;
  group_id: string;
};

export async function fetchAccountGroups() {
  return get<AccountGroup[]>("/api/account-groups");
}

export async function fetchAccountGroupMemberships() {
  return get<AccountGroupMembership[]>("/api/account-groups/memberships");
}

export async function updateAccountGroup(groupId: string, accountIds: string[]) {
  return put<AccountGroup>(`/api/account-groups/${groupId}`, { account_ids: accountIds });
}
