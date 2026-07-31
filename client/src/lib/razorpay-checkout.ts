import { apiFetchJson } from "@/lib/browser-fetch";

/**
 * Razorpay Checkout, wrapped so components never touch `window.Razorpay`.
 *
 * The flow, and why each step exists:
 *
 *   1. POST /api/razorpay/order   — the server prices the purchase and creates
 *      the order. The amount is NEVER sent from here; a client-supplied amount
 *      is how you buy the top tier for one cent.
 *   2. open the Razorpay sheet   — their hosted UI collects the card. No card
 *      data ever passes through this app.
 *   3. POST /api/razorpay/verify — hands back the signed receipt so the plan
 *      activates immediately. The server re-verifies the signature; this call
 *      is a convenience, not the source of truth.
 *   4. the webhook fulfils it anyway, so closing the tab at step 3 still ends
 *      with a provisioned plan.
 */

type RazorpayHandlerResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpayHandlerResponse) => void;
  prefill?: { name?: string; email?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
};

type RazorpayConstructor = new (options: RazorpayOptions) => {
  open: () => void;
  on: (event: string, handler: (payload: unknown) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptPromise: Promise<boolean> | null = null;

/**
 * Loads checkout.js once per page.
 *
 * Memoised on the promise rather than a boolean so two buttons clicked in quick
 * succession share one load instead of injecting two script tags and racing.
 */
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<boolean>((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(Boolean(window.Razorpay));
    // Ad blockers and corporate proxies do block this host. Resolving false
    // rather than hanging lets the caller show a real message instead of a
    // button that spins forever.
    script.onerror = () => {
      scriptPromise = null;
      resolve(false);
    };
    if (!existing) document.body.appendChild(script);
  });

  return scriptPromise;
}

export type CheckoutTarget = { plan: string } | { creditPack: string };

export type CheckoutOutcome =
  | { status: "paid" }
  | { status: "dismissed" }
  | { status: "error"; message: string };

type OrderResponse = {
  paymentId: string;
  orderId: string;
  amountCents: number;
  currency: string;
  keyId: string | null;
  description: string;
  workspaceName: string;
};

/**
 * Runs one purchase to completion. Resolves only once the sheet closes, so the
 * caller can keep a button in its pending state for the whole flow.
 */
export async function startRazorpayCheckout(
  target: CheckoutTarget,
  user: { name?: string; email?: string } = {},
): Promise<CheckoutOutcome> {
  let order: OrderResponse;
  try {
    const body = await apiFetchJson<{ data: OrderResponse }>("/api/razorpay/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(target),
    });
    if (!body?.data?.orderId) {
      return { status: "error", message: "Couldn't start the payment. Please try again." };
    }
    order = body.data;
  } catch {
    return { status: "error", message: "Couldn't reach MariMail. Check your connection." };
  }

  if (!order.keyId) {
    return { status: "error", message: "Payments aren't configured on this environment." };
  }

  const ready = await loadRazorpayScript();
  if (!ready || !window.Razorpay) {
    return {
      status: "error",
      message: "Couldn't load the payment window. Disable your ad blocker and try again.",
    };
  }

  return new Promise<CheckoutOutcome>((resolve) => {
    // Guards against resolving twice: `handler` and `ondismiss` can both fire —
    // Razorpay closes the modal after a successful payment, which triggers
    // dismissal after the handler has already run.
    let settled = false;
    const settle = (outcome: CheckoutOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const checkout = new window.Razorpay!({
      key: order.keyId!,
      amount: order.amountCents,
      currency: order.currency,
      name: "MariMail",
      description: order.description,
      order_id: order.orderId,
      prefill: { name: user.name, email: user.email },
      notes: { workspace: order.workspaceName },
      theme: { color: "#4F6DFF" },
      modal: {
        ondismiss: () => settle({ status: "dismissed" }),
      },
      handler: async (response) => {
        try {
          await apiFetchJson("/api/razorpay/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
          });
        } catch {
          // Verification is only the fast path. The webhook provisions this
          // payment regardless, so a failure here is not a failed purchase and
          // must not be reported as one.
        }
        settle({ status: "paid" });
      },
    });

    checkout.on("payment.failed", (payload: unknown) => {
      const description = (payload as { error?: { description?: string } })?.error?.description;
      settle({ status: "error", message: description ?? "The payment was declined." });
    });

    checkout.open();
  });
}
