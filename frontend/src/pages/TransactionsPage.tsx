import { useEffect, useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import Modal from "../components/Modal";
import { useCurrency } from "../components/CurrencyContext";
import { useSelection } from "../components/SelectionContext";
import { get } from "../utils/apiClient";
import { convertAmount, formatCurrency, supportedCurrencies } from "../utils/currency";

type Account = {
  id: string;
  name: string;
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

type RecurringTransaction = {
  id: string;
  account_id: string;
  amount: number;
  currency_code: string;
  transaction_type: string;
  description: string | null;
  interval_days: number;
  next_occurs_at: string;
};

type TransactionRow = {
  date: string;
  account: string;
  type: string;
  amount: number;
  currency: string;
  status: string;
};

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
  const [transactionAccount, setTransactionAccount] = useState("");
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
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [accountsResponse, transactionsResponse, recurringResponse] = await Promise.all([
          get<Account[]>("/api/accounts"),
          get<Transaction[]>("/api/transactions"),
          get<RecurringTransaction[]>("/api/recurring-transactions"),
        ]);
        if (!isMounted) {
          return;
        }
        const accountMap = new Map(accountsResponse.map((item) => [item.id, item.name]));
        setAccounts(accountsResponse);
        setRecurringTransactions(recurringResponse);
        setTransactionAccount(accountsResponse[0]?.name ?? "");
        setTransactions(
          transactionsResponse.map((transaction) => ({
            date: transaction.occurred_at.split("T")[0],
            account: accountMap.get(transaction.account_id) ?? "Unknown",
            type: transaction.transaction_type === "income" ? "Income" : "Expense",
            amount: transaction.amount,
            currency: transaction.currency_code,
            status: "Cleared",
          })),
        );
      } catch (err) {
        if (isMounted) {
          setError("Unable to load transactions.");
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
    () => accounts.map((account) => account.name),
    [accounts],
  );

  const accountGroups: Record<string, string> = useMemo(() => {
    return accountOptions.reduce<Record<string, string>>((acc, accountName) => {
      acc[accountName] = "Ungrouped";
      return acc;
    }, {});
  }, [accountOptions]);

  const matchesSelection = (account: string) =>
    (selectedAccount === "All Accounts" || selectedAccount === account) &&
    (selectedGroup === "All Groups" || accountGroups[account] === selectedGroup);
  const filteredTransactions = transactions.filter((row) => matchesSelection(row.account));

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  if (isLoading) {
    return (
      <section className="page">
        <div className="card page-state">Loading transactions...</div>
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
        {recurringTransactions.length === 0 ? (
          <div className="list-row columns-4 empty-state">No recurring schedules.</div>
        ) : (
          recurringTransactions.map((row) => (
            <div className="list-row columns-4" key={row.id}>
              <span>{row.description ?? "Recurring transaction"}</span>
              <span>{`Every ${row.interval_days} days`}</span>
              <span>{row.next_occurs_at.split("T")[0]}</span>
              <span className="status">Active</span>
            </div>
          ))
        )}
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
        {filteredTransactions.length === 0 ? (
          <div className="list-row columns-5 empty-state">No transactions available.</div>
        ) : (
          filteredTransactions.map((row) => (
            <div className="list-row columns-5" key={`${row.date}-${row.amount}-${row.account}`}>
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
            </div>
          ))
        )}
      </div>
    </section>
  );
}
