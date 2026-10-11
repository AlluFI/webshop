import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router-dom";
import { isStaffRole } from "@volt/shared";
import { api, userErrorMessage } from "./api";
import { useAuth } from "./auth";

export type CartItem = {
  id: string;
  productId: string;
  name: string;
  slug: string;
  price: number;
  thumbnail: string | null;
  thumbnailAlt: string;
  quantity: number;
  stockQuantity: number;
  lineTotal: number;
};

export type Cart = {
  id: string | null;
  guest: boolean;
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  warnings: { productId: string; message: string }[];
};

const emptyCart: Cart = {
  id: null,
  guest: true,
  items: [],
  itemCount: 0,
  subtotal: 0,
  warnings: [],
};

type CartContextValue = {
  cart: Cart;
  ready: boolean;
  error: string;
  refresh: () => Promise<Cart>;
  addItem: (productId: string, quantity?: number) => Promise<Cart>;
  updateItem: (itemId: string, quantity: number) => Promise<Cart>;
  removeItem: (itemId: string) => Promise<Cart>;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { accessToken, ready: authReady, user } = useAuth();
  const location = useLocation();
  const [cart, setCart] = useState<Cart>(emptyCart);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const staff = Boolean(user && isStaffRole(user.role));

  const refresh = useCallback(async () => {
    if (staff) {
      setCart(emptyCart);
      setError("");
      return emptyCart;
    }
    const next = await api<Cart>("/cart", { token: accessToken });
    setCart(next);
    setError("");
    return next;
  }, [accessToken, staff]);

  useEffect(() => {
    if (!authReady) return;
    void refresh()
      .catch((err: Error) => setError(userErrorMessage(err, "Could not load your cart.")))
      .finally(() => setReady(true));
  }, [authReady, refresh, location.pathname]);

  const addItem = useCallback(
    async (productId: string, quantity = 1) => {
      const next = await api<Cart>("/cart/items", {
        method: "POST",
        token: accessToken,
        body: JSON.stringify({ productId, quantity }),
      });
      setCart(next);
      setError("");
      return next;
    },
    [accessToken],
  );

  const updateItem = useCallback(
    async (itemId: string, quantity: number) => {
      const next = await api<Cart>(`/cart/items/${itemId}`, {
        method: "PATCH",
        token: accessToken,
        body: JSON.stringify({ quantity }),
      });
      setCart(next);
      return next;
    },
    [accessToken],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const next = await api<Cart>(`/cart/items/${itemId}`, {
        method: "DELETE",
        token: accessToken,
      });
      setCart(next);
      return next;
    },
    [accessToken],
  );

  const value = useMemo(
    () => ({ cart, ready, error, refresh, addItem, updateItem, removeItem }),
    [cart, ready, error, refresh, addItem, updateItem, removeItem],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export function AddToCartButton({
  productId,
  stockQuantity,
  compact = false,
}: {
  productId: string;
  stockQuantity: number;
  compact?: boolean;
}) {
  const { addItem } = useCart();
  const { user } = useAuth();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const staff = Boolean(user && isStaffRole(user.role));

  async function add() {
    if (staff) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await addItem(productId, 1);
      setMessage("Added to cart");
    } catch (err) {
      setError(userErrorMessage(err, "Could not add to cart"));
    } finally {
      setPending(false);
    }
  }

  if (stockQuantity <= 0) {
    return <p className="muted">Out of stock</p>;
  }

  return (
    <div className="add-to-cart">
      <button
        className={compact ? "ghost" : "primary"}
        type="button"
        disabled={pending || staff}
        title={staff ? "Staff accounts cannot add items to the cart" : undefined}
        onClick={() => void add()}
      >
        {pending ? "Adding…" : "Add to cart"}
      </button>
      {staff && !compact && (
        <p className="muted">Staff can browse the catalog but cannot add items or place orders.</p>
      )}
      {message && <p className="muted">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
