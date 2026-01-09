import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingSkeleton from "../components/LoadingSkeleton";
import Modal from "../components/Modal";
import { useCurrency } from "../components/CurrencyContext";
import { useSelection } from "../components/SelectionContext";
import {
  fetchAccountGroupMemberships,
  fetchAccountGroups,
} from "../api/accountGroups";
import { fetchPreferences } from "../api/preferences";
import { fetchTransactions } from "../api/transactions";
import { del, get, post, put } from "../utils/apiClient";
import { convertAmount, formatCurrency, supportedCurrencies } from "../utils/currency";
import {
  formatDateDisplay,
  formatDateInputValue,
  getDefaultRange,
  parseDateInput,
  toDateInputValue,
  toIsoDateInput,
  toIsoDateTime,
} from "../utils/date";
import { formatApiErrorDetail, getFriendlyErrorMessage } from "../utils/errorMessages";
import { pageTitles } from "../utils/pageTitles";
import { usePageMeta } from "../utils/pageMeta";

type Account = {
  id: string;
  name: string;
};

type AccountGroup = {
  id: string;
  name: string;
};

type AccountGroupMembership = {
  account_id: string;
  group_id: string;
};

type Transaction = {
  id: string;
  account_id: string;
  amount: number;
  currency_code: string;
  transaction_type: string;
  category: string;
  merchant: string | null;
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
  is_enabled: boolean;
};

type TransactionRow = {
  id: string;
  accountId: string;
  date: string;
  account: string;
  type: string;
  category: string;
  merchant: string;
  amount: number;
  currency: string;
  status: string;
};

