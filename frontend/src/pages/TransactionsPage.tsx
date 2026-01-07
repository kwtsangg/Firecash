import { useEffect, useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import Modal from "../components/Modal";
import { useCurrency } from "../components/CurrencyContext";
import { useSelection } from "../components/SelectionContext";
import { del, get, post, put } from "../utils/apiClient";
import { readCategories } from "../utils/categories";
import { convertAmount, formatCurrency, supportedCurrencies } from "../utils/currency";
import {
  formatDateDisplay,
  getDefaultRange,
  parseDateInput,
  toDateInputValue,
  toIsoDateTime,
} from "../utils/date";
import { pageTitles } from "../utils/pageTitles";

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
  id: string;
  accountId: string;
  date: string;
  account: string;
  type: string;
  category: string;
  amount: number;
  currency: string;
  status: string;
};

export default function TransactionsPage() {
  const { currency: displayCurrency } = useCurrency();
  const { account: selectedAccount, group: selectedGroup } = useSelection();
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [range, setRange] = useState<DateRange>(() => getDefaultRange(30));
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [transactionAccount, setTransactionAccount] = useState("");
  const [transactionType, setTransactionType] = useState("Income");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(() => toDateInputValue(new Date()));
  const [transactionCurrency, setTransactionCurrency] = useState("USD");
  const [transactionCategory, setTransactionCategory] = useState("General");
  const [categories, setCategories] = useState<string[]>(() => readCategories());
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [pendingEdits, setPendingEdits] = useState<Record<string, Partial<TransactionRow>>>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
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
        setTransactionAccount(accountsResponse[0]?.id ?? "");
        setTransactions(
          transactionsResponse.map((transaction) => ({
            id: transaction.id,
            accountId: transaction.account_id,
            date: transaction.occurred_at.split("T")[0],
            account: accountMap.get(transaction.account_id) ?? "Unknown",
            type: transaction.transaction_type === "income" ? "Income" : "Expense",
            category: "Uncategorized",
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
    () => accounts.map((account) => ({ id: account.id, name: account.name })),
    [accounts],
  );

  const accountGroups: Record<string, string> = useMemo(() => {
    return accountOptions.reduce<Record<string, string>>((acc, accountName) => {
      acc[accountName.name] = "Ungrouped";
      return acc;
    }, {});
  }, [accountOptions]);

  useEffect(() => {
    if (isTransactionOpen) {
      setCategories(readCategories());
    }
  }, [isTransactionOpen]);

  useEffect(() => {
    if (!categories.includes(transactionCategory)) {
      setTransactionCategory(categories[0] ?? "General");
    }
  }, [categories, transactionCategory]);

  const matchesSelection = (account: string) =>
    (selectedAccount === "All Accounts" || selectedAccount === account) &&
    (selectedGroup === "All Groups" || accountGroups[account] === selectedGroup);
  const filteredTransactions = transactions.filter((row) => {
    if (!matchesSelection(row.account)) {
      return false;
    }
    const rowDate = parseDateInput(row.date);
    return rowDate >= parseDateInput(range.from) && rowDate <= parseDateInput(range.to);
  });
  const transactionTotal = filteredTransactions.reduce((sum, row) => {
    const signedAmount = row.type === "Expense" ? -row.amount : row.amount;
    return sum + convertAmount(signedAmount, row.currency, displayCurrency);
  }, 0);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const updatePending = (row: TransactionRow, updates: Partial<TransactionRow>) => {
    setPendingEdits((prev) => {
      const next = { ...prev };
      const merged = { ...row, ...prev[row.id], ...updates };
      const isUnchanged =
        merged.date === row.date &&
        merged.accountId === row.accountId &&
        merged.type === row.type &&
        merged.category === row.category &&
        merged.amount === row.amount &&
        merged.currency === row.currency;
      if (isUnchanged) {
        delete next[row.id];
      } else {
        next[row.id] = merged;
      }
      return next;
    });
  };

  const toggleTransactionSelection = (id: string) => {
    setSelectedTransactions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const pendingEditsList = Object.entries(pendingEdits);

  const applyPendingChanges = async () => {
    if (pendingEditsList.length === 0 && selectedTransactions.size === 0) {
      showToast("No changes", "There are no edits to apply.");
      return;
    }
    try {
      if (pendingEditsList.length > 0) {
        await Promise.all(
          pendingEditsList.map(async ([id, updates]) => {
            const payload: Record<string, unknown> = {};
            if (updates.accountId) {
              payload.account_id = updates.accountId;
            }
            if (updates.amount !== undefined) {
              payload.amount = updates.amount;
            }
            if (updates.currency) {
              payload.currency_code = updates.currency;
            }
            if (updates.type) {
              payload.transaction_type = updates.type.toLowerCase();
            }
            if (updates.date) {
              payload.occurred_at = toIsoDateTime(updates.date);
            }
            if (Object.keys(payload).length > 0) {
              await put(`/api/transactions/${id}`, payload);
            }
          }),
        );
        setTransactions((prev) =>
          prev.map((row) => {
            const updates = pendingEdits[row.id];
            if (!updates) {
              return row;
            }
            return {
              ...row,
              ...updates,
              account: updates.account ?? row.account,
            };
          }),
        );
        setPendingEdits({});
      }
      if (selectedTransactions.size > 0) {
        await Promise.all(
          Array.from(selectedTransactions).map((id) => del(`/api/transactions/${id}`)),
        );
        setTransactions((prev) =>
          prev.filter((row) => !selectedTransactions.has(row.id)),
        );
        setSelectedTransactions(new Set());
      }
      showToast("Changes applied", "Your updates have been saved.");
    } catch (err) {
      showToast("Update failed", "Unable to apply the requested changes.");
    } finally {
      setIsReviewOpen(false);
    }
  };

  const handleSaveTransaction = async () => {
    const amount = Number(transactionAmount);
    if (!amount) {
      showToast("Missing amount", "Enter a transaction amount to save.");
      return;
    }
    if (!transactionAccount) {
      showToast("Missing account", "Select an account to save this transaction.");
      return;
    }
    const accountName = accounts.find((account) => account.id === transactionAccount)?.name ?? "Unknown";
    try {
      const created = await post<Transaction>("/api/transactions", {
        account_id: transactionAccount,
        amount,
        currency_code: transactionCurrency,
        transaction_type: transactionType.toLowerCase(),
        description: null,
        occurred_at: toIsoDateTime(transactionDate),
      });
      setTransactions((prev) => [
        {
          id: created.id,
          accountId: created.account_id,
          date: created.occurred_at.split("T")[0],
          account: accountName,
          type: created.transaction_type === "income" ? "Income" : "Expense",
          category: transactionCategory,
          amount: created.amount,
          currency: created.currency_code,
          status: "Cleared",
        },
        ...prev,
      ]);
      setIsTransactionOpen(false);
      setTransactionAmount("");
      showToast("Transaction saved", "Your entry has been recorded.");
    } catch (err) {
      showToast("Save failed", "Unable to save this transaction.");
    }
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
          <h1>{pageTitles.transactions}</h1>
          <p className="muted">Review income and expenses across accounts.</p>
        </div>
        <div className="toolbar">
          <DateRangePicker value={range} onChange={setRange} />
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
              onClick={handleSaveTransaction}
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
              {accountOptions.length === 0 ? (
                <option value="" disabled>
                  No accounts available
                </option>
              ) : (
                accountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))
              )}
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
            Category
            <select
              value={transactionCategory}
              onChange={(event) => setTransactionCategory(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
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
        title="Confirm transaction changes"
        description="Review the edits before applying."
        isOpen={isReviewOpen}
        onClose={() => setIsReviewOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsReviewOpen(false)}>
              Cancel
            </button>
            <button className="pill primary" type="button" onClick={applyPendingChanges}>
              Apply changes
            </button>
          </>
        }
      >
        <div className="confirm-list">
          {pendingEditsList.length === 0 && selectedTransactions.size === 0 ? (
            <p className="muted">No changes pending.</p>
          ) : (
            <>
              {pendingEditsList.length > 0 ? (
                <div className="confirm-section">
                  <h4>Edits</h4>
                  <ul>
                    {pendingEditsList.map(([id, updates]) => {
                      const row = transactions.find((item) => item.id === id);
                      return (
                        <li key={id}>
                          {row?.account ?? "Transaction"} on {formatDateDisplay(row?.date ?? "")}
                          {updates.amount !== undefined ? ` → ${updates.amount}` : ""}
                          {updates.category ? `, ${updates.category}` : ""}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              {selectedTransactions.size > 0 ? (
                <div className="confirm-section">
                  <h4>Deletions</h4>
                  <ul>
                    {Array.from(selectedTransactions).map((id) => {
                      const row = transactions.find((item) => item.id === id);
                      return (
                        <li key={id}>
                          {row?.account ?? "Transaction"} ·{" "}
                          {formatDateDisplay(row?.date ?? "")}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </>
          )}
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
              <span>{formatDateDisplay(row.next_occurs_at)}</span>
              <span className="status">Active</span>
            </div>
          ))
        )}
      </div>
      <div className="card list-card">
        <div className="list-actions">
          <button
            className="pill"
            type="button"
            onClick={() => {
              setIsEditMode((prev) => !prev);
              setSelectedTransactions(new Set());
              setPendingEdits({});
            }}
          >
            {isEditMode ? "Exit edit mode" : "Edit transactions"}
          </button>
          {isEditMode ? (
            <>
              <button
                className="pill"
                type="button"
                onClick={() =>
                  setSelectedTransactions(
                    new Set(filteredTransactions.map((row) => row.id)),
                  )
                }
              >
                Select all
              </button>
              <button className="pill" type="button" onClick={() => setIsReviewOpen(true)}>
                Review changes
              </button>
            </>
          ) : null}
        </div>
        <div className={`list-row list-header ${isEditMode ? "columns-7" : "columns-6"}`}>
          {isEditMode ? <span /> : null}
          <span>Date</span>
          <span>Account</span>
          <span>Type</span>
          <span>Category</span>
          <span>Amount ({displayCurrency})</span>
          <span>Status</span>
        </div>
        {filteredTransactions.length === 0 ? (
          <div className={`list-row ${isEditMode ? "columns-7" : "columns-6"} empty-state`}>
            No transactions available.
          </div>
        ) : (
          <>
            {filteredTransactions.map((row) => {
              const pending = pendingEdits[row.id];
              const isSelected = selectedTransactions.has(row.id);
              const isEdited = Boolean(pending);
              return (
                <div
                  className={`list-row ${isEditMode ? "columns-7" : "columns-6"} ${
                    isSelected ? "row-selected" : ""
                  } ${isEdited ? "row-edited" : ""}`}
                  key={row.id}
                >
                  {isEditMode ? (
                    <span>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTransactionSelection(row.id)}
                      />
                    </span>
                  ) : null}
                  <span>
                  {isEditMode ? (
                    <input
                      type="date"
                      value={pending?.date ?? row.date}
                      onChange={(event) =>
                        updatePending(row, { date: event.target.value })
                      }
                    />
                  ) : (
                    formatDateDisplay(row.date)
                  )}
                </span>
                <span>
                  {isEditMode ? (
                    <select
                      value={pending?.accountId ?? row.accountId}
                      onChange={(event) =>
                        updatePending(row, {
                          accountId: event.target.value,
                          account:
                            accountOptions.find((account) => account.id === event.target.value)
                              ?.name ?? row.account,
                        })
                      }
                    >
                        {accountOptions.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.account
                    )}
                  </span>
                  <span>
                    {isEditMode ? (
                      <select
                        value={pending?.type ?? row.type}
                        onChange={(event) =>
                          updatePending(row, { type: event.target.value })
                        }
                      >
                        {["Income", "Expense"].map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.type
                    )}
                  </span>
                  <span>
                    {isEditMode ? (
                      <select
                        value={pending?.category ?? row.category}
                        onChange={(event) =>
                          updatePending(row, { category: event.target.value })
                        }
                      >
                        {categories.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.category
                    )}
                  </span>
                  <span className="amount-cell">
                    {isEditMode ? (
                      <input
                        type="number"
                        value={pending?.amount ?? row.amount}
                        onChange={(event) =>
                          updatePending(row, { amount: Number(event.target.value) })
                        }
                      />
                    ) : (
                      <>
                        <span>
                          {formatCurrency(
                            convertAmount(row.amount, row.currency, displayCurrency),
                            displayCurrency,
                          )}
                        </span>
                        <span className="subtext">
                          {formatCurrency(row.amount, row.currency)} {row.currency}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="status">{row.status}</span>
                </div>
              );
            })}
            <div className={`list-row ${isEditMode ? "columns-7" : "columns-6"} summary-row`}>
              <span>Total</span>
              <span>-</span>
              <span>-</span>
              <span>-</span>
              <span>{formatCurrency(transactionTotal, displayCurrency)}</span>
              <span>-</span>
              {isEditMode ? <span>-</span> : null}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
