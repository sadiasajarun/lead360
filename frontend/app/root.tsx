import type { LinksFunction, MetaFunction } from 'react-router';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import { Provider } from 'react-redux';
import { store } from '~/redux/store/store';
import { AuthProvider } from '~/contexts/AuthContext';
import '~/services/httpMethods/interceptors'; // registers the axios 401-refresh interceptor
import './styles/app.css';

// Riseup Labs mark as the tab icon. SVG first (sharp at any size); the PNG is the fallback for
// browsers that don't accept SVG favicons, and doubles as the Apple touch icon.
export const links: LinksFunction = () => [
  { rel: 'icon', href: '/riseup-logo.svg', type: 'image/svg+xml' },
  { rel: 'alternate icon', href: '/riseup-logo.png', type: 'image/png' },
  { rel: 'apple-touch-icon', href: '/riseup-logo.png' },
];

export const meta: MetaFunction = () => [{ title: 'Lead360 · Riseup Labs' }];

export default function Root() {
  return (
    // suppressHydrationWarning on <html>/<body>: browser extensions (e.g. Demoway, Grammarly) inject
    // attributes like data-demoway-document-id onto these tags before React hydrates, which otherwise
    // logs a benign "Extra attributes from the server" mismatch. Suppression is one level deep only —
    // it ignores extension-added attributes on these two elements without hiding any real app mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body suppressHydrationWarning>
        <Provider store={store}>
          <AuthProvider>
            <Outlet />
          </AuthProvider>
        </Provider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
