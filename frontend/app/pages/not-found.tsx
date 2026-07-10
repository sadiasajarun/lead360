import { Link } from 'react-router';
export default function NotFound() {
  return (
    <main data-testid="notfound-root" style={{ padding: 32 }}>
      <h1>404 — Page not found</h1>
      <Link to="/" data-testid="notfound-home">Back home</Link>
    </main>
  );
}
