import { useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import { BarChart, DonutChart, LineChart } from "../components/Charts";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import KpiCard from "../components/KpiCard";
import Modal from "../components/Modal";
import { useCurrency } from "../components/CurrencyContext";
import { convertAmount, formatCurrency, supportedCurrencies } from "../utils/currency";

export default function DashboardPage() {
  const accountOptions = ["Primary Account", "Retirement", "Side Hustle"];
  const budgetCategories = ["Housing", "Investing", "Lifestyle", "Bills"];
  const { currency: displayCurrency } = useCurrency();
  const [range, setRange] = useState<DateRange>({
    from: "2024-01-01",
    to: "2024-12-31",
  });
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [transactionAccount, setTransactionAccount] = useState(accountOptions[0]);
  const [transactionType, setTransactionType] = useState("Income");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState("2024-04-20");
  const [transactionNotes, setTransactionNotes] = useState("");
  const [transactionCurrency, setTransactionCurrency] = useState("USD");
  const [budgetCategory, setBudgetCategory] = useState(budgetCategories[0]);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetStart, setBudgetStart] = useState("2024-04-01");
  const [transactions, setTransactions] = useState<
    {
      account: string;
      type: string;
      amount: number;
      currency: string;
      date: string;
      notes: string;
    }[]
  >([
    {
      account: "Primary Account",
      type: "Income",
      amount: 2400,
      currency: "USD",
      date: "2024-04-18",
      notes: "Salary",
    },
    {
      account: "Retirement",
      type: "Expense",
      amount: 320,
      currency: "USD",
      date: "2024-04-16",
      notes: "Broker fee",
    },
  ]);

  const baseAssets = useMemo(
    () => [
      { name: "Cash", amount: 42000, currency: "USD" },
      { name: "Brokerage", amount: 56000, currency: "USD" },
      { name: "Vacation Fund", amount: 18000, currency: "EUR" },
    ],
    [],
  );

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const baseSeries = useMemo(
    () => [
      { date: "2024-01-15", value: 52 },
      { date: "2024-02-10", value: 60 },
      { date: "2024-03-05", value: 68 },
      { date: "2024-03-26", value: 64 },
      { date: "2024-04-12", value: 71 },
      { date: "2024-05-01", value: 78 },
      { date: "2024-05-21", value: 83 },
      { date: "2024-06-14", value: 79 },
      { date: "2024-07-02", value: 88 },
      { date: "2024-08-06", value: 94 },
      { date: "2024-09-17", value: 102 },
      { date: "2024-11-04", value: 110 },
    ],
    [],
  );
  const linePoints = useMemo(() => {
    const fromDate = new Date(range.from);
    const toDate = new Date(range.to);
    const multiplier = 1 + refreshTick * 0.01;
    const filtered = baseSeries
      .filter((point) => {
        const date = new Date(point.date);
        return date >= fromDate && date <= toDate;
      });
    const series = filtered.length > 0 ? filtered : baseSeries;
    return series.map((point) => Math.round(point.value * multiplier));
  }, [baseSeries, range.from, range.to, refreshTick]);
  const barValues = useMemo(
    () => [
      { label: "Mon", value: 10 },
      { label: "Tue", value: 18 },
      { label: "Wed", value: 14 },
      { label: "Thu", value: 24 },
      { label: "Fri", value: 20 },
      { label: "Sat", value: 9 },
      { label: "Sun", value: 12 },
    ],
    [],
  );
  const donutValues = useMemo(
    () => [
      { label: "Brokerage", value: 42, color: "#7f5bff" },
      { label: "Retirement", value: 28, color: "#5b6cff" },
      { label: "Cash", value: 15, color: "#43d6b1" },
      { label: "Crypto", value: 9, color: "#f7b955" },
    ],
    [],
  );

  const totalAssets = baseAssets.reduce(
    (sum, asset) =>
      sum + convertAmount(asset.amount, asset.currency, displayCurrency),
    0,
  );
  const netIncome = transactions.reduce((sum, transaction) => {
    const signedAmount = transaction.type === "Expense" ? -transaction.amount : transaction.amount;
    return sum + convertAmount(signedAmount, transaction.currency, displayCurrency);
  }, 0);

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">
            Overview of your asset growth and daily performance.
          </p>
        </div>
        <div className="toolbar">
          <button className="pill primary" onClick={() => setIsTransactionOpen(true)}>
            Add Transaction
          </button>
          <button
            className="pill"
            onClick={() => {
              setRefreshTick((prev) => prev + 1);
              showToast("Price refresh queued", "Fetching latest quotes.");
            }}
          >
            Refresh Prices
          </button>
        </div>
      </header>
      <Modal
        title="Add transaction"
        description="Log income or expenses to keep your net worth accurate."
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
                    account: transactionAccount,
                    type: transactionType,
                    amount,
                    currency: transactionCurrency,
                    date: transactionDate,
                    notes: transactionNotes || "Manual entry",
                  },
                  ...prev,
                ]);
                setIsTransactionOpen(false);
                setTransactionAmount("");
                setTransactionNotes("");
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
            Date
            <input
              type="date"
              value={transactionDate}
              onChange={(event) => setTransactionDate(event.target.value)}
            />
          </label>
          <label>
            Notes
            <input
              type="text"
              placeholder="Salary, rent, dividends..."
              value={transactionNotes}
              onChange={(event) => setTransactionNotes(event.target.value)}
            />
          </label>
        </div>
      </Modal>
      <Modal
        title="Set budget"
        description="Plan monthly targets for a specific category."
        isOpen={isBudgetOpen}
        onClose={() => setIsBudgetOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsBudgetOpen(false)}>
              Cancel
            </button>
            <button
              className="pill primary"
              type="button"
              onClick={() => {
                setIsBudgetOpen(false);
                showToast("Budget saved", "Your target has been updated.");
              }}
            >
              Save Budget
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label>
            Category
            <select
              value={budgetCategory}
              onChange={(event) => setBudgetCategory(event.target.value)}
            >
              {budgetCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            Monthly amount
            <input
              type="number"
              placeholder="0.00"
              value={budgetAmount}
              onChange={(event) => setBudgetAmount(event.target.value)}
            />
          </label>
          <label>
            Start date
            <input
              type="date"
              value={budgetStart}
              onChange={(event) => setBudgetStart(event.target.value)}
            />
          </label>
        </div>
      </Modal>
      {toast && <ActionToast toast={toast} onDismiss={() => setToast(null)} />}
      <div className="card-grid">
        <KpiCard
          label="Total Assets"
          value={formatCurrency(totalAssets, displayCurrency)}
          trend="+4.2%"
          footnote="vs last period"
        />
        <KpiCard
          label="Net Income"
          value={formatCurrency(netIncome, displayCurrency)}
          trend={netIncome >= 0 ? "+12%" : "-6%"}
          footnote="This month"
        />
        <KpiCard
          label="Growth"
          value="+12.4%"
          trend="Stable"
          footnote="Year to date"
        />
      </div>
      <div className="card chart-card">
        <div className="chart-header">
          <div>
            <h3>Asset Growth</h3>
            <p className="muted">Track portfolio growth in your date range.</p>
          </div>
          <DateRangePicker value={range} onChange={setRange} />
        </div>
        <div className="chart-surface">
          <LineChart points={linePoints} />
        </div>
      </div>
      <div className="split-grid">
        <div className="card">
          <h3>Weekly Cashflow</h3>
          <p className="muted">Income vs expenses snapshot.</p>
          <BarChart values={barValues} />
        </div>
        <div className="card">
          <h3>Allocation</h3>
          <p className="muted">Account group distribution.</p>
          <DonutChart values={donutValues} />
          <div className="legend">
            {donutValues.map((item) => (
              <div key={item.label} className="legend-item">
                <span className="legend-dot" style={{ background: item.color }} />
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="card">
        <h3>Quick actions</h3>
        <div className="action-grid">
          <button
            className="pill"
            onClick={() => showToast("Export queued", "CSV export will download shortly.")}
          >
            Export CSV
          </button>
          <button
            className="pill"
            onClick={() => showToast("Group creator ready", "Name your new group.")}
          >
            Create Group
          </button>
          <button
            className="pill"
            onClick={() => setIsBudgetOpen(true)}
          >
            Set Budget
          </button>
          <button
            className="pill"
            onClick={() => showToast("Snapshot shared", "Link copied to clipboard.")}
          >
            Share Snapshot
          </button>
        </div>
      </div>
      <div className="card list-card">
        <div className="list-row list-header columns-5">
          <span>Date</span>
          <span>Account</span>
          <span>Type</span>
          <span>Amount ({displayCurrency})</span>
          <span>Notes</span>
        </div>
        {transactions.map((transaction) => (
          <div
            className="list-row columns-5"
            key={`${transaction.date}-${transaction.amount}-${transaction.notes}`}
          >
            <span>{transaction.date}</span>
            <span>{transaction.account}</span>
            <span>{transaction.type}</span>
            <span>
              {formatCurrency(
                convertAmount(transaction.amount, transaction.currency, displayCurrency),
                displayCurrency,
              )}
            </span>
            <span>{transaction.notes}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
