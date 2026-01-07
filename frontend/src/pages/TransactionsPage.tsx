import { useMemo, useState } from "react";
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
  const [transactionAccount, setTransactionAccount] = useState(accountOptions[0]);
  const [transactionType, setTransactionType] = useState("Income");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDate, setTransactionDate] = useState("2026-04-20");
  const [transactionCurrency, setTransactionCurrency] = useState("USD");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importStep, setImportStep] = useState<"upload" | "mapping" | "review">("upload");
  const [importFileName, setImportFileName] = useState("");
  const [importColumns, setImportColumns] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<string[][]>([]);
  const [importMapping, setImportMapping] = useState({
    account_id: "",
    amount: "",
    currency_code: "",
    transaction_type: "",
    description: "",
    occurred_at: "",
  });
  const [transactions, setTransactions] = useState<
    {
      date: string;
      account: string;
      type: string;
      amount: number;
      currency: string;
      status: string;
    }[]
  >([
    {
      date: "2026-04-18",
      account: "Primary Account",
      type: "Income",
      amount: 2400,
      currency: "USD",
      status: "Cleared",
    },
    {
      date: "2026-04-16",
      account: "Retirement",
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

  const previewRows = useMemo(() => importRows.slice(0, 5), [importRows]);

  const showToast = (title: string, description?: string) => {
    setToast({ title, description });
  };

  const resetImportState = () => {
    setImportStep("upload");
    setImportFileName("");
    setImportColumns([]);
    setImportRows([]);
    setImportMapping({
      account_id: "",
      amount: "",
      currency_code: "",
      transaction_type: "",
      description: "",
      occurred_at: "",
    });
  };

  const handleImportFile = async (file: File | null) => {
    if (!file) {
      return;
    }
    const text = await file.text();
    const { columns, rows } = parseCsv(text);
    setImportFileName(file.name);
    setImportColumns(columns);
    setImportRows(rows);
    setImportMapping((prev) => ({
      ...prev,
      account_id: columns[0] ?? "",
      amount: columns[1] ?? "",
      currency_code: columns[2] ?? "",
      transaction_type: columns[3] ?? "",
      description: columns[4] ?? "",
      occurred_at: columns[5] ?? "",
    }));
    setImportStep("mapping");
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
            onClick={() =>
              showToast(
                "Export queued",
                "Use the CSV export endpoint to download the current filters.",
              )
            }
          >
            Export CSV
          </button>
          <button
            className="pill"
            onClick={() => {
              resetImportState();
              setIsImportOpen(true);
            }}
          >
            Import CSV
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
        title="Import transactions"
        description="Upload a CSV file, map the columns, and preview before importing."
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        footer={
          <>
            <button
              className="pill"
              type="button"
              onClick={() => {
                setIsImportOpen(false);
                resetImportState();
              }}
            >
              Cancel
            </button>
            {importStep === "upload" && (
              <button
                className="pill primary"
                type="button"
                onClick={() => setImportStep("mapping")}
                disabled={importColumns.length === 0}
              >
                Continue
              </button>
            )}
            {importStep === "mapping" && (
              <button
                className="pill primary"
                type="button"
                onClick={() => setImportStep("review")}
                disabled={!importMapping.account_id || !importMapping.amount || !importMapping.occurred_at}
              >
                Review
              </button>
            )}
            {importStep === "review" && (
              <button
                className="pill primary"
                type="button"
                onClick={() => {
                  setIsImportOpen(false);
                  showToast(
                    "Import ready",
                    `Mapped ${importRows.length} rows from ${importFileName || "CSV"}.`,
                  );
                  resetImportState();
                }}
              >
                Import
              </button>
            )}
          </>
        }
      >
        <div className="import-wizard">
          <div className="import-steps">
            {["Upload", "Map columns", "Review"].map((label, index) => (
              <div
                key={label}
                className={`import-step ${
                  importStep === ["upload", "mapping", "review"][index] ? "active" : ""
                }`}
              >
                <span className="import-step-index">{index + 1}</span>
                <span>{label}</span>
              </div>
            ))}
          </div>
          {importStep === "upload" && (
            <div className="import-upload">
              <p className="muted">
                Supported columns include account ID, amount, currency, type, description, and
                occurred-at timestamps.
              </p>
              <label className="import-file">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => handleImportFile(event.target.files?.[0] ?? null)}
                />
                <span className="pill">Choose CSV file</span>
                {importFileName && <span className="muted">{importFileName}</span>}
              </label>
            </div>
          )}
          {importStep === "mapping" && (
            <>
              <div className="form-grid">
                {[
                  { key: "account_id", label: "Account ID" },
                  { key: "amount", label: "Amount" },
                  { key: "currency_code", label: "Currency code" },
                  { key: "transaction_type", label: "Transaction type" },
                  { key: "description", label: "Description (optional)" },
                  { key: "occurred_at", label: "Occurred at" },
                ].map((field) => (
                  <label key={field.key}>
                    {field.label}
                    <select
                      value={importMapping[field.key as keyof typeof importMapping]}
                      onChange={(event) =>
                        setImportMapping((prev) => ({
                          ...prev,
                          [field.key]: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select column</option>
                      {importColumns.map((column) => (
                        <option key={column} value={column}>
                          {column}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="import-preview">
                <div className="list-row list-header columns-5">
                  {importColumns.slice(0, 5).map((column) => (
                    <span key={column}>{column}</span>
                  ))}
                </div>
                {previewRows.map((row, rowIndex) => (
                  <div className="list-row columns-5" key={`preview-${rowIndex}`}>
                    {row.slice(0, 5).map((cell, cellIndex) => (
                      <span key={`cell-${rowIndex}-${cellIndex}`}>{cell || "—"}</span>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
          {importStep === "review" && (
            <div className="import-review">
              <div className="chip-grid">
                <span className="chip">{importRows.length} rows detected</span>
                <span className="chip">{importColumns.length} columns</span>
                {importFileName && <span className="chip">{importFileName}</span>}
              </div>
              <div className="import-summary">
                <div>
                  <span className="muted">Account ID</span>
                  <strong>{importMapping.account_id || "Not mapped"}</strong>
                </div>
                <div>
                  <span className="muted">Amount</span>
                  <strong>{importMapping.amount || "Not mapped"}</strong>
                </div>
                <div>
                  <span className="muted">Currency</span>
                  <strong>{importMapping.currency_code || "Not mapped"}</strong>
                </div>
                <div>
                  <span className="muted">Type</span>
                  <strong>{importMapping.transaction_type || "Not mapped"}</strong>
                </div>
                <div>
                  <span className="muted">Occurred at</span>
                  <strong>{importMapping.occurred_at || "Not mapped"}</strong>
                </div>
                <div>
                  <span className="muted">Description</span>
                  <strong>{importMapping.description || "Not mapped"}</strong>
                </div>
              </div>
              <p className="muted">
                Review the mapping above before submitting the CSV to the import endpoint.
              </p>
            </div>
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
        <div className="list-row list-header columns-5">
          <span>Date</span>
          <span>Account</span>
          <span>Type</span>
          <span>Amount ({displayCurrency})</span>
          <span>Status</span>
        </div>
        {filteredTransactions.map((row) => (
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
        ))}
      </div>
    </section>
  );
}

type ParsedCsv = {
  columns: string[];
  rows: string[][];
};

function parseCsv(text: string): ParsedCsv {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { columns: [], rows: [] };
  }
  const columns = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => splitCsvLine(line));
  return { columns, rows };
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  values.push(current.trim());
  return values.map((value) => value.replace(/^"|"$/g, ""));
}