export default function TransactionsPage() {
  usePageMeta({ title: pageTitles.transactions });
  const { currency: displayCurrency } = useCurrency();
  const { account: selectedAccount, group: selectedGroup } = useSelection();
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [range, setRange] = useState<DateRange>(() => getDefaultRange(30));
  const [isTransactionOpen, setIsTransactionOpen] = useState(false);
  const [transactionAccount, setTransactionAccount] = useState("");
  const [transactionType, setTransactionType] = useState("Income");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState(() =>
    formatDateInputValue(toDateInputValue(new Date()))
  );
  const [transactionCurrency, setTransactionCurrency] = useState("USD");
  const [transactionCategory, setTransactionCategory] = useState("General");
  const [transactionMerchant, setTransactionMerchant] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [isRecurringOpen, setIsRecurringOpen] = useState(false);
  const [recurringEditingId, setRecurringEditingId] = useState<string | null>(null);
  const [recurringAccount, setRecurringAccount] = useState("");
  const [recurringAmount, setRecurringAmount] = useState("");
  const [recurringCurrency, setRecurringCurrency] = useState("USD");
  const [recurringType, setRecurringType] = useState("Income");
  const [recurringDescription, setRecurringDescription] = useState("");
  const [recurringInterval, setRecurringInterval] = useState("30");
  const [recurringNextDate, setRecurringNextDate] = useState(() => toDateInputValue(new Date()));
  const [recurringIsEnabled, setRecurringIsEnabled] = useState(true);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [isRecurringSaving, setIsRecurringSaving] = useState(false);
  const [recurringActionIds, setRecurringActionIds] = useState<Set<string>>(new Set());
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [memberships, setMemberships] = useState<AccountGroupMembership[]>([]);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());
  const [pendingEdits, setPendingEdits] = useState<Record<string, Partial<TransactionRow>>>({});
  const [isEditMode, setIsEditMode] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkMerchant, setBulkMerchant] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isFiltering, setIsFiltering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [isPreferencesLoading, setIsPreferencesLoading] = useState(true);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryFilter = searchParams.get("category") ?? "All";
  const merchantFilter = searchParams.get("merchant") ?? "";

  const loadData = useCallback(async () => {
    let isMounted = true;
    const run = async () => {
      setIsLoading(true);
      setError(null);
      setErrorDetails([]);
      try {
        const [
          accountsResponse,
          groupsResponse,
          membershipResponse,
          transactionsResponse,
          recurringResponse,
        ] = await Promise.all([
          get<Account[]>("/api/accounts"),
          fetchAccountGroups(),
          fetchAccountGroupMemberships(),
          fetchTransactions<Transaction[]>({
            category: categoryFilter !== "All" ? categoryFilter : undefined,
            merchant: merchantFilter || undefined,
          }),
          get<RecurringTransaction[]>("/api/recurring-transactions"),
        ]);
        if (!isMounted) {
          return;
        }
        const accountMap = new Map(accountsResponse.map((item) => [item.id, item.name]));
        setAccounts(accountsResponse);
        setGroups(groupsResponse);
        setMemberships(membershipResponse);
        setRecurringTransactions(recurringResponse);
        setTransactionAccount(accountsResponse[0]?.id ?? "");
        setRecurringAccount(accountsResponse[0]?.id ?? "");
        setTransactions(
          transactionsResponse.map((transaction) => ({
            id: transaction.id,
            accountId: transaction.account_id,
            date: transaction.occurred_at.split("T")[0],
            account: accountMap.get(transaction.account_id) ?? "Unknown",
            type: transaction.transaction_type === "income" ? "Income" : "Expense",
            category: transaction.category ?? "Uncategorized",
            merchant: transaction.merchant ?? "",
            amount: transaction.amount,
            currency: transaction.currency_code,
            status: "Cleared",
          })),
        );
      } catch (err) {
        if (isMounted) {
          setError("Unable to load transactions.");
          const detail = formatApiErrorDetail(err);
          setErrorDetails(detail ? [detail] : []);
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
  }, [categoryFilter, merchantFilter]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    loadData().then((result) => {
      cleanup = result;
    });
    return () => {
      cleanup?.();
    };
  }, [loadData]);

  const loadPreferences = useCallback(async () => {
    setIsPreferencesLoading(true);
    setPreferencesError(null);
    try {
      const response = await fetchPreferences();
      setCategories(response.categories);
      setTransactionCategory((prev) =>
        response.categories.includes(prev) ? prev : response.categories[0] ?? "General",
      );
    } catch (err) {
      setPreferencesError("Unable to load categories right now.");
    } finally {
      setIsPreferencesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const accountOptions = useMemo(
    () => accounts.map((account) => ({ id: account.id, name: account.name })),
    [accounts],
  );

  const accountGroups: Record<string, string> = useMemo(() => {
    const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
    const accountGroupById = memberships.reduce<Record<string, string>>((acc, membership) => {
      const groupName = groupNameById.get(membership.group_id);
      if (groupName) {
        acc[membership.account_id] = groupName;
      }
      return acc;
    }, {});
    return accounts.reduce<Record<string, string>>((acc, account) => {
      acc[account.name] = accountGroupById[account.id] ?? "Ungrouped";
      return acc;
    }, {});
  }, [accounts, groups, memberships]);

  useEffect(() => {
    if (isTransactionOpen) {
      loadPreferences();
    }
  }, [isTransactionOpen, loadPreferences]);

  useEffect(() => {
    if (isLoading) {
      return;
    }
    setIsFiltering(true);
    const timer = window.setTimeout(() => setIsFiltering(false), 350);
    return () => window.clearTimeout(timer);
  }, [isLoading, range.from, range.to, selectedAccount, selectedGroup, categoryFilter, merchantFilter]);

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
    const matchesDate =
      rowDate >= parseDateInput(range.from) && rowDate <= parseDateInput(range.to);
    const matchesCategory = categoryFilter === "All" || row.category === categoryFilter;
    const matchesMerchant = !merchantFilter
      || row.merchant.toLowerCase().includes(merchantFilter.toLowerCase());
    return matchesDate && matchesCategory && matchesMerchant;
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
        merged.merchant === row.merchant &&
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
      const wasSelected = next.has(id);
      if (wasSelected) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (!wasSelected) {
        setPendingEdits((prevEdits) => {
          if (!prevEdits[id]) {
            return prevEdits;
          }
          const nextEdits = { ...prevEdits };
          delete nextEdits[id];
          return nextEdits;
        });
      }
      return next;
    });
  };

  const applyBulkUpdates = () => {
    if (selectedTransactions.size === 0) {
      showToast("Select transactions", "Choose entries to apply bulk updates.");
      return;
    }
    if (!bulkCategory && !bulkMerchant.trim()) {
      showToast("No bulk changes", "Choose a category or merchant to apply.");
      return;
    }
    const updates: Partial<TransactionRow> = {};
    if (bulkCategory) {
      updates.category = bulkCategory;
    }
    if (bulkMerchant.trim()) {
      updates.merchant = bulkMerchant.trim();
    }
    setPendingEdits((prev) => {
      const next = { ...prev };
      selectedTransactions.forEach((id) => {
        const row = transactions.find((item) => item.id === id);
        if (row) {
          next[id] = { ...row, ...prev[id], ...updates };
        }
      });
      return next;
    });
    showToast("Bulk updates staged", "Review changes before applying.");
  };

  const pendingEditsList = useMemo(
    () => Object.entries(pendingEdits).filter(([id]) => !selectedTransactions.has(id)),
    [pendingEdits, selectedTransactions],
  );

  const applyPendingChanges = async () => {
    if (pendingEditsList.length === 0 && selectedTransactions.size === 0) {
      showToast("No changes", "There are no edits to apply.");
      return;
    }
    const pendingEditsToApply = Object.fromEntries(pendingEditsList);
    const previousRows = transactions;
    const previousEdits = pendingEdits;
    const previousSelection = selectedTransactions;
    const updatedRows = transactions
      .map((row) => {
        const updates = pendingEditsToApply[row.id] as Partial<TransactionRow> | undefined;
        if (!updates) {
          return row;
        }
        return {
          ...row,
          ...updates,
          account: updates.account ?? row.account,
        };
      })
      .filter((row) => !selectedTransactions.has(row.id));
    setTransactions(updatedRows);
    setPendingEdits({});
    setSelectedTransactions(new Set());
    setIsReviewOpen(false);
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
            if (updates.category) {
              payload.category = updates.category;
            }
            if (updates.merchant !== undefined) {
              payload.merchant = updates.merchant.trim() ? updates.merchant.trim() : null;
            }
            if (updates.date) {
              payload.occurred_at = toIsoDateTime(updates.date);
            }
            if (Object.keys(payload).length > 0) {
              await put(`/api/transactions/${id}`, payload);
            }
          }),
        );
      }
      if (selectedTransactions.size > 0) {
        await Promise.all(
          Array.from(selectedTransactions).map((id) => del(`/api/transactions/${id}`)),
        );
      }
      showToast("Changes applied", "Your updates have been saved.");
    } catch (err) {
      setTransactions(previousRows);
      setPendingEdits(previousEdits);
      setSelectedTransactions(previousSelection);
      setIsReviewOpen(true);
      showToast("Update failed", "Unable to apply the requested changes.");
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
    const accountName =
      accounts.find((account) => account.id === transactionAccount)?.name ?? "Unknown";
    const normalizedDate = toIsoDateInput(transactionDate);
    if (!normalizedDate) {
      showToast("Invalid date", "Use the YYYY/MM/DD format to save this transaction.");
      return;
    }
    const tempId = `temp-${Date.now()}`;
    const optimisticRow: TransactionRow = {
      id: tempId,
      accountId: transactionAccount,
      date: normalizedDate,
      account: accountName,
      type: transactionType,
      category: transactionCategory,
      merchant: transactionMerchant.trim(),
      amount,
      currency: transactionCurrency,
      status: "Pending",
    };
    setTransactions((prev) => [optimisticRow, ...prev]);
    setIsTransactionOpen(false);
    setTransactionAmount("");
    setTransactionMerchant("");
    try {
      const created = await post<Transaction>("/api/transactions", {
        account_id: transactionAccount,
        amount,
        currency_code: transactionCurrency,
        transaction_type: transactionType.toLowerCase(),
        category: transactionCategory,
        merchant: transactionMerchant.trim() ? transactionMerchant.trim() : null,
        description: null,
        occurred_at: toIsoDateTime(normalizedDate),
      });
      setTransactions((prev) =>
        prev.map((row) =>
          row.id === tempId
            ? {
                id: created.id,
                accountId: created.account_id,
                date: created.occurred_at.split("T")[0],
                account: accountName,
                type: created.transaction_type === "income" ? "Income" : "Expense",
                category: transactionCategory,
                merchant: transactionMerchant.trim(),
                amount: created.amount,
                currency: created.currency_code,
                status: "Cleared",
              }
            : row,
        ),
      );
      showToast("Transaction saved", "Your entry has been recorded.");
    } catch (err) {
      setTransactions((prev) => prev.filter((row) => row.id !== tempId));
      showToast("Save failed", "Unable to save this transaction.");
    }
  };

  const openCreateRecurring = () => {
    setRecurringEditingId(null);
    setRecurringAccount(accounts[0]?.id ?? "");
    setRecurringAmount("");
    setRecurringCurrency(transactionCurrency);
    setRecurringType("Income");
    setRecurringDescription("");
    setRecurringInterval("30");
    setRecurringNextDate(toDateInputValue(new Date()));
    setRecurringIsEnabled(true);
    setRecurringError(null);
    setIsRecurringOpen(true);
  };

  const openEditRecurring = (row: RecurringTransaction) => {
    setRecurringEditingId(row.id);
    setRecurringAccount(row.account_id);
    setRecurringAmount(String(row.amount));
    setRecurringCurrency(row.currency_code);
    setRecurringType(row.transaction_type === "income" ? "Income" : "Expense");
    setRecurringDescription(row.description ?? "");
    setRecurringInterval(String(row.interval_days));
    setRecurringNextDate(row.next_occurs_at.split("T")[0]);
    setRecurringIsEnabled(row.is_enabled);
    setRecurringError(null);
    setIsRecurringOpen(true);
  };

  const handleSaveRecurring = async () => {
    const amount = Number(recurringAmount);
    if (!amount) {
      setRecurringError("Enter a recurring amount.");
      return;
    }
    const intervalDays = Number(recurringInterval);
    if (!intervalDays || intervalDays <= 0) {
      setRecurringError("Set a valid cadence in days.");
      return;
    }
    if (!recurringAccount) {
      setRecurringError("Select an account for this schedule.");
      return;
    }
    setRecurringError(null);
    setIsRecurringSaving(true);
    const payload = {
      account_id: recurringAccount,
      amount,
      currency_code: recurringCurrency,
      transaction_type: recurringType.toLowerCase(),
      description: recurringDescription.trim() ? recurringDescription.trim() : null,
      interval_days: intervalDays,
      next_occurs_at: toIsoDateTime(recurringNextDate),
      is_enabled: recurringIsEnabled,
    };
    const isEdit = Boolean(recurringEditingId);
    const tempId = `temp-${Date.now()}`;
    const optimisticRow: RecurringTransaction = {
      id: tempId,
      account_id: recurringAccount,
      amount,
      currency_code: recurringCurrency,
      transaction_type: payload.transaction_type,
      description: payload.description,
      interval_days: intervalDays,
      next_occurs_at: payload.next_occurs_at,
      is_enabled: recurringIsEnabled,
    };
    const previous = recurringTransactions;
    if (!isEdit) {
      setRecurringTransactions((prev) => [optimisticRow, ...prev]);
    }
    setIsRecurringOpen(false);
    try {
      const saved = isEdit
        ? await put<RecurringTransaction>(
            `/api/recurring-transactions/${recurringEditingId}`,
            payload,
          )
        : await post<RecurringTransaction>("/api/recurring-transactions", payload);
      if (isEdit) {
        setRecurringTransactions((prev) =>
          prev.map((row) => (row.id === saved.id ? saved : row)),
        );
      } else {
        setRecurringTransactions((prev) =>
          prev.map((row) => (row.id === tempId ? saved : row)),
        );
      }
      showToast(
        isEdit ? "Recurring updated" : "Recurring scheduled",
        isEdit ? "Schedule saved successfully." : "Schedule created successfully.",
      );
    } catch (err) {
      setRecurringTransactions(previous);
      setRecurringError(getFriendlyErrorMessage(err, "Unable to save this schedule."));
      setIsRecurringOpen(true);
    } finally {
      setIsRecurringSaving(false);
    }
  };

  const setRecurringActionLoading = (id: string, isLoading: boolean) => {
    setRecurringActionIds((prev) => {
      const next = new Set(prev);
      if (isLoading) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleToggleRecurring = async (row: RecurringTransaction) => {
    setRecurringActionLoading(row.id, true);
    try {
      const updated = await put<RecurringTransaction>(
        `/api/recurring-transactions/${row.id}`,
        { is_enabled: !row.is_enabled },
      );
      setRecurringTransactions((prev) =>
        prev.map((item) => (item.id === row.id ? updated : item)),
      );
      showToast(
        updated.is_enabled ? "Recurring enabled" : "Recurring paused",
        updated.is_enabled
          ? "This schedule will run again."
          : "Payments are paused until you re-enable.",
      );
    } catch (err) {
      showToast(
        "Update failed",
        getFriendlyErrorMessage(err, "Unable to update this schedule."),
      );
    } finally {
      setRecurringActionLoading(row.id, false);
    }
  };

  const handleSkipRecurring = async (row: RecurringTransaction) => {
    setRecurringActionLoading(row.id, true);
    try {
      const updated = await post<RecurringTransaction>(
        `/api/recurring-transactions/${row.id}/skip`,
        {},
      );
      setRecurringTransactions((prev) =>
        prev.map((item) => (item.id === row.id ? updated : item)),
      );
      showToast("Occurrence skipped", "Next occurrence moved forward.");
    } catch (err) {
      showToast(
        "Skip failed",
        getFriendlyErrorMessage(err, "Unable to skip this occurrence."),
      );
    } finally {
      setRecurringActionLoading(row.id, false);
    }
  };

  const handleDeleteRecurring = async (row: RecurringTransaction) => {
    setRecurringActionLoading(row.id, true);
    const previous = recurringTransactions;
    setRecurringTransactions((prev) => prev.filter((item) => item.id !== row.id));
    try {
      await del(`/api/recurring-transactions/${row.id}`);
      showToast("Recurring deleted", "Schedule removed.");
    } catch (err) {
      setRecurringTransactions(previous);
      showToast(
        "Delete failed",
        getFriendlyErrorMessage(err, "Unable to delete this schedule."),
      );
    } finally {
      setRecurringActionLoading(row.id, false);
    }
  };

  if (isLoading) {
    return (
      <section className="page">
        <LoadingSkeleton label="Loading transactions" lines={7} />
      </section>
    );
  }

  if (error) {
    return (
      <section className="page">
        <ErrorState
          className="card"
          headline={error}
          details={errorDetails}
          onRetry={loadData}
        />
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
              disabled={isPreferencesLoading}
            >
              {isPreferencesLoading ? (
                <option value="">Loading categories…</option>
              ) : (
                categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))
              )}
            </select>
            {preferencesError ? (
              <div className="input-helper">
                {preferencesError}{" "}
                <button className="pill" type="button" onClick={loadPreferences}>
                  Retry
                </button>
              </div>
            ) : null}
          </label>
          <label>
            Merchant
            <input
              type="text"
              placeholder="Merchant or payee"
              value={transactionMerchant}
              onChange={(event) => setTransactionMerchant(event.target.value)}
            />
          </label>
          <label>
            Occurred on
            <input
              type="text"
              inputMode="numeric"
              placeholder="YYYY/MM/DD"
              value={transactionDate}
              onChange={(event) =>
                setTransactionDate(formatDateInputValue(event.target.value))
              }
            />
            <div className="input-helper">Format: YYYY/MM/DD</div>
          </label>
        </div>
      </Modal>
      <Modal
        title={recurringEditingId ? "Edit recurring schedule" : "Schedule recurring"}
        description="Automate income, subscriptions, or transfers with a cadence."
        isOpen={isRecurringOpen}
        onClose={() => setIsRecurringOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsRecurringOpen(false)}>
              Cancel
            </button>
            <button
              className="pill primary"
              type="button"
              onClick={handleSaveRecurring}
              disabled={isRecurringSaving}
            >
              {isRecurringSaving ? "Saving..." : "Save Schedule"}
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label>
            Account
            <select
              value={recurringAccount}
              onChange={(event) => setRecurringAccount(event.target.value)}
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
              value={recurringType}
              onChange={(event) => setRecurringType(event.target.value)}
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
              value={recurringAmount}
              onChange={(event) => setRecurringAmount(event.target.value)}
            />
          </label>
          <label>
            Currency
            <select
              value={recurringCurrency}
              onChange={(event) => setRecurringCurrency(event.target.value)}
            >
              {supportedCurrencies.map((currencyOption) => (
                <option key={currencyOption} value={currencyOption}>
                  {currencyOption}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <input
              type="text"
              placeholder="Rent, payroll, subscription"
              value={recurringDescription}
              onChange={(event) => setRecurringDescription(event.target.value)}
            />
          </label>
          <label>
            Cadence (days)
            <input
              type="number"
              min="1"
              value={recurringInterval}
              onChange={(event) => setRecurringInterval(event.target.value)}
            />
          </label>
          <label>
            Next occurrence
            <input
              type="date"
              value={recurringNextDate}
              onChange={(event) => setRecurringNextDate(event.target.value)}
            />
          </label>
          <label>
            Enabled
            <input
              type="checkbox"
              checked={recurringIsEnabled}
              onChange={(event) => setRecurringIsEnabled(event.target.checked)}
            />
          </label>
          {recurringError ? <p className="form-error">{recurringError}</p> : null}
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
                          {updates.merchant !== undefined ? `, ${updates.merchant || "No merchant"}` : ""}
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
            onClick={openCreateRecurring}
          >
            Schedule recurring
          </button>
        </div>
        <div className="list-row list-header columns-5">
          <span>Name</span>
          <span>Cadence</span>
          <span>Next run</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {recurringTransactions.length === 0 ? (
          <div className="list-row columns-5 empty-state">No recurring schedules.</div>
        ) : (
          recurringTransactions.map((row) => {
            const isBusy = recurringActionIds.has(row.id);
            return (
              <div className="list-row columns-5" key={row.id}>
                <span>
                  {row.description ?? "Recurring transaction"}{" "}
                  <span className="muted">
                    · {formatCurrency(row.amount, row.currency_code)}
                  </span>
                </span>
                <span>{`Every ${row.interval_days} days`}</span>
                <span>{formatDateDisplay(row.next_occurs_at)}</span>
                <span className="status">{row.is_enabled ? "Active" : "Paused"}</span>
                <div className="row-actions">
                  <button
                    className="pill"
                    type="button"
                    onClick={() => openEditRecurring(row)}
                    disabled={isBusy}
                  >
                    Edit
                  </button>
                  <button
                    className="pill"
                    type="button"
                    onClick={() => handleSkipRecurring(row)}
                    disabled={isBusy}
                  >
                    Skip next
                  </button>
                  <button
                    className="pill"
                    type="button"
                    onClick={() => handleToggleRecurring(row)}
                    disabled={isBusy}
                  >
                    {row.is_enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    className="pill danger"
                    type="button"
                    onClick={() => handleDeleteRecurring(row)}
                    disabled={isBusy}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
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
        <div className="filter-bar">
          <label>
            Category
            <select
              value={categoryFilter}
              onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                const value = event.target.value;
                if (value === "All") {
                  next.delete("category");
                } else {
                  next.set("category", value);
                }
                setSearchParams(next, { replace: true });
              }}
            >
              <option value="All">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            Merchant
            <input
              type="text"
              placeholder="Search merchants"
              value={merchantFilter}
              onChange={(event) => {
                const next = new URLSearchParams(searchParams);
                const value = event.target.value;
                if (value) {
                  next.set("merchant", value);
                } else {
                  next.delete("merchant");
                }
                setSearchParams(next, { replace: true });
              }}
            />
          </label>
        </div>
        {isEditMode ? (
          <div className="bulk-edit">
            <div className="bulk-edit-fields">
              <label>
                Bulk category
                <select
                  value={bulkCategory}
                  onChange={(event) => setBulkCategory(event.target.value)}
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Bulk merchant
                <input
                  type="text"
                  placeholder="Merchant label"
                  value={bulkMerchant}
                  onChange={(event) => setBulkMerchant(event.target.value)}
                />
              </label>
            </div>
            <button className="pill" type="button" onClick={applyBulkUpdates}>
              Stage bulk changes
            </button>
          </div>
        ) : null}
        <div className={`list-row list-header ${isEditMode ? "columns-8" : "columns-7"}`}>
          {isEditMode ? <span /> : null}
          <span>Date</span>
          <span>Account</span>
          <span>Type</span>
          <span>Category</span>
          <span>Merchant</span>
          <span>Amount ({displayCurrency})</span>
          <span>Status</span>
        </div>
        {isFiltering ? (
          <LoadingSkeleton label="Refreshing transactions" lines={6} />
        ) : filteredTransactions.length === 0 ? (
          <EmptyState
            title={
              transactions.length === 0
                ? "No transactions yet"
                : "No transactions match this range"
            }
            description="Transactions capture inflows and outflows so your cashflow metrics stay accurate."
            actionLabel="Add transaction"
            actionHint="Log a transaction to see performance totals."
            onAction={() => setIsTransactionOpen(true)}
          />
        ) : (
          <>
            {filteredTransactions.map((row) => {
              const pending = pendingEdits[row.id];
              const isSelected = selectedTransactions.has(row.id);
              const isEdited = Boolean(pending);
              return (
                <div
                  className={`list-row ${isEditMode ? "columns-8" : "columns-7"} ${
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
                  <span>
                    {isEditMode ? (
                      <input
                        type="text"
                        value={pending?.merchant ?? row.merchant}
                        onChange={(event) =>
                          updatePending(row, { merchant: event.target.value })
                        }
                      />
                    ) : (
                      row.merchant || "—"
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
            <div className={`list-row ${isEditMode ? "columns-8" : "columns-7"} summary-row`}>
              <span>Total</span>
              <span>-</span>
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
