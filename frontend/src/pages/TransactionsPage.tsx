import { useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import Modal from "../components/Modal";
import { useCurrency } from "../components/CurrencyContext";
import { useSelection } from "../components/SelectionContext";
import { convertAmount, formatCurrency, supportedCurrencies } from "../utils/currency";

export default function TransactionsPage() {
  const accountOptions = ["Primary Account", "Retirement", "Side Hustle"];
  const { currency: displayCurrency } = useCurrency();
  const { account: selectedAccount, group: selectedGroup } = useSelection();
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [range, setRange] = useState<DateRange>({
    from: "2026-03-01",
    to: "2026-04-30",
  });
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transactionAccount, setTransactionAccount] = useState(accountOptions[0]);
  const [transactionType, setTransactionType] = useState("Income");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState("2026-04-20");
  const [transactionCurrency, setTransactionCurrency] = useState("USD");
  const [transferFromAccount, setTransferFromAccount] = useState(accountOptions[0]);
  const [transferToAccount, setTransferToAccount] = useState(
    accountOptions[1] ?? accountOptions[0],
  );
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState("2026-04-20");
  const [transferCurrency, setTransferCurrency] = useState("USD");
  const [transferNote, setTransferNote] = useState("");
  const [transactions, setTransactions] = useState<
    {
      date: string;
      account: string;
      type: string;
      amount: number;
      currency: string;
      status: string;
      reconciled: boolean;
    }[]
  >([
    {
      date: "2026-04-18",
      account: "Primary Account",
      type: "Income",
      amount: 2400,
      currency: "USD",
      status: "Cleared",
      reconciled: true,
    },
    {
      date: "2026-04-16",
      account: "Retirement",
      type: "Expense",
      amount: 320,
      currency: "USD",
      status: "Scheduled",
      reconciled: false,
    },
  ]);

  const accountGroups: Record<string, string> = {
    "Primary Account": "Cashflow",
    Retirement: "Investments",
    "Side Hustle": "Cashflow",
  };
  const matchesSelection = (account: string) =>
    (selectedAccount === "All Accounts" || selectedAccount === account) &&
    (selectedGroup === "All Groups" || accountGroups[account] === selectedGroup);
  const filteredTransactions = transactions.filter((row) =>
    matchesSelection(row.account),
  );

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Transactions</h1>
          <p className="muted">Review income and expenses across accounts.</p>
        </div>
        <div className="toolbar">
          <DateRangePicker value={range} onChange={setRange} />
          <button
            className="pill"
            onClick={() => showToast("Export queued", "Transactions will download shortly.")}
          >
            Export CSV
          </button>
          <button
            className="pill primary"
            onClick={() => setIsTransactionOpen(true)}
          >
            Add Transaction
          </button>
          <button className="pill" onClick={() => setIsTransferOpen(true)}>
            New Transfer
          </button>
        </div>
      </header>
      <Modal
        title="New transaction"
        description="Capture scheduled or manual activity for this period."
        isOpen={isTransactionOpen}
        onClose={() => setIsTransactionOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsTransactionOpen(false)}>
              Cancel
            </button>
            <button
              className="pill primary"
              type="button"
              onClick={() => {
                const amount = Number(transactionAmount);
                if (!amount) {
                  showToast("Missing amount", "Enter a transaction amount to save.");
                  return;
                }
                  setTransactions((prev) => [
                    {
                      date: transactionDate,
                      account: transactionAccount,
                      type: transactionType,
                      amount,
                      currency: transactionCurrency,
                      status: "Cleared",
                      reconciled: false,
                    },
                    ...prev,
                  ]);
                setIsTransactionOpen(false);
                setTransactionAmount("");
                showToast("Transaction saved", "Your entry has been recorded.");
              }}
            >
              Save Transaction
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label>
            Account
            <select
              value={transactionAccount}
              onChange={(event) => setTransactionAccount(event.target.value)}
            >
              {accountOptions.map((account) => (
                <option key={account} value={account}>
                  {account}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={transactionType}
              onChange={(event) => setTransactionType(event.target.value)}
            >
              {["Income", "Expense"].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input
              type="number"
              placeholder="0.00"
              value={transactionAmount}
              onChange={(event) => setTransactionAmount(event.target.value)}
            />
          </label>
          <label>
            Currency
            <select
              value={transactionCurrency}
              onChange={(event) => setTransactionCurrency(event.target.value)}
            >
              {supportedCurrencies.map((currencyOption) => (
                <option key={currencyOption} value={currencyOption}>
                  {currencyOption}
                </option>
              ))}
            </select>
          </label>
          <label>
            Occurred on
            <input
              type="date"
              value={transactionDate}
              onChange={(event) => setTransactionDate(event.target.value)}
            />
          </label>
        </div>
      </Modal>
      <Modal
        title="New transfer"
        description="Move funds between accounts and track transfer status."
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsTransferOpen(false)}>
              Cancel
            </button>
            <button
              className="pill primary"
              type="button"
              onClick={() => {
                const amount = Number(transferAmount);
                if (!amount) {
                  showToast("Missing amount", "Enter a transfer amount to continue.");
                  return;
                }
                if (transferFromAccount === transferToAccount) {
                  showToast("Choose two accounts", "Transfers require distinct accounts.");
                  return;
                }
                const transferRows = [
                  {
                    date: transferDate,
                    account: transferFromAccount,
                    type: "Transfer Out",
                    amount: -Math.abs(amount),
                    currency: transferCurrency,
                    status: "Scheduled",
                    reconciled: false,
                  },
                  {
                    date: transferDate,
                    account: transferToAccount,
                    type: "Transfer In",
                    amount: Math.abs(amount),
                    currency: transferCurrency,
                    status: "Scheduled",
                    reconciled: false,
                  },
                ];
                setTransactions((prev) => [...transferRows, ...prev]);
                setIsTransferOpen(false);
                setTransferAmount("");
                setTransferNote("");
                showToast(
                  "Transfer created",
                  transferNote
                    ? `${transferNote} has been staged for reconciliation.`
                    : "Two transfer entries have been staged.",
                );
              }}
            >
              Save Transfer
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label>
            From account
            <select
              value={transferFromAccount}
              onChange={(event) => setTransferFromAccount(event.target.value)}
            >
              {accountOptions.map((account) => (
                <option key={account} value={account}>
                  {account}
                </option>
              ))}
            </select>
          </label>
          <label>
            To account
            <select
              value={transferToAccount}
              onChange={(event) => setTransferToAccount(event.target.value)}
            >
              {accountOptions.map((account) => (
                <option key={account} value={account}>
                  {account}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount
            <input
              type="number"
              placeholder="0.00"
              value={transferAmount}
              onChange={(event) => setTransferAmount(event.target.value)}
            />
          </label>
          <label>
            Currency
            <select
              value={transferCurrency}
              onChange={(event) => setTransferCurrency(event.target.value)}
            >
              {supportedCurrencies.map((currencyOption) => (
                <option key={currencyOption} value={currencyOption}>
                  {currencyOption}
                </option>
              ))}
            </select>
          </label>
          <label>
            Occurred on
            <input
              type="date"
              value={transferDate}
              onChange={(event) => setTransferDate(event.target.value)}
            />
          </label>
          <label>
            Note
            <input
              type="text"
              placeholder="Payroll sweep"
              value={transferNote}
              onChange={(event) => setTransferNote(event.target.value)}
            />
          </label>
        </div>
      </Modal>
      {toast && <ActionToast toast={toast} onDismiss={() => setToast(null)} />}
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Recurring schedules</h3>
            <p className="muted">Automate salaries, rent, and subscriptions.</p>
          </div>
          <button
            className="pill primary"
            onClick={() => showToast("Schedule opened", "Choose cadence and amount.")}
          >
            Schedule recurring
          </button>
        </div>
        <div className="list-row list-header columns-4">
          <span>Name</span>
          <span>Cadence</span>
          <span>Next run</span>
          <span>Status</span>
        </div>
        {[
          {
            name: "Salary",
            cadence: "Monthly",
            next: "2026-05-01",
            status: "Active",
          },
          {
            name: "Rent",
            cadence: "Monthly",
            next: "2026-04-30",
            status: "Active",
          },
        ].map((row) => (
          <div className="list-row columns-4" key={row.name}>
            <span>{row.name}</span>
            <span>{row.cadence}</span>
            <span>{row.next}</span>
            <span className="status">{row.status}</span>
          </div>
        ))}
      </div>
      <div className="card list-card">
        <div className="list-row list-header columns-6">
          <span>Date</span>
          <span>Account</span>
          <span>Type</span>
          <span>Amount ({displayCurrency})</span>
          <span>Status</span>
          <span>Reconciled</span>
        </div>
        {filteredTransactions.map((row, index) => (
          <div className="list-row columns-6" key={`${row.date}-${row.amount}-${row.account}`}>
            <span>{row.date}</span>
            <span>{row.account}</span>
            <span>{row.type}</span>
            <span className="amount-cell">
              <span>
                {formatCurrency(
                  convertAmount(row.amount, row.currency, displayCurrency),
                  displayCurrency,
                )}
              </span>
              <span className="subtext">
                {formatCurrency(row.amount, row.currency)} {row.currency}
              </span>
            </span>
            <span className="status">{row.status}</span>
            <label className="status">
              <input
                type="checkbox"
                checked={row.reconciled}
                onChange={(event) => {
                  const reconciled = event.target.checked;
                  setTransactions((prev) =>
                    prev.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, reconciled } : entry,
                    ),
                  );
                }}
              />
              {row.reconciled ? "Yes" : "No"}
            </label>
          </div>
        ))}
      </div>
    </section>
  );
}
