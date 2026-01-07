export type TransactionType = "income" | "expense";

export const TRANSACTION_TYPES: TransactionType[] = ["income", "expense"];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
};

export const formatTransactionType = (type: TransactionType) =>
  TRANSACTION_TYPE_LABELS[type];
