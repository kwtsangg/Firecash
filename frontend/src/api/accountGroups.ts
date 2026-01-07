import { del, get, post, put } from "../utils/apiClient";

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

export async function createAccountGroup(name: string, accountIds: string[]) {
  return post<AccountGroup>("/api/account-groups", {
    name,
    account_ids: accountIds,
  });
}

export async function updateAccountGroup(
  groupId: string,
  data: { name?: string; account_ids?: string[] },
) {
  return put<AccountGroup>(`/api/account-groups/${groupId}`, data);
}

export async function deleteAccountGroup(groupId: string) {
  return del(`/api/account-groups/${groupId}`);
}
