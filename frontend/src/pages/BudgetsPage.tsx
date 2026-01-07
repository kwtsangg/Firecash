import { useEffect, useMemo, useState } from "react";
import ActionToast, { ActionToastData } from "../components/ActionToast";
import Modal from "../components/Modal";
import { del, get, post, put } from "../utils/apiClient";
import { formatCurrency, supportedCurrencies } from "../utils/currency";

const periodLabels: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

type BudgetPeriodStatus = {
  period_id: string;
  period_start: string;
  period_end: string;
  budgeted_amount: number;
  spent_amount: number;
  is_over_budget: boolean;
};

type Budget = {
  id: string;
  name: string;
  currency_code: string;
  amount: number;
  period_interval: string;
  created_at: string;
  current_period: BudgetPeriodStatus;
};

type BudgetAlertRule = {
  id: string;
  budget_id: string;
  threshold_type: string;
  threshold_value: number;
  created_at: string;
};

const formatPeriod = (period: BudgetPeriodStatus) => {
  const start = new Date(`${period.period_start}T00:00:00`);
  const end = new Date(`${period.period_end}T00:00:00`);
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${startLabel} - ${endLabel}`;
};

const formatPercent = (value: number) => `${value.toFixed(0)}%`;

export default function BudgetsPage() {
  const [toast, setToast] = useState<ActionToastData | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [budgetName, setBudgetName] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("USD");
  const [budgetInterval, setBudgetInterval] = useState("monthly");

  const [isAlertOpen, setIsAlertOpen] = useState(false);
  const [alertBudget, setAlertBudget] = useState<Budget | null>(null);
  const [alertRules, setAlertRules] = useState<BudgetAlertRule[]>([]);
  const [alertType, setAlertType] = useState("percentage");
  const [alertValue, setAlertValue] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [alertLoading, setAlertLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadBudgets = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await get<Budget[]>("/api/budgets");
        if (!isMounted) {
          return;
        }
        setBudgets(response);
      } catch (err) {
        if (isMounted) {
          setError("Unable to load budgets.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    loadBudgets();
    return () => {
      isMounted = false;
    };
  }, []);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const resetBudgetForm = () => {
    setBudgetName("");
    setBudgetAmount("");
    setBudgetCurrency("USD");
    setBudgetInterval("monthly");
    setEditingBudget(null);
  };

  const openCreateBudget = () => {
    resetBudgetForm();
    setIsBudgetOpen(true);
  };

  const openEditBudget = (budget: Budget) => {
    setEditingBudget(budget);
    setBudgetName(budget.name);
    setBudgetAmount(budget.amount.toString());
    setBudgetCurrency(budget.currency_code);
    setBudgetInterval(budget.period_interval);
    setIsBudgetOpen(true);
  };

  const handleSaveBudget = async () => {
    const amount = Number(budgetAmount);
    if (!budgetName.trim()) {
      showToast("Missing name", "Enter a budget name to continue.");
      return;
    }
    if (!amount) {
      showToast("Missing amount", "Enter a budget amount to continue.");
      return;
    }
    try {
      if (editingBudget) {
        const updated = await put<Budget>(`/api/budgets/${editingBudget.id}`, {
          name: budgetName.trim(),
          amount,
          currency_code: budgetCurrency,
          period_interval: budgetInterval,
        });
        setBudgets((prev) => prev.map((budget) => (budget.id === updated.id ? updated : budget)));
        showToast("Budget updated", `Updated ${updated.name}.`);
      } else {
        const created = await post<Budget>("/api/budgets", {
          name: budgetName.trim(),
          amount,
          currency_code: budgetCurrency,
          period_interval: budgetInterval,
        });
        setBudgets((prev) => [created, ...prev]);
        showToast("Budget created", `Added ${created.name}.`);
      }
      setIsBudgetOpen(false);
      resetBudgetForm();
    } catch (err) {
      showToast("Save failed", "Unable to save this budget.");
    }
  };

  const openAlertRules = async (budget: Budget) => {
    setAlertBudget(budget);
    setAlertRules([]);
    setEditingRuleId(null);
    setAlertType("percentage");
    setAlertValue("");
    setIsAlertOpen(true);
    setAlertLoading(true);
    try {
      const response = await get<BudgetAlertRule[]>(`/api/budgets/${budget.id}/alert-rules`);
      setAlertRules(response);
    } catch (err) {
      showToast("Alert rules unavailable", "Unable to load alert rules.");
    } finally {
      setAlertLoading(false);
    }
  };

  const handleSaveAlertRule = async () => {
    if (!alertBudget) {
      return;
    }
    const value = Number(alertValue);
    if (!value) {
      showToast("Missing threshold", "Enter a threshold value to continue.");
      return;
    }
    try {
      if (editingRuleId) {
        const updated = await put<BudgetAlertRule>(`/api/budget-alert-rules/${editingRuleId}`, {
          threshold_type: alertType,
          threshold_value: value,
        });
        setAlertRules((prev) => prev.map((rule) => (rule.id === updated.id ? updated : rule)));
        showToast("Alert updated", "Alert threshold updated.");
      } else {
        const created = await post<BudgetAlertRule>(`/api/budgets/${alertBudget.id}/alert-rules`, {
          threshold_type: alertType,
          threshold_value: value,
        });
        setAlertRules((prev) => [created, ...prev]);
        showToast("Alert created", "Alert threshold saved.");
      }
      setEditingRuleId(null);
      setAlertType("percentage");
      setAlertValue("");
    } catch (err) {
      showToast("Alert failed", "Unable to save this alert rule.");
    }
  };

  const handleEditRule = (rule: BudgetAlertRule) => {
    setEditingRuleId(rule.id);
    setAlertType(rule.threshold_type);
    setAlertValue(rule.threshold_value.toString());
  };

  const handleDeleteRule = async (ruleId: string) => {
    try {
      await del(`/api/budget-alert-rules/${ruleId}`);
      setAlertRules((prev) => prev.filter((rule) => rule.id !== ruleId));
      showToast("Alert removed", "Alert rule deleted.");
    } catch (err) {
      showToast("Delete failed", "Unable to remove this alert rule.");
    }
  };

  const budgetRows = useMemo(() => {
    return budgets.map((budget) => {
      const spent = budget.current_period.spent_amount;
      const limit = budget.current_period.budgeted_amount || budget.amount;
      const percent = limit ? Math.min((spent / limit) * 100, 999) : 0;
      return {
        ...budget,
        percent,
        limit,
      };
    });
  }, [budgets]);

  if (isLoading) {
    return (
      <section className="page">
        <div className="card page-state">Loading budgets...</div>
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
          <h1>Budgets</h1>
          <p className="muted">Track spending targets and alert thresholds.</p>
        </div>
        <div className="toolbar">
          <button className="pill primary" onClick={openCreateBudget}>
            Add Budget
          </button>
        </div>
      </header>
      <div className="card list-card">
        <div className="list-row list-header columns-5">
          <span>Budget</span>
          <span>Period</span>
          <span>Target</span>
          <span>Spent</span>
          <span>Status</span>
        </div>
        {budgetRows.length === 0 ? (
          <div className="list-row empty-state">No budgets yet. Add one to get started.</div>
        ) : (
          budgetRows.map((budget) => (
            <div key={budget.id} className="list-row columns-5">
              <div>
                <div>{budget.name}</div>
                <div className="subtext">
                  {budget.currency_code} • {periodLabels[budget.period_interval] ?? budget.period_interval}
                </div>
              </div>
              <div>
                <div>{formatPeriod(budget.current_period)}</div>
                <div className="subtext">Current period</div>
              </div>
              <div className="amount-cell">
                <span>{formatCurrency(budget.limit, budget.currency_code)}</span>
                <span className="subtext">Budgeted</span>
              </div>
              <div className="amount-cell">
                <span>{formatCurrency(budget.current_period.spent_amount, budget.currency_code)}</span>
                <span className="subtext">{formatPercent(budget.percent)} used</span>
              </div>
              <div className="amount-cell">
                <span className={`status ${budget.current_period.is_over_budget ? "warn" : ""}`}>
                  {budget.current_period.is_over_budget ? "Over budget" : "On track"}
                </span>
                <div className="inline-actions">
                  <button className="pill" type="button" onClick={() => openEditBudget(budget)}>
                    Edit
                  </button>
                  <button className="pill" type="button" onClick={() => openAlertRules(budget)}>
                    Alerts
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <Modal
        title={editingBudget ? "Edit budget" : "Create budget"}
        description="Define your spending target and cadence."
        isOpen={isBudgetOpen}
        onClose={() => setIsBudgetOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsBudgetOpen(false)}>
              Cancel
            </button>
            <button className="pill primary" type="button" onClick={handleSaveBudget}>
              Save Budget
            </button>
          </>
        }
      >
        <div className="form-grid">
          <label>
            Budget name
            <input
              type="text"
              placeholder="Essentials"
              value={budgetName}
              onChange={(event) => setBudgetName(event.target.value)}
            />
          </label>
          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="2000"
              value={budgetAmount}
              onChange={(event) => setBudgetAmount(event.target.value)}
            />
          </label>
          <label>
            Currency
            <select value={budgetCurrency} onChange={(event) => setBudgetCurrency(event.target.value)}>
              {supportedCurrencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </label>
          <label>
            Period
            <select value={budgetInterval} onChange={(event) => setBudgetInterval(event.target.value)}>
              <option value="monthly">Monthly</option>
            </select>
          </label>
        </div>
      </Modal>
      <Modal
        title="Alert thresholds"
        description={
          alertBudget
            ? `Notify when ${alertBudget.name} approaches or exceeds its limit.`
            : "Configure budget alerts."
        }
        isOpen={isAlertOpen}
        onClose={() => setIsAlertOpen(false)}
        footer={
          <>
            <button className="pill" type="button" onClick={() => setIsAlertOpen(false)}>
              Done
            </button>
          </>
        }
      >
        {alertLoading ? (
          <div className="page-state">Loading alert rules...</div>
        ) : (
          <>
            <div className="list-card">
              <div className="list-row list-header columns-3">
                <span>Type</span>
                <span>Threshold</span>
                <span>Actions</span>
              </div>
              {alertRules.length === 0 ? (
                <div className="list-row empty-state">No alert rules yet.</div>
              ) : (
                alertRules.map((rule) => (
                  <div key={rule.id} className="list-row columns-3">
                    <span>{rule.threshold_type === "percentage" ? "Percentage" : "Amount"}</span>
                    <span>
                      {rule.threshold_type === "percentage"
                        ? `${rule.threshold_value}%`
                        : formatCurrency(rule.threshold_value, alertBudget?.currency_code ?? "USD")}
                    </span>
                    <div className="inline-actions">
                      <button className="pill" type="button" onClick={() => handleEditRule(rule)}>
                        Edit
                      </button>
                      <button className="pill" type="button" onClick={() => handleDeleteRule(rule.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="form-grid">
              <label>
                Threshold type
                <select value={alertType} onChange={(event) => setAlertType(event.target.value)}>
                  <option value="percentage">Percentage</option>
                  <option value="amount">Amount</option>
                </select>
              </label>
              <label>
                Threshold value
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={alertType === "percentage" ? "80" : "500"}
                  value={alertValue}
                  onChange={(event) => setAlertValue(event.target.value)}
                />
              </label>
              <button className="pill primary" type="button" onClick={handleSaveAlertRule}>
                {editingRuleId ? "Update Alert" : "Add Alert"}
              </button>
            </div>
          </>
        )}
      </Modal>
      {toast && <ActionToast toast={toast} onClose={() => setToast(null)} />}
    </section>
  );
}
