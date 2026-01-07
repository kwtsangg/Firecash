import { useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import Modal from "../components/Modal";
import { useSelection } from "../components/SelectionContext";

export default function AccountsPage() {
  const groupOptions = ["Investments", "Cashflow", "Long Term"];
  const accountOptions = ["Primary Account", "Retirement", "Vacation Fund", "HKD Growth"];
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const { account: selectedAccount, group: selectedGroup } = useSelection();
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isMembershipOpen, setIsMembershipOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountCurrency, setAccountCurrency] = useState("USD");
  const [membershipGroup, setMembershipGroup] = useState(groupOptions[0]);
  const [membershipAccount, setMembershipAccount] = useState(accountOptions[0]);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const accountRows = [
    { name: "Primary Account", currency: "USD", status: "Active", group: "Cashflow" },
    { name: "Retirement", currency: "USD", status: "Active", group: "Investments" },
    { name: "Vacation Fund", currency: "EUR", status: "Paused", group: "Cashflow" },
    { name: "HKD Growth", currency: "HKD", status: "Active", group: "Investments" },
  ];
  const filteredAccounts = accountRows.filter(
    (row) =>
      (selectedAccount === "All Accounts" || row.name === selectedAccount) &&
      (selectedGroup === "All Groups" || row.group === selectedGroup),
  );

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Accounts</h1>
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
              onClick={() => {
                setIsGroupOpen(false);
                showToast("Group created", groupName ? `Created ${groupName}.` : "Group saved.");
                setGroupName("");
              }}
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
              onClick={() => {
                setIsAccountOpen(false);
                showToast(
                  "Account saved",
                  accountName ? `Added ${accountName}.` : "Account saved.",
                );
                setAccountName("");
              }}
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
                  `${membershipAccount} added to ${membershipGroup}.`,
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
              {groupOptions.map((group) => (
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
              {accountOptions.map((account) => (
                <option key={account} value={account}>
                  {account}
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
          {filteredAccounts.map((row) => (
            <div className="list-row columns-3" key={row.name}>
              <span>{row.name}</span>
              <span>{row.currency}</span>
              <span className="status">{row.status}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Groups</h3>
          <p className="muted">Bundle accounts for combined insights.</p>
          <div className="chip-grid">
            {groupOptions.map((group) => (
              <span key={group} className="chip">
                {group}
              </span>
            ))}
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
