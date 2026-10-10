import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth";
import { CartProvider } from "./cart";
import { Layout } from "./Layout";
import { HomePage } from "./pages/Home";
import { CatalogPage } from "./pages/Catalog";
import { ProductPage } from "./pages/Product";
import { CartPage } from "./pages/Cart";
import { CheckoutPage } from "./pages/Checkout";
import { OrderConfirmationPage } from "./pages/OrderConfirmation";
import { OrdersPage } from "./pages/Orders";
import {
  ForgotPage,
  LoginPage,
  OAuthCallbackPage,
  RegisterPage,
  ResetPage,
  VerifyPage,
} from "./pages/Auth";
import { AccountPage } from "./pages/Account";
import { AboutPage } from "./pages/About";
import { ContactPage } from "./pages/Contact";
import { FaqPage } from "./pages/Faq";
import { TermsPage } from "./pages/Terms";
import { NotFoundPage } from "./pages/NotFound";
import { AdminPage } from "./pages/Admin";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <CartProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/products/:slug" element={<ProductPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/orders/:id" element={<OrderConfirmationPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<VerifyPage />} />
            <Route path="/forgot-password" element={<ForgotPage />} />
            <Route path="/reset-password" element={<ResetPage />} />
            <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
        </CartProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
