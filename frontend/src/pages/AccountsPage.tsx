import { useEffect, useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import Modal from "../components/Modal";
import { useSelection } from "../components/SelectionContext";
import Breadcrumbs from "../layouts/Breadcrumbs";
import { get, post } from "../utils/apiClient";
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
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isMembershipOpen, setIsMembershipOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountCurrency, setAccountCurrency] = useState("USD");
  const [membershipGroup, setMembershipGroup] = useState("");
  const [membershipAccount, setMembershipAccount] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [accountsResponse, groupsResponse] = await Promise.all([
          get<Account[]>("/api/accounts"),
          get<AccountGroup[]>("/api/account-groups"),
        ]);
        if (!isMounted) {
          return;
        }
        setAccounts(accountsResponse);
        setGroups(groupsResponse);
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
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      showToast("Missing name", "Enter a group name to save.");
      return;
    }
    try {
      const created = await post<AccountGroup>("/api/account-groups", {
        name: groupName.trim(),
        account_ids: [],
      });
      setGroups((prev) => [created, ...prev]);
      setIsGroupOpen(false);
      showToast("Group created", `Created ${created.name}.`);
      setGroupName("");
    } catch (err) {
      showToast("Save failed", "Unable to create this group.");
    }
  };

  const handleCreateAccount = async () => {
    if (!accountName.trim()) {
      showToast("Missing name", "Enter an account name to save.");
      return;
    }
    try {
      const created = await post<Account>("/api/accounts", {
        name: accountName.trim(),
        currency_code: accountCurrency,
      });
      setAccounts((prev) => [created, ...prev]);
      setIsAccountOpen(false);
      setMembershipAccount(created.name);
      showToast("Account saved", `Added ${created.name}.`);
      setAccountName("");
    } catch (err) {
      showToast("Save failed", "Unable to create this account.");
    }
  };

  const accountRows = useMemo(
    () =>
      accounts.map((row) => ({
        name: row.name,
        currency: row.currency_code,
        status: "Active",
        group: "Ungrouped",
      })),
    [accounts],
  );

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
        <div className="card page-state">Loading accounts...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="page">
        <div className="card page-state error">{error}</div>
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
            onClick={() => setIsGroupOpen(true)}
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
        title="Create group"
        description="Bundle accounts under a shared view."
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
              onClick={handleCreateGroup}
            >
              Save Group
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
              onChange={(event) => setGroupName(event.target.value)}
            />
          </label>
        </div>
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
              onClick={() => {
                setIsMembershipOpen(false);
                showToast(
                  "Membership updated",
                  membershipAccount && membershipGroup
                    ? `${membershipAccount} added to ${membershipGroup}.`
                    : "Membership updated.",
                );
              }}
            >
              Save Membership
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
          {filteredAccounts.length === 0 ? (
            <div className="list-row columns-3 empty-state">No accounts available.</div>
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
          <div className="chip-grid">
            {groups.length === 0 ? (
              <span className="chip">Ungrouped</span>
            ) : (
              groups.map((group) => (
                <span key={group.id} className="chip">
                  {group.name}
                </span>
              ))
            )}
          </div>
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
