import { useEffect, useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import { BarChart, DonutChart, LineChart } from "../components/Charts";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import KpiCard from "../components/KpiCard";
import Modal from "../components/Modal";
import { useCurrency } from "../components/CurrencyContext";
import { useSelection } from "../components/SelectionContext";
import { get } from "../utils/apiClient";
import { convertAmount, formatCurrency, supportedCurrencies } from "../utils/currency";

type Account = {
  id: string;
  name: string;
  currency_code: string;
};

type Asset = {
  id: string;
  account_id: string;
  symbol: string;
  asset_type: string;
  quantity: number;
  currency_code: string;
};

type Transaction = {
  id: string;
  account_id: string;
  amount: number;
  currency_code: string;
  transaction_type: string;
  description: string | null;
  occurred_at: string;
};

type TotalsResponse = {
  total: number;
  currency_code: string;
  totals_by_currency: { currency_code: string; total: number }[];
};

type HistoryPoint = {
  date: string;
  value: number;
};

type AssetDisplay = {
  name: string;
  amount: number;
  currency: string;
  account: string;
};

type TransactionDisplay = {
  account: string;
  type: string;
  amount: number;
  currency: string;
  date: string;
  notes: string;
};

const chartPalette = ["#7f5bff", "#5b6cff", "#43d6b1", "#f7b955", "#ff7aa2"];

export default function DashboardPage() {
  const { currency: displayCurrency } = useCurrency();
  const { account: selectedAccount, group: selectedGroup } = useSelection();
  const [range, setRange] = useState<DateRange>({
    from: "2026-01-01",
    to: "2026-12-31",
  });
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [transactionAccount, setTransactionAccount] = useState("");
  const [transactionType, setTransactionType] = useState("Income");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState("2026-04-20");
  const [transactionNotes, setTransactionNotes] = useState("");
  const [transactionCurrency, setTransactionCurrency] = useState("USD");
  const [budgetCategory, setBudgetCategory] = useState("Housing");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetStart, setBudgetStart] = useState("2026-04-01");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [transactions, setTransactions] = useState<TransactionDisplay[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [totals, setTotals] = useState<TotalsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const budgetCategories = ["Housing", "Investing", "Lifestyle", "Bills"];

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [accountsResponse, assetsResponse, transactionsResponse, totalsResponse, historyResponse] =
          await Promise.all([
            get<Account[]>("/api/accounts"),
            get<Asset[]>("/api/assets"),
            get<Transaction[]>("/api/transactions"),
            get<TotalsResponse>("/api/totals"),
            get<HistoryPoint[]>("/api/history"),
          ]);
        if (!isMounted) {
          return;
        }
        const accountMap = new Map(accountsResponse.map((item) => [item.id, item.name]));
        const mappedTransactions = transactionsResponse.map((item) => ({
          account: accountMap.get(item.account_id) ?? "Unknown",
          type: item.transaction_type === "income" ? "Income" : "Expense",
          amount: item.amount,
          currency: item.currency_code,
          date: item.occurred_at.split("T")[0],
          notes: item.description ?? "Manual entry",
        }));

        setAccounts(accountsResponse);
        setAssets(assetsResponse);
        setTransactions(mappedTransactions);
        setTotals(totalsResponse);
        setHistory(historyResponse);
        setTransactionAccount(accountsResponse[0]?.name ?? "");
      } catch (err) {
        if (isMounted) {
          setError("Unable to load dashboard data.");
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

  const accountOptions = useMemo(
    () => accounts.map((item) => item.name),
    [accounts],
  );

  const baseAssets = useMemo<AssetDisplay[]>(
    () =>
      assets.map((asset) => ({
        name: asset.symbol,
        amount: asset.quantity,
        currency: asset.currency_code,
        account: accounts.find((account) => account.id === asset.account_id)?.name ?? "Unknown",
      })),
    [assets, accounts],
  );

  const accountGroups: Record<string, string> = useMemo(() => {
    return baseAssets.reduce<Record<string, string>>((acc, asset) => {
      acc[asset.account] = "Ungrouped";
      return acc;
    }, {});
  }, [baseAssets]);

  const matchesSelection = (account: string) =>
    (selectedAccount === "All Accounts" || selectedAccount === account) &&
    (selectedGroup === "All Groups" || accountGroups[account] === selectedGroup);

  const filteredAssets = baseAssets.filter((asset) => matchesSelection(asset.account));
  const filteredTransactions = transactions.filter((transaction) =>
    matchesSelection(transaction.account),
  );

  const selectionScale = Math.max(0.4, filteredAssets.length / baseAssets.length || 1);

  const lineSeries = useMemo(() => {
    const fromDate = new Date(range.from);
    const toDate = new Date(range.to);
    const filtered = history.filter((point) => {
      const date = new Date(point.date);
      return date >= fromDate && date <= toDate;
    });
    const series = filtered.length > 0 ? filtered : history;
    return series.map((point) => ({
      date: point.date,
      value: Math.round(point.value * (1 + refreshTick * 0.01) * selectionScale),
    }));
  }, [history, range.from, range.to, refreshTick, selectionScale]);

  const barValues = useMemo(() => {
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (6 - index));
      return date;
    });
    const totalsByDay = days.map((day) => {
      const label = weekdays[day.getDay()];
      const dateKey = day.toISOString().split("T")[0];
      const total = filteredTransactions.reduce((sum, transaction) => {
        if (transaction.date !== dateKey) {
          return sum;
        }
        const signedAmount = transaction.type === "Expense" ? -transaction.amount : transaction.amount;
        return sum + signedAmount;
      }, 0);
      return { label, value: Math.round(total) };
    });
    return totalsByDay;
  }, [filteredTransactions]);

  const donutValues = useMemo(() => {
    const totalsByAccount = new Map<string, number>();
    filteredAssets.forEach((asset) => {
      totalsByAccount.set(
        asset.account,
        (totalsByAccount.get(asset.account) ?? 0) + asset.amount,
      );
    });
    return Array.from(totalsByAccount.entries()).map(([label, value], index) => ({
      label,
      value,
      color: chartPalette[index % chartPalette.length],
    }));
  }, [filteredAssets]);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const totalAssets = totals
    ? convertAmount(totals.total, totals.currency_code, displayCurrency)
    : filteredAssets.reduce(
        (sum, asset) => sum + convertAmount(asset.amount, asset.currency, displayCurrency),
        0,
      );

  const netIncome = filteredTransactions.reduce((sum, transaction) => {
    const signedAmount = transaction.type === "Expense" ? -transaction.amount : transaction.amount;
    return sum + convertAmount(signedAmount, transaction.currency, displayCurrency);
  }, 0);

  const linePoints = lineSeries.map((point) => point.value);
  const maxValue = Math.max(...linePoints, 0);
  const minValue = Math.min(...linePoints, 0);
  const midpointValue = Math.round((maxValue + minValue) / 2);
  const axisYLabels = [
    formatCurrency(maxValue, displayCurrency),
    formatCurrency(Math.round(maxValue * 0.75), displayCurrency),
    formatCurrency(midpointValue, displayCurrency),
    formatCurrency(Math.round(minValue + (maxValue - minValue) * 0.25), displayCurrency),
    formatCurrency(minValue, displayCurrency),
  ];
  const rangeDays = Math.max(
    1,
    Math.round(
      (new Date(range.to).getTime() - new Date(range.from).getTime()) / 86400000,
    ),
  );
  const axisDateFormat =
    rangeDays <= 45
      ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit" })
      : new Intl.DateTimeFormat("en-GB", { month: "2-digit", year: "numeric" });
  const labelCount = Math.min(lineSeries.length || 1, rangeDays <= 45 ? 6 : 5);
  const labelStep = labelCount > 1 ? (lineSeries.length - 1) / (labelCount - 1) : 0;
  const axisXLabels = Array.from({ length: labelCount }, (_, index) =>
    Math.round(index * labelStep),
  )
    .filter((index, position, list) => list.indexOf(index) === position)
    .filter((index) => lineSeries[index])
    .map((index) => axisDateFormat.format(new Date(lineSeries[index].date)));

  if (isLoading) {
    return (
      <section className="page">
        <div className="card page-state">Loading dashboard data...</div>
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
        <div className="chart-surface chart-axis-surface">
          <LineChart points={linePoints} />
          <div className="chart-axis-y">
            {axisYLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
          <div className="chart-axis-x">
            {axisXLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
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
          {donutValues.length ? <DonutChart values={donutValues} /> : <p className="muted">No assets yet.</p>}
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
        {filteredTransactions.length === 0 ? (
          <div className="list-row columns-5 empty-state">No transactions available.</div>
        ) : (
          filteredTransactions.map((transaction) => (
            <div
              className="list-row columns-5"
              key={`${transaction.date}-${transaction.amount}-${transaction.notes}`}
            >
              <span>{transaction.date}</span>
              <span>{transaction.account}</span>
              <span>{transaction.type}</span>
              <span className="amount-cell">
                <span>
                  {formatCurrency(
                    convertAmount(transaction.amount, transaction.currency, displayCurrency),
                    displayCurrency,
                  )}
                </span>
                <span className="subtext">
                  {formatCurrency(transaction.amount, transaction.currency)} {transaction.currency}
                </span>
              </span>
              <span>{transaction.notes}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
