import React, { useEffect, useState } from "react";
import { Star, MessageSquare, RefreshCw, ThumbsUp, Heart, Eye, EyeOff, Trash2, Utensils, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getIdToken } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { TablelineLoader } from "./TablelineLoading";

interface FeedbackViewProps {
  slug: string;
}

export function FeedbackView({ slug }: FeedbackViewProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"ALL" | "DISHES" | "GENERAL">("ALL");
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchFeedback = async () => {
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/feedback`, { headers });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch {
      // Graceful fallback
    } finally {
      setLoading(false);
    }
  };

  const handleToggleHidden = async (reviewId: string) => {
    setActionInProgress(reviewId);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/reviews/${reviewId}/toggle-hidden`, {
        method: "PATCH",
        headers,
      });

      if (res.ok) {
        const json = await res.json();
        setData((prev: any) => {
          if (!prev || !prev.items) return prev;
          const updatedItems = prev.items.map((it: any) =>
            it.id === reviewId ? { ...it, hidden: json.hidden } : it
          );
          return { ...prev, items: updatedItems };
        });
        toast({
          title: json.hidden ? "Review Hidden" : "Review Visible",
          description: json.hidden
            ? "This review is now hidden from the public customer menu."
            : "This review is now visible on the customer menu.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Action failed",
        description: "Could not update review visibility.",
      });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this review?")) return;
    setActionInProgress(reviewId);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(`/api/restaurants/${slug}/reviews/${reviewId}`, {
        method: "DELETE",
        headers,
      });

      if (res.ok) {
        setData((prev: any) => {
          if (!prev || !prev.items) return prev;
          const remaining = prev.items.filter((it: any) => it.id !== reviewId);
          return { ...prev, items: remaining, total: Math.max(0, (prev.total || 1) - 1) };
        });
        toast({
          title: "Review Removed",
          description: "The review has been permanently removed.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Deletion failed",
        description: "Could not delete this review.",
      });
    } finally {
      setActionInProgress(null);
    }
  };

  useEffect(() => {
    fetchFeedback();
  }, [slug]);

  if (loading) {
    return (
      <TablelineLoader
        variant="card"
        message="Gathering diner reviews & ratings…"
        subtext="Aggregating guest feedback, food scores and compliments…"
        onRetry={fetchFeedback}
      />
    );
  }

  const items = data?.items || [];
  const averageRating = Number(data?.averageRating ?? 5.0);
  const totalReviews = Number(data?.total ?? items.length);
  const distribution = data?.distribution ?? { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  const filteredItems = items.filter((it: any) => {
    if (activeTab === "DISHES") return Boolean(it.dishName || it.isDishReview);
    if (activeTab === "GENERAL") return !it.dishName && !it.isDishReview;
    return true;
  });

  return (
    <div className="space-y-6" id="feedback-view">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/70 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Star className="h-6 w-6 text-amber-500 fill-amber-500" />
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Diner Reviews & Ratings
            </h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real guest ratings, food feedback, and dish-specific reviews submitted by diners upon order completion.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchFeedback}
          className="rounded-xl h-8 text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Refresh Reviews
        </Button>
      </div>

      {/* Ratings Overview Card */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 rounded-2xl border border-border bg-card p-6 shadow-xs">
        {/* Average Score */}
        <div className="flex flex-col items-center justify-center text-center md:border-r md:border-border/70 pr-4">
          <p className="font-display text-5xl font-extrabold text-foreground">
            {averageRating.toFixed(1)}
          </p>
          <div className="mt-2 flex items-center gap-1 text-amber-500">
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`h-4 w-4 ${
                  s <= Math.round(averageRating)
                    ? "fill-amber-500 text-amber-500"
                    : "text-muted-foreground/40"
                }`}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Based on {totalReviews} dining {totalReviews === 1 ? "review" : "reviews"}
          </p>
        </div>

        {/* Rating Distribution Bars */}
        <div className="col-span-2 space-y-2 justify-center flex flex-col">
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = distribution[rating] || 0;
            const pct = totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0;
            return (
              <div key={rating} className="flex items-center gap-3 text-xs">
                <span className="w-12 font-medium text-foreground flex items-center gap-1">
                  {rating} <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                </span>
                <div className="h-2 flex-1 rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-10 text-right font-mono text-muted-foreground">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("ALL")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === "ALL" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          All Reviews ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("DISHES")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === "DISHES" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          <Utensils className="h-3 w-3" />
          Dish Reviews ({items.filter((i: any) => i.dishName || i.isDishReview).length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("GENERAL")}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
            activeTab === "GENERAL" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          }`}
        >
          <MessageSquare className="h-3 w-3" />
          General Hospitality
        </button>
      </div>

      {/* Reviews List */}
      <div>
        {filteredItems.length === 0 ? (
          <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center bg-card/40">
            <MessageSquare className="h-8 w-8 text-muted-foreground opacity-60" />
            <p className="mt-2 text-sm font-semibold text-foreground">No customer reviews in this tab</p>
            <p className="text-xs text-muted-foreground">
              Reviews will appear here automatically when guests rate their meal from their phone menu.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredItems.map((review: any, idx: number) => {
              const isHidden = review.hidden === true;
              return (
                <div
                  key={review.id || idx}
                  className={`rounded-2xl border p-5 shadow-2xs flex flex-col justify-between transition-all ${
                    isHidden ? "bg-muted/40 border-dashed border-border opacity-70" : "border-border bg-card"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className="flex items-center gap-0.5 text-amber-500">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`h-3.5 w-3.5 ${
                                s <= Number(review.rating || 5)
                                  ? "fill-amber-500 text-amber-500"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          ))}
                        </div>
                        {review.verified && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                            <ShieldCheck className="h-3 w-3" />
                            Verified
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {review.tableNumber && (
                          <span className="rounded-md bg-secondary px-2 py-0.5 font-semibold text-foreground">
                            Table {review.tableNumber}
                          </span>
                        )}
                        <span>
                          {review.createdAt ? new Date(review.createdAt).toLocaleDateString() : "Recent"}
                        </span>
                      </div>
                    </div>

                    {/* Dish Name Pill if specific dish review */}
                    {review.dishName && (
                      <div className="mt-2.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 text-xs font-semibold">
                          <Utensils className="h-3 w-3" />
                          {review.dishName}
                        </span>
                      </div>
                    )}

                    <p className="mt-2.5 text-sm text-foreground/90 italic">
                      "{review.comment || review.notes || "Rated dish"}"
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {isHidden ? (
                        <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                          Hidden from menu
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          Visible to guests
                        </span>
                      )}
                    </div>

                    {/* Moderation Controls */}
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={actionInProgress === review.id}
                        onClick={() => handleToggleHidden(review.id)}
                        className="h-7 px-2 text-xs"
                        title={isHidden ? "Unhide review" : "Hide from menu"}
                      >
                        {isHidden ? (
                          <>
                            <Eye className="h-3.5 w-3.5 mr-1 text-emerald-600" />
                            Unhide
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3.5 w-3.5 mr-1 text-stone-500" />
                            Hide
                          </>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={actionInProgress === review.id}
                        onClick={() => handleDeleteReview(review.id)}
                        className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                        title="Delete review"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
