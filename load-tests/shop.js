import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://web:80";

function vuHeaders(extra) {
  return Object.assign(
    {
      "X-Forwarded-For": `198.51.${(__VU % 200) + 1}.${(__ITER % 200) + 1}`,
    },
    extra || {},
  );
}

export const options = {
  scenarios: {
    browse: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 20 },
        { duration: "40s", target: 50 },
        { duration: "20s", target: 0 },
      ],
      exec: "browse",
    },
    searchCart: {
      executor: "constant-vus",
      vus: 15,
      duration: "1m",
      exec: "searchCart",
    },
    auth: {
      executor: "constant-arrival-rate",
      rate: 5,
      timeUnit: "1s",
      duration: "1m",
      preAllocatedVUs: 10,
      exec: "authLogin",
    },
  },
  thresholds: {
    http_req_duration: ["p(90)<2000", "p(95)<5000"],
    http_req_failed: ["rate<0.05"],
  },
};

export function browse() {
  const params = { headers: vuHeaders() };
  const home = http.get(`${BASE}/`, params);
  check(home, { "home 200": (res) => res.status === 200 });
  const products = http.get(`${BASE}/api/v1/products?pageSize=12`, params);
  check(products, { "catalog 200": (res) => res.status === 200 });
  sleep(1);
}

export function searchCart() {
  const params = { headers: vuHeaders() };
  const suggest = http.get(`${BASE}/api/v1/search/suggest?q=sony`, params);
  check(suggest, { "suggest 200": (res) => res.status === 200 });
  const products = http.get(`${BASE}/api/v1/products?q=headphone&sort=rating`, params);
  check(products, { "search 200": (res) => res.status === 200 });
  let productId = "";
  try {
    productId = String(products.json("items.0.id") || "");
  } catch {
    productId = "";
  }
  if (productId) {
    const add = http.post(
      `${BASE}/api/v1/cart/items`,
      JSON.stringify({ productId, quantity: 1 }),
      { headers: vuHeaders({ "Content-Type": "application/json" }) },
    );
    check(add, { "add cart ok": (res) => res.status === 200 || res.status === 201 });
  }
  const cart = http.get(`${BASE}/api/v1/cart`, params);
  check(cart, { "cart 200": (res) => res.status === 200 });
  sleep(0.5);
}

export function authLogin() {
  const res = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ email: "customer@volt.test", password: "Shopping123" }),
    { headers: vuHeaders({ "Content-Type": "application/json" }) },
  );
  check(res, { "login ok or mfa": (r) => r.status === 200 });
}
