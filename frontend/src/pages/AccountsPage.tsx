import { useCallback, useEffect, useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import EmptyState from "../components/EmptyState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Modal from "../components/Modal";
import { useSelection } from "../components/SelectionContext";
import Breadcrumbs from "../layouts/Breadcrumbs";
import {
  AccountGroupMembership,
  createAccountGroup,
  deleteAccountGroup,
  fetchAccountGroupMemberships,
  fetchAccountGroups,
  updateAccountGroup,
} from "../api/accountGroups";
import { get, post } from "../utils/apiClient";
import { getFriendlyErrorMessage } from "../utils/errorMessages";
import { pageTitles } from "../utils/pageTitles";

type Account = {
  id: string;
  name: string;
  currency_code: string;
};

type AccountGroup = {
  id: string;
  name: string;
};

export default function AccountsPage() {
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const { account: selectedAccount, group: selectedGroup } = useSelection();
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [isGroupDeleteOpen, setIsGroupDeleteOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isMembershipOpen, setIsMembershipOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupAccountIds, setGroupAccountIds] = useState<string[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [isGroupSaving, setIsGroupSaving] = useState(false);
  const [groupEditingId, setGroupEditingId] = useState<string | null>(null);
  const [groupDeleteTarget, setGroupDeleteTarget] = useState<AccountGroup | null>(null);
  const [accountName, setAccountName] = useState("");
  const [accountCurrency, setAccountCurrency] = useState("USD");
  const [membershipGroup, setMembershipGroup] = useState("");
  const [membershipAccount, setMembershipAccount] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [memberships, setMemberships] = useState<AccountGroupMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMembershipSaving, setIsMembershipSaving] = useState(false);

  const loadData = useCallback(async () => {
    let isMounted = true;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [accountsResponse, groupsResponse, membershipResponse] = await Promise.all([
          get<Account[]>("/api/accounts"),
          fetchAccountGroups(),
          fetchAccountGroupMemberships(),
        ]);
        if (!isMounted) {
          return;
        }
        setAccounts(accountsResponse);
        setGroups(groupsResponse);
        setMemberships(membershipResponse);
        setMembershipAccount(accountsResponse[0]?.name ?? "");
        setMembershipGroup(groupsResponse[0]?.name ?? "Ungrouped");
      } catch (err) {
        if (isMounted) {
          setError("Unable to load accounts data.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    await run();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    loadData().then((result) => {
      cleanup = result;
    });
    return () => {
      cleanup?.();
    };
  }, [loadData]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    setIsFiltering(true);
    const timer = window.setTimeout(() => setIsFiltering(false), 350);
    return () => window.clearTimeout(timer);
  }, [isLoading, selectedAccount, selectedGroup]);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const accountIdByName = useMemo(
    () => new Map(accounts.map((account) => [account.name, account.id])),
    [accounts],
  );
  const groupIdByName = useMemo(
    () => new Map(groups.map((group) => [group.name, group.id])),
    [groups],
  );

  const membershipsByGroup = useMemo(() => {
    return memberships.reduce<Record<string, Set<string>>>((acc, membership) => {
      if (!acc[membership.group_id]) {
        acc[membership.group_id] = new Set();
      }
      acc[membership.group_id].add(membership.account_id);
      return acc;
    }, {});
  }, [memberships]);

  const groupAccountCounts = useMemo(
    () =>
      groups.reduce<Record<string, number>>((acc, group) => {
        acc[group.id] = membershipsByGroup[group.id]?.size ?? 0;
        return acc;
      }, {}),
    [groups, membershipsByGroup],
  );

  const ungroupedCount = useMemo(() => {
    const groupedIds = new Set(memberships.map((membership) => membership.account_id));
    return accounts.filter((account) => !groupedIds.has(account.id)).length;
  }, [accounts, memberships]);

  const applyMembershipUpdate = async () => {
    if (!membershipAccount) {
      showToast("Missing account", "Choose an account to update.");
      return;
    }
    const accountId = accountIdByName.get(membershipAccount);
    if (!accountId) {
      showToast("Account not found", "Select a valid account.");
      return;
    }
    setIsMembershipSaving(true);
    const previousMemberships = memberships;
    try {
      const targetGroupId =
        membershipGroup === "Ungrouped" ? null : groupIdByName.get(membershipGroup) ?? null;
      if (membershipGroup !== "Ungrouped" && !targetGroupId) {
        showToast("Group not found", "Select a valid group.");
        return;
      }
      const nextMemberships: AccountGroupMembership[] = [];
      await Promise.all(
        groups.map((group) => {
          const currentIds = Array.from(membershipsByGroup[group.id] ?? []);
          const baseIds = currentIds.filter((id) => id !== accountId);
          const nextIds =
            targetGroupId && group.id === targetGroupId
              ? [...baseIds, accountId]
              : baseIds;
          nextIds.forEach((id) =>
            nextMemberships.push({ account_id: id, group_id: group.id }),
          );
          return updateAccountGroup(group.id, { account_ids: nextIds });
        }),
      );
      setMemberships(nextMemberships);
      showToast(
        "Membership updated",
        targetGroupId
          ? `${membershipAccount} added to ${membershipGroup}.`
          : `${membershipAccount} is now ungrouped.`,
      );
      setIsMembershipOpen(false);
    } catch (err) {
      setMemberships(previousMemberships);
      showToast("Update failed", getFriendlyErrorMessage(err, "Unable to update membership."));
    } finally {
      setIsMembershipSaving(false);
    }
  };

  const openCreateGroup = () => {
    setGroupEditingId(null);
    setGroupName("");
    setGroupAccountIds([]);
    setGroupError(null);
    setIsGroupOpen(true);
  };

  const openEditGroup = (group: AccountGroup) => {
    setGroupEditingId(group.id);
    setGroupName(group.name);
    setGroupAccountIds(Array.from(membershipsByGroup[group.id] ?? []));
    setGroupError(null);
    setIsGroupOpen(true);
  };

  const handleSaveGroup = async () => {
    const trimmed = groupName.trim();
    if (!trimmed) {
      setGroupError("Enter a group name to continue.");
      return;
    }
    setGroupError(null);
    setIsGroupSaving(true);
    const isEdit = Boolean(groupEditingId);
    const tempId = `temp-${Date.now()}`;
    const optimisticGroup: AccountGroup = { id: tempId, name: trimmed };
    const previousGroups = groups;
    const previousMemberships = memberships;
    if (!isEdit) {
      setGroups((prev) => [optimisticGroup, ...prev]);
    } else {
      setGroups((prev) =>
        prev.map((group) =>
          group.id === groupEditingId ? { ...group, name: trimmed } : group,
        ),
      );
    }
    setIsGroupOpen(false);
    try {
      const saved = isEdit
        ? await updateAccountGroup(groupEditingId as string, {
            name: trimmed,
            account_ids: groupAccountIds,
          })
        : await createAccountGroup(trimmed, groupAccountIds);
      if (isEdit) {
        setGroups((prev) =>
          prev.map((group) => (group.id === saved.id ? saved : group)),
        );
      } else {
        setGroups((prev) =>
          prev.map((group) => (group.id === tempId ? saved : group)),
        );
      }
      const nextMemberships: AccountGroupMembership[] = [
        ...previousMemberships.filter((membership) => membership.group_id !== saved.id),
        ...groupAccountIds.map((account_id) => ({ account_id, group_id: saved.id })),
      ];
      setMemberships(nextMemberships);
      showToast(
        isEdit ? "Group updated" : "Group created",
        isEdit ? `Saved ${saved.name}.` : `Created ${saved.name}.`,
      );
    } catch (err) {
      setGroups(previousGroups);
      setMemberships(previousMemberships);
      setGroupError(getFriendlyErrorMessage(err, "Unable to save this group."));
      setIsGroupOpen(true);
    } finally {
      setIsGroupSaving(false);
    }
  };

  const openDeleteGroup = (group: AccountGroup) => {
    setGroupDeleteTarget(group);
    setIsGroupDeleteOpen(true);
  };

  const handleDeleteGroup = async () => {
    if (!groupDeleteTarget) {
      return;
    }
    const target = groupDeleteTarget;
    const previousGroups = groups;
    const previousMemberships = memberships;
    setIsGroupDeleteOpen(false);
    setGroupDeleteTarget(null);
    setGroups((prev) => prev.filter((group) => group.id !== target.id));
    setMemberships((prev) =>
      prev.filter((membership) => membership.group_id !== target.id),
    );
    try {
      await deleteAccountGroup(target.id);
      showToast("Group deleted", `${target.name} was removed.`);
    } catch (err) {
      setGroups(previousGroups);
      setMemberships(previousMemberships);
      showToast("Delete failed", getFriendlyErrorMessage(err, "Unable to delete group."));
    }
  };

  const handleCreateAccount = async () => {
    if (!accountName.trim()) {
      showToast("Missing name", "Enter an account name to save.");
      return;
    }
    const trimmed = accountName.trim();
    const tempId = `temp-${Date.now()}`;
    const optimisticAccount: Account = {
      id: tempId,
      name: trimmed,
      currency_code: accountCurrency,
    };
    setAccounts((prev) => [optimisticAccount, ...prev]);
    setIsAccountOpen(false);
    setAccountName("");
    try {
      const created = await post<Account>("/api/accounts", {
        name: trimmed,
        currency_code: accountCurrency,
      });
      setAccounts((prev) =>
        prev.map((account) => (account.id === tempId ? created : account)),
      );
      setMembershipAccount(created.name);
      showToast("Account saved", `Added ${created.name}.`);
    } catch (err) {
      setAccounts((prev) => prev.filter((account) => account.id !== tempId));
      showToast("Save failed", "Unable to create this account.");
    }
  };

  const accountRows = useMemo(() => {
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
    const accountGroupById = memberships.reduce<Record<string, string>>((acc, membership) => {
      const groupName = groupNameById.get(membership.group_id);
      if (groupName) {
        acc[membership.account_id] = groupName;
      }
      return acc;
    }, {});
    return accounts.map((row) => ({
      name: row.name,
      currency: row.currency_code,
      status: "Active",
      group: accountGroupById[row.id] ?? "Ungrouped",
    }));
  }, [accounts, groups, memberships]);

  const filteredAccounts = accountRows.filter((row) => {
    const matchesAccount = selectedAccount === "All Accounts" || row.name === selectedAccount;
    const matchesGroup =
      selectedGroup === "All Groups" ||
      (selectedGroup === "Ungrouped" && row.group === "Ungrouped");
    return matchesAccount && matchesGroup;
  });

  const breadcrumbs = [
    { label: pageTitles.accounts, to: "/accounts" },
    {
      label: selectedGroup === "All Groups" ? "All Groups" : selectedGroup,
      hint:
        groups.length === 0
          ? "No account groups yet."
          : selectedGroup !== "All Groups" &&
              selectedGroup !== "Ungrouped" &&
              !groups.some((group) => group.name === selectedGroup)
            ? "Group not found."
            : undefined,
    },
    {
      label: selectedAccount === "All Accounts" ? "All Accounts" : selectedAccount,
      hint:
        accounts.length === 0
          ? "No accounts yet."
          : filteredAccounts.length === 0
            ? "No accounts match this view."
            : undefined,
    },
  ];

  if (isLoading) {
    return (
      <section className="page">
        <LoadingSkeleton label="Loading accounts" lines={6} />
      </section>
    );
  }

  if (error) {
    return (
      <section className="page">
        <div className="card page-state error">
          <p>{error}</p>
          <button className="pill" type="button" onClick={loadData}>
            Retry
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <Breadcrumbs items={breadcrumbs} />
      <header className="page-header">
        <div>
          <h1>{pageTitles.accounts}</h1>
          <p className="muted">Manage accounts and groups.</p>
        </div>
        <div className="toolbar">
          <button
            className="pill"
            onClick={openCreateGroup}
          >
            Create Group
          </button>
          <button
            className="pill primary"
            onClick={() => setIsAccountOpen(true)}
          >
            Add Account
          </button>
        </div>
      </header>
      <Modal
        title={groupEditingId ? "Edit group" : "Create group"}
        description={
          groupEditingId
            ? "Rename the group and adjust account assignments."
            : "Bundle accounts under a shared view."
        }
        isOpen={isGroupOpen}
        onClose={() => setIsGroupOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsGroupOpen(false)}>
              Cancel
            </button>
            <button
              className="pill primary"
              type="button"
              onClick={handleSaveGroup}
              disabled={isGroupSaving}
            >
              {isGroupSaving ? "Saving..." : "Save Group"}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label>
            Group name
            <input
              type="text"
              placeholder="Investments"
              value={groupName}
              onChange={(event) => {
                setGroupName(event.target.value);
                if (groupError) {
                  setGroupError(null);
                }
              }}
            />
          </label>
          <div>
            <span className="muted">Assign accounts</span>
            <div className="chip-grid">
              {accounts.length === 0 ? (
                <span className="muted">Add an account first to assign it.</span>
              ) : (
                accounts.map((account) => {
                  const isChecked = groupAccountIds.includes(account.id);
                  return (
                    <div key={account.id} className="chip">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() =>
                          setGroupAccountIds((prev) =>
                            prev.includes(account.id)
                              ? prev.filter((id) => id !== account.id)
                              : [...prev, account.id],
                          )
                        }
                      />
                      {account.name}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          {groupError ? <p className="form-error">{groupError}</p> : null}
        </div>
      </Modal>
      <Modal
        title="Delete group"
        description="This removes the group and unassigns its accounts."
        isOpen={isGroupDeleteOpen}
        onClose={() => setIsGroupDeleteOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsGroupDeleteOpen(false)}>
              Cancel
            </button>
            <button className="pill danger" type="button" onClick={handleDeleteGroup}>
              Delete Group
            </button>
          </>
        }
      >
        <p>
          {groupDeleteTarget
            ? `Delete "${groupDeleteTarget.name}"? This cannot be undone.`
            : "Choose a group to delete."}
        </p>
      </Modal>
      <Modal
        title="Add account"
        description="Create a new account with a base currency."
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsAccountOpen(false)}>
              Cancel
            </button>
            <button
              className="pill primary"
              type="button"
              onClick={handleCreateAccount}
            >
              Save Account
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label>
            Account name
            <input
              type="text"
              placeholder="Brokerage"
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
            />
          </label>
          <label>
            Currency
            <select
              value={accountCurrency}
              onChange={(event) => setAccountCurrency(event.target.value)}
            >
              {["USD", "EUR", "GBP", "JPY", "HKD"].map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Modal>
      <Modal
        title="Manage memberships"
        description="Assign accounts to groups."
        isOpen={isMembershipOpen}
        onClose={() => setIsMembershipOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsMembershipOpen(false)}>
              Cancel
            </button>
            <button
              className="pill primary"
              type="button"
              onClick={applyMembershipUpdate}
              disabled={isMembershipSaving}
            >
              {isMembershipSaving ? "Saving..." : "Save Membership"}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label>
            Group
            <select
              value={membershipGroup}
              onChange={(event) => setMembershipGroup(event.target.value)}
            >
              {["Ungrouped", ...groups.map((group) => group.name)].map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
          <label>
            Account
            <select
              value={membershipAccount}
              onChange={(event) => setMembershipAccount(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.name}>
                  {account.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Modal>
      {toast && <ActionToast toast={toast} onDismiss={() => setToast(null)} />}
      <div className="split-grid">
        <div className="card">
          <h3>Accounts</h3>
          <div className="list-row list-header columns-3">
            <span>Name</span>
            <span>Currency</span>
            <span>Status</span>
          </div>
          {isFiltering ? (
            <LoadingSkeleton label="Filtering accounts" lines={4} />
          ) : filteredAccounts.length === 0 ? (
            <EmptyState
              title={
                accounts.length === 0
                  ? "No accounts yet"
                  : "No accounts match this view"
              }
              description="Accounts store balances and power transactions and performance insights."
              actionLabel="Add account"
              actionHint="Create your first account to begin tracking."
              onAction={() => setIsAccountOpen(true)}
            />
          ) : (
            filteredAccounts.map((row) => (
              <div className="list-row columns-3" key={row.name}>
                <span>{row.name}</span>
                <span>{row.currency}</span>
                <span className="status">{row.status}</span>
              </div>
            ))
          )}
        </div>
        <div className="card">
          <h3>Groups</h3>
          <p className="muted">Bundle accounts for combined insights.</p>
          <div className="list-row list-header columns-3">
            <span>Name</span>
            <span>Accounts</span>
            <span>Actions</span>
          </div>
          {groups.length === 0 ? (
            <div className="list-row columns-3 empty-state">
              <span>Ungrouped</span>
              <span>{ungroupedCount} account(s)</span>
              <span className="muted">Create a group to organize accounts.</span>
            </div>
          ) : (
            <>
              <div className="list-row columns-3">
                <span>Ungrouped</span>
                <span>{ungroupedCount} account(s)</span>
                <span className="muted">Default view</span>
              </div>
              {groups.map((group) => (
                <div key={group.id} className="list-row columns-3">
                  <span>{group.name}</span>
                  <span>{groupAccountCounts[group.id] ?? 0} account(s)</span>
                  <div className="row-actions">
                    <button className="pill" type="button" onClick={() => openEditGroup(group)}>
                      Edit
                    </button>
                    <button className="pill" type="button" onClick={() => openDeleteGroup(group)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
          <button
            className="pill"
            onClick={() => setIsMembershipOpen(true)}
          >
            Manage memberships
          </button>
        </div>
      </div>
    </section>
  );
}
