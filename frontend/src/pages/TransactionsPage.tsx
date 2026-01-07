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
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Recurring schedules</h3>
            <p className="muted">Automate salaries, rent, and subscriptions.</p>
          </div>
          <button className="pill primary">Schedule recurring</button>
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
            next: "2024-05-01",
            status: "Active",
          },
          {
            name: "Rent",
            cadence: "Monthly",
            next: "2024-04-30",
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
