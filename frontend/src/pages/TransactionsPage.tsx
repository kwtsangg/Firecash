import { useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import Modal from "../components/Modal";
import { useCurrency } from "../components/CurrencyContext";
import { useSelection } from "../components/SelectionContext";
import { convertAmount, formatCurrency, supportedCurrencies } from "../utils/currency";

export default function TransactionsPage() {
  const accountOptions = ["Primary Account", "Retirement", "Side Hustle"];
  const categoryOptions = ["Housing", "Bills", "Lifestyle", "Investing"];
  const payeeOptions = ["City Utilities", "Green Grocer", "Payroll"];
  const { currency: displayCurrency } = useCurrency();
  const { account: selectedAccount, group: selectedGroup } = useSelection();
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [range, setRange] = useState<DateRange>({
    from: "2026-03-01",
    to: "2026-04-30",
  });
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [transactionAccount, setTransactionAccount] = useState(accountOptions[0]);
  const [transactionType, setTransactionType] = useState("Income");
  const [transactionCategory, setTransactionCategory] = useState(categoryOptions[0]);
  const [transactionPayee, setTransactionPayee] = useState(payeeOptions[0]);
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState("2026-04-20");
  const [transactionCurrency, setTransactionCurrency] = useState("USD");
  const [transactions, setTransactions] = useState<
    {
      date: string;
      account: string;
      category: string;
      payee: string;
      type: string;
      amount: number;
      currency: string;
      status: string;
    }[]
  >([
    {
      date: "2026-04-18",
      account: "Primary Account",
      category: "Lifestyle",
      payee: "Payroll",
      type: "Income",
      amount: 2400,
      currency: "USD",
      status: "Cleared",
    },
    {
      date: "2026-04-16",
      account: "Retirement",
      category: "Investing",
      payee: "City Utilities",
      type: "Expense",
      amount: 320,
      currency: "USD",
      status: "Scheduled",
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
                    category: transactionCategory,
                    payee: transactionPayee,
                    type: transactionType,
                    amount,
                    currency: transactionCurrency,
                    status: "Cleared",
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
            Category
            <select
              value={transactionCategory}
              onChange={(event) => setTransactionCategory(event.target.value)}
            >
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payee
            <select
              value={transactionPayee}
              onChange={(event) => setTransactionPayee(event.target.value)}
            >
              {payeeOptions.map((payee) => (
                <option key={payee} value={payee}>
                  {payee}
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
        <div className="list-row list-header columns-7">
          <span>Date</span>
          <span>Account</span>
          <span>Category</span>
          <span>Payee</span>
          <span>Type</span>
          <span>Amount ({displayCurrency})</span>
          <span>Status</span>
        </div>
        {filteredTransactions.map((row) => (
          <div
            className="list-row columns-7"
            key={`${row.date}-${row.amount}-${row.account}-${row.payee}`}
          >
            <span>{row.date}</span>
            <span>{row.account}</span>
            <span>{row.category}</span>
            <span>{row.payee}</span>
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
          </div>
        ))}
      </div>
    </section>
  );
}
