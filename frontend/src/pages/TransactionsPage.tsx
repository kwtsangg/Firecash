export default function TransactionsPage() {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Transactions</h1>
          <p className="muted">Review income and expenses across accounts.</p>
        </div>
        <div className="toolbar">
          <button className="pill">Export CSV</button>
          <button className="pill primary">Add Transaction</button>
        </div>
      </header>
      <div className="card list-card">
        <div className="list-row list-header columns-5">
          <span>Date</span>
          <span>Account</span>
          <span>Type</span>
          <span>Amount</span>
          <span>Status</span>
        </div>
        {[
          {
            date: "2024-04-18",
            account: "Primary Account",
            type: "Income",
            amount: "$2,400",
            status: "Cleared",
          },
          {
            date: "2024-04-16",
            account: "Retirement",
            type: "Expense",
            amount: "$320",
            status: "Scheduled",
          },
        ].map((row) => (
          <div className="list-row columns-5" key={row.date + row.amount}>
            <span>{row.date}</span>
            <span>{row.account}</span>
            <span>{row.type}</span>
            <span>{row.amount}</span>
            <span className="status">{row.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
