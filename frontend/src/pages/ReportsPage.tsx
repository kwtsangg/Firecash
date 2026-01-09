import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart } from "../components/Charts";
import DateRangePicker, { DateRange } from "../components/DateRangePicker";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import KpiCard from "../components/KpiCard";
import LoadingState from "../components/LoadingState";
import { useCurrency } from "../components/CurrencyContext";
import {
  DailyTransactionTotal,
  ReportSnapshot,
  fetchDailyExpenseTotals,
  fetchReportSnapshot,
} from "../api/reports";
import { convertAmount, formatCurrency } from "../utils/currency";
import {
  addDays,
  formatDateDisplay,
  getDefaultRange,
  parseDateInput,
  toDateInputValue,
} from "../utils/date";
import { formatApiErrorDetail } from "../utils/errorMessages";
import { pageTitles } from "../utils/pageTitles";
import { usePageMeta } from "../utils/pageMeta";

export default function ReportsPage() {
  usePageMeta({ title: pageTitles.reports });
  const navigate = useNavigate();
  const { currency: displayCurrency } = useCurrency();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [range, setRange] = useState<DateRange>(() => getDefaultRange(30));
  const [dailyTotals, setDailyTotals] = useState<DailyTransactionTotal[]>([]);
  const [dailyTotalsError, setDailyTotalsError] = useState<string | null>(null);
  const [dailyTotalsErrorDetails, setDailyTotalsErrorDetails] = useState<string[]>([]);
  const [isDailyTotalsLoading, setIsDailyTotalsLoading] = useState(false);

  const loadReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setErrorDetails([]);
    try {
      const response = await fetchReportSnapshot();
      setSnapshot(response);
    } catch (err) {
      setError("Unable to load reports right now.");
      const detail = formatApiErrorDetail(err);
      setErrorDetails(detail ? [detail] : []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDailyTotals = useCallback(async () => {
    setIsDailyTotalsLoading(true);
    setDailyTotalsError(null);
    setDailyTotalsErrorDetails([]);
    try {
      const response = await fetchDailyExpenseTotals({
        start_date: range.from,
        end_date: range.to,
      });
      setDailyTotals(response);
    } catch (err) {
      setDailyTotalsError("Unable to load daily expenses right now.");
      const detail = formatApiErrorDetail(err);
      setDailyTotalsErrorDetails(detail ? [detail] : []);
    } finally {
      setIsDailyTotalsLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  useEffect(() => {
    loadDailyTotals();
  }, [loadDailyTotals]);

  const accounts = snapshot?.accounts ?? [];
  const transactions = snapshot?.transactions ?? [];
  const totals = snapshot?.totals;

  const recentTransactions = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    return transactions.filter((transaction) => new Date(transaction.occurred_at) >= cutoff);
  }, [transactions]);

  const { income, expenses } = useMemo(() => {
    return recentTransactions.reduce(
      (acc, transaction) => {
        const amount = convertAmount(transaction.amount, transaction.currency_code, displayCurrency);
        if (transaction.transaction_type === "income") {
          acc.income += amount;
        } else {
          acc.expenses += amount;
        }
        return acc;
      },
      { income: 0, expenses: 0 },
    );
  }, [displayCurrency, recentTransactions]);

  const netChange = income - expenses;
  const totalAssets = totals
    ? convertAmount(totals.total, totals.currency_code, displayCurrency)
    : null;

  const latestTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, 5);
  }, [transactions]);

  const dailyTotalsByDate = useMemo(() => {
    const totalsByDate = new Map<string, number>();
    dailyTotals.forEach((entry) => {
      const converted = convertAmount(entry.total, entry.currency_code, displayCurrency);
      totalsByDate.set(entry.date, (totalsByDate.get(entry.date) ?? 0) + converted);
    });
    return totalsByDate;
  }, [dailyTotals, displayCurrency]);

  const dailyChartDates = useMemo(() => {
    const dates: string[] = [];
    const start = parseDateInput(range.from);
    const end = parseDateInput(range.to);
    let current = start;
    while (current <= end) {
      dates.push(toDateInputValue(current));
      current = addDays(current, 1);
    }
    return dates;
  }, [range.from, range.to]);

  const dailyChartPoints = useMemo(() => {
    return dailyChartDates.map((date) => dailyTotalsByDate.get(date) ?? 0);
  }, [dailyChartDates, dailyTotalsByDate]);

  const dailyMax = dailyChartPoints.length > 0 ? Math.max(...dailyChartPoints) : 0;
  const dailyMin = dailyChartPoints.length > 0 ? Math.min(...dailyChartPoints) : 0;
  const dailyMidpoint = Math.round((dailyMax + dailyMin) / 2);
  const dailyAxisYLabels = [
    formatCurrency(dailyMax, displayCurrency),
    formatCurrency(Math.round(dailyMax * 0.75), displayCurrency),
    formatCurrency(dailyMidpoint, displayCurrency),
    formatCurrency(Math.round(dailyMin + (dailyMax - dailyMin) * 0.25), displayCurrency),
    formatCurrency(dailyMin, displayCurrency),
  ];
  const dailyRangeDays = Math.max(
    1,
    Math.round(
      (parseDateInput(range.to).getTime() - parseDateInput(range.from).getTime()) /
        86400000,
    ),
  );
  const dailyLabelCount = Math.min(dailyChartDates.length || 1, dailyRangeDays <= 45 ? 6 : 5);
  const dailyLabelStep =
    dailyLabelCount > 1 ? (dailyChartDates.length - 1) / (dailyLabelCount - 1) : 0;
  const dailyAxisXLabels = Array.from({ length: dailyLabelCount }, (_, index) =>
    Math.round(index * dailyLabelStep),
  )
    .filter((index, position, list) => list.indexOf(index) === position)
    .filter((index) => dailyChartDates[index])
    .map((index) => formatDateDisplay(dailyChartDates[index]));

  const hasAccounts = accounts.length > 0;
  const hasTransactions = transactions.length > 0;

  if (isLoading) {
    return (
      <section className="page">
        <LoadingState
          title="Loading reports"
          description="Summarizing accounts, balances, and activity."
          className="card"
        />
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
          onRetry={loadReports}
        />
      </section>
    );
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{pageTitles.reports}</h1>
          <p className="muted">Generate insights across accounts, transactions, and trends.</p>
        </div>
        <button className="pill" type="button">
          Export report
        </button>
      </header>
      {!hasAccounts && !hasTransactions ? (
        <EmptyState
          title="No reports yet"
          description="Create an account and add transactions to build your first report."
          actionLabel="Create account"
          onAction={() => navigate("/accounts")}
          secondaryActionLabel="Import transactions"
          onSecondaryAction={() => navigate("/transactions")}
          actionHint="Track balances to unlock report summaries."
          secondaryActionHint="Bring in a CSV or log transactions manually."
        />
      ) : (
        <>
          <div className="card-grid">
            <KpiCard
              label="Total assets"
              value={totalAssets === null ? "—" : formatCurrency(totalAssets, displayCurrency)}
              footnote="Across all accounts"
            />
            <KpiCard
              label="Net cashflow"
              value={formatCurrency(netChange, displayCurrency)}
              footnote="Last 30 days"
              trend={netChange >= 0 ? "Positive" : "Negative"}
            />
            <KpiCard
              label="Income"
              value={formatCurrency(income, displayCurrency)}
              footnote="Last 30 days"
            />
            <KpiCard
              label="Expenses"
              value={formatCurrency(expenses, displayCurrency)}
              footnote="Last 30 days"
            />
          </div>
          <div className="card chart-card">
            <div className="chart-header">
              <div>
                <h3>Daily expenses</h3>
                <p className="muted">
                  Daily expense totals in {displayCurrency} for the selected range.
                </p>
              </div>
              <DateRangePicker value={range} onChange={setRange} />
            </div>
            {isDailyTotalsLoading ? (
              <LoadingState
                title="Loading daily expenses"
                description="Summarizing daily expense totals."
              />
            ) : dailyTotalsError ? (
              <ErrorState
                headline={dailyTotalsError}
                details={dailyTotalsErrorDetails}
                onRetry={loadDailyTotals}
              />
            ) : (
              <div className="chart-surface chart-axis-surface">
                <LineChart
                  points={dailyChartPoints}
                  labels={dailyChartDates}
                  formatLabel={formatDateDisplay}
                  formatValue={(value) => formatCurrency(value, displayCurrency)}
                  showAxisLabels={false}
                />
                <span className="chart-axis-title y">Amount</span>
                <span className="chart-axis-title x">Date</span>
                <div className="chart-axis-y">
                  {dailyAxisYLabels.map((label, index) => (
                    <span key={`${label}-${index}`}>{label}</span>
                  ))}
                </div>
                <div className="chart-axis-x">
                  {dailyAxisXLabels.map((label, index) => (
                    <span key={`${label}-${index}`}>{label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="card list-card">
            <div className="list-row list-header columns-4">
              <span>Date</span>
              <span>Type</span>
              <span>Amount ({displayCurrency})</span>
              <span>Notes</span>
            </div>
            {latestTransactions.length === 0 ? (
              <EmptyState
                title="No activity to summarize"
                description="Recent transactions appear here once you log activity."
                actionLabel="Add transaction"
                onAction={() => navigate("/transactions")}
                actionHint="Capture income, expenses, and transfers to grow reports."
              />
            ) : (
              latestTransactions.map((transaction) => (
                <div
                  className="list-row columns-4"
                  key={transaction.id}
                >
                  <span>{formatDateDisplay(transaction.occurred_at.split("T")[0])}</span>
                  <span>
                    {transaction.transaction_type === "income" ? "Income" : "Expense"}
                  </span>
                  <span>
                    {formatCurrency(
                      convertAmount(
                        transaction.amount,
                        transaction.currency_code,
                        displayCurrency,
                      ),
                      displayCurrency,
                    )}
                  </span>
                  <span>{transaction.description ?? "—"}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
