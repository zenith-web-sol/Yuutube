import { Check, Crown, CreditCard, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/lib/AuthContext";
import axiosInstance from "@/lib/axiosinstance";

interface Plan {
  name: string;
  price: number;
  validityDays: number;
  quality: string;
  downloadsPerDay: number;
  benefits: string[];
}
interface Subscription {
  plan: string;
  status: string;
  startDate?: string;
  expiryDate?: string;
  renewalDate?: string;
  amount?: number;
}

const SubscriptionPage = () => {
  const { user } = useUser();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [razorpayConfigured, setRazorpayConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    try {
      const planResponse = await axiosInstance.get("/subscription/plans");
      setPlans(planResponse.data);
      if (user?._id) {
        const subscriptionResponse = await axiosInstance.get(
          `/subscription/${user._id}`,
        );
        setSubscription(subscriptionResponse.data.subscription);
        setTransactions(subscriptionResponse.data.transactions || []);
        setRazorpayConfigured(
          Boolean(subscriptionResponse.data.razorpayConfigured),
        );
      }
    } catch (error: any) {
      setMessage(
        error?.response?.data?.message ||
          "Unable to load subscription details.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [user?._id]);

  const activateDemo = async (plan: Plan) => {
    if (!user?._id) return setMessage("Sign in before subscribing.");
    if (plan.name === "Free") return;
    setWorking(plan.name);
    setMessage("");
    try {
      const response = await axiosInstance.post("/subscription/demo-activate", {
        userid: user._id,
        plan: plan.name,
      });
      setSubscription(response.data.subscription);
      setMessage(`${plan.name} demo subscription activated for 30 days.`);
      await load();
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Unable to activate plan.");
    } finally {
      setWorking("");
    }
  };

  const startRazorpay = async (plan: Plan) => {
    if (!user?._id) return setMessage("Sign in before subscribing.");
    setWorking(plan.name);
    setMessage("");
    try {
      const response = await axiosInstance.post("/subscription/create-order", {
        userid: user._id,
        plan: plan.name,
      });
      const Razorpay = (window as any).Razorpay;
      if (!Razorpay) {
        setMessage(
          "Razorpay checkout is unavailable. Add the checkout script or use demo activation.",
        );
        return;
      }
      const checkout = new Razorpay({
        key: response.data.keyId,
        amount: response.data.order.amount,
        currency: response.data.order.currency,
        name: "YuuTube",
        description: `${plan.name} membership`,
        order_id: response.data.order.id,
        handler: async (payment: any) => {
          const verified = await axiosInstance.post("/subscription/verify", {
            userid: user._id,
            plan: plan.name,
            ...payment,
          });
          setSubscription(verified.data.subscription);
          setMessage("Payment verified and subscription activated.");
          await load();
        },
        prefill: { name: user.name, email: user.email },
        theme: { color: "#dc2626" },
      });
      checkout.open();
    } catch (error: any) {
      setMessage(error?.response?.data?.message || "Unable to start payment.");
    } finally {
      setWorking("");
    }
  };

  const cancel = async () => {
    if (!user?._id) return;
    try {
      const response = await axiosInstance.post(
        `/subscription/${user._id}/cancel`,
      );
      setSubscription(response.data.subscription);
      setMessage(
        "Renewal cancelled. Your current access remains until expiry.",
      );
    } catch {
      setMessage("Unable to cancel subscription.");
    }
  };
  const formatDate = (value?: string) =>
    value
      ? new Date(value).toLocaleDateString("en-IN", { dateStyle: "medium" })
      : "—";

  return (
    <main className="min-w-0 flex-1 p-3 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Membership plans</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare features and manage your YuuTube subscription.
          </p>
        </div>
        {message && (
          <p className="rounded-md bg-muted p-3 text-sm">{message}</p>
        )}
        {subscription && (
          <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-100 p-2 text-red-600">
                  <Crown className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Current plan</p>
                  <h2 className="text-xl font-semibold">{subscription.plan}</h2>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm text-muted-foreground">Valid until</p>
                <p className="font-medium">
                  {formatDate(subscription.expiryDate)}
                </p>
                {subscription.plan !== "Free" &&
                  subscription.status === "active" && (
                    <Button variant="ghost" size="sm" onClick={cancel}>
                      Cancel renewal
                    </Button>
                  )}
              </div>
            </div>
          </section>
        )}
        {loading ? (
          <p>Loading plans...</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`flex flex-col rounded-lg border bg-card p-5 shadow-sm ${subscription?.plan === plan.name ? "border-red-500 ring-1 ring-red-500" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  {subscription?.plan === plan.name && (
                    <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-700">
                      Current
                    </span>
                  )}
                </div>
                <p className="mt-3 text-3xl font-bold">
                  ₹{plan.price}
                  <span className="text-sm font-normal text-muted-foreground">
                    {plan.price ? "/ month" : " forever"}
                  </span>
                </p>
                <ul className="my-5 flex-1 space-y-2 text-sm">
                  {plan.benefits.map((benefit) => (
                    <li key={benefit} className="flex gap-2">
                      <Check className="h-4 w-4 shrink-0 text-green-600" />
                      {benefit}
                    </li>
                  ))}
                </ul>
                {plan.name === "Free" ? (
                  <Button variant="outline" disabled>
                    Included
                  </Button>
                ) : subscription?.plan === plan.name &&
                  subscription.status === "active" ? (
                  <Button variant="outline" disabled>
                    Active
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      onClick={() =>
                        razorpayConfigured
                          ? startRazorpay(plan)
                          : activateDemo(plan)
                      }
                      disabled={Boolean(working)}
                    >
                      {working === plan.name
                        ? "Processing..."
                        : razorpayConfigured
                          ? "Pay with Razorpay Test"
                          : "Activate demo plan"}
                    </Button>
                    {!razorpayConfigured && (
                      <p className="text-center text-xs text-muted-foreground">
                        Demo mode — no real charge
                      </p>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
        <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            <div>
              <h2 className="font-semibold">Payment and access notes</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Premium access activates only after server-side verification.
                Razorpay is optional in this free-tier deployment; add test keys
                to the server environment to enable checkout.
              </p>
            </div>
          </div>
          {transactions.length > 0 && (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="p-2">Plan</th>
                    <th className="p-2">Amount</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((transaction) => (
                    <tr
                      key={transaction._id}
                      className="border-b last:border-0"
                    >
                      <td className="p-2">{transaction.plan}</td>
                      <td className="p-2">₹{transaction.amount}</td>
                      <td className="p-2 capitalize">{transaction.status}</td>
                      <td className="p-2">
                        {formatDate(transaction.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <CreditCard className="h-4 w-4" /> Test subscriptions are for
          demonstration only and do not process real money.
        </p>
      </div>
    </main>
  );
};

export default SubscriptionPage;
