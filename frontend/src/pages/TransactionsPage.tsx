export default function TransactionsPage() {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>Transactions</h1>
          <p className="muted">Review income and expenses across accounts.</p>
        </div>
        <button className="pill primary">Add Transaction</button>
      </header>
      <div className="card">
        <p className="muted">Transaction list will render here.</p>
      </div>
    </section>
  );
}
